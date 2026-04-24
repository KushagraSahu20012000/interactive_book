from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import urllib.parse
import urllib.request
from typing import Any

import numpy as np
from huggingface_hub import InferenceClient
from PIL import Image, ImageDraw

from .config import get_env


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class ImageGeneratorAI:
    """Shared image generation service used by page and book workers."""

    def __init__(self) -> None:
        hold_images = get_env("HOLD_IMAGE_GENERATION", "false").lower()
        self.hold_image_generation = hold_images in {"1", "true", "yes", "on"}

        self.image_source = get_env("IMAGE_SOURCE", "pexels").lower()
        self.pexels_api_key = get_env("PEXELS_API_KEY")

        hf_api_key = get_env("HF_TOKEN") or get_env("HF_API_KEY")
        self.hf_provider = get_env("HF_PROVIDER", "nscale")
        self.hf_model = get_env("HF_IMAGE_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
        self.hf_client = InferenceClient(provider=self.hf_provider, api_key=hf_api_key) if hf_api_key else None
        logger.info(
            "image_generator init hold=%s image_source=%s pexels_key=%s hf_provider=%s hf_model=%s hf_configured=%s",
            self.hold_image_generation,
            self.image_source,
            bool(self.pexels_api_key),
            self.hf_provider,
            self.hf_model,
            self.hf_client is not None,
        )

    async def generate_payload(
        self,
        prompt: str,
        *,
        width: int,
        height: int,
        size: int = 64,
        rank: int = 10,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        logger.info(
            "generate_payload start source=%s width=%s height=%s prompt=%s",
            self.image_source,
            width,
            height,
            (prompt or "")[:180],
        )
        if self.hold_image_generation:
            logger.info("generate_payload hold_image_generation active; returning empty payload")
            return {
                "pixel_array": [],
                "width": 0,
                "height": 0,
                "image_url": "",
            }

        if self.image_source == "pexels":
            image_url = await asyncio.to_thread(self._pexels_image_link, prompt)
            if image_url:
                logger.info("generate_payload pexels_hit image_url=%s", image_url[:160])
                return {
                    "pixel_array": [],
                    "width": 0,
                    "height": 0,
                    "image_url": image_url,
                }
            logger.warning("generate_payload pexels_miss; falling back to model generation")
            image = await asyncio.to_thread(self._generate_image, prompt, width, height)
            payload = await asyncio.to_thread(self._low_rank_pixel_array, image, size, rank)
            logger.info("generate_payload done source=model_fallback elapsed_ms=%.1f", (time.perf_counter() - started_at) * 1000)
            return payload

        image = await asyncio.to_thread(self._generate_image, prompt, width, height)
        payload = await asyncio.to_thread(self._low_rank_pixel_array, image, size, rank)
        logger.info("generate_payload done source=%s elapsed_ms=%.1f", self.image_source, (time.perf_counter() - started_at) * 1000)
        return payload

    def _pexels_image_link(self, prompt: str) -> str:
        if not self.pexels_api_key:
            logger.warning("_pexels_image_link skipped: PEXELS_API_KEY missing")
            return ""

        base_url = "https://api.pexels.com/v1/search"
        query = urllib.parse.urlencode(
            {
                "query": prompt,
                "per_page": "1",
            }
        )
        url = f"{base_url}?{query}"

        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": self.pexels_api_key,
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as response:  # noqa: S310
                data = json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001
            logger.warning("_pexels_image_link request_failed error=%s", error)
            return ""

        photos = data.get("photos") or []
        if not photos:
            logger.info("_pexels_image_link no_photos prompt=%s", (prompt or "")[:120])
            return ""

        src = photos[0].get("src") or {}
        link = str(src.get("large2x") or src.get("large") or src.get("original") or "").strip()
        if link.startswith("http://") or link.startswith("https://"):
            logger.info("_pexels_image_link selected_url=%s", link[:160])
            return link
        logger.info("_pexels_image_link invalid_url_from_api")
        return ""

    def _generate_image(self, prompt: str, width: int, height: int) -> Image.Image:
        if self.hf_client:
            logger.info("_generate_image hf_request provider=%s model=%s size=%sx%s", self.hf_provider, self.hf_model, width, height)
            return self.hf_client.text_to_image(prompt, model=self.hf_model, width=width, height=height)

        logger.warning("_generate_image hf_client_missing using_local_fallback_art")
        fallback = Image.new("RGB", (width, height), (245, 240, 190))
        draw = ImageDraw.Draw(fallback)
        draw.rectangle((50, 50, width - 50, height - 50), outline=(20, 20, 20), width=8)
        draw.text((80, 100), "HF key missing - fallback art", fill=(20, 20, 20))
        draw.text((80, 170), prompt[:120], fill=(20, 20, 20))
        return fallback

    def _low_rank_pixel_array(self, image: Image.Image, size: int, rank: int) -> dict[str, Any]:
        image = image.convert("RGB").resize((size, size), Image.Resampling.BILINEAR)
        arr = np.asarray(image).astype(np.float32)

        channels = []
        for channel in range(3):
            matrix = arr[:, :, channel]
            u, s, vt = np.linalg.svd(matrix, full_matrices=False)
            r = min(rank, len(s))
            approx = (u[:, :r] * s[:r]) @ vt[:r, :]
            channels.append(np.clip(approx, 0, 255))

        reduced = np.stack(channels, axis=-1).astype(np.uint8)
        packed = (
            (reduced[:, :, 0].astype(np.uint32) << 16)
            + (reduced[:, :, 1].astype(np.uint32) << 8)
            + reduced[:, :, 2].astype(np.uint32)
        )

        return {
            "pixel_array": packed.tolist(),
            "width": int(reduced.shape[1]),
            "height": int(reduced.shape[0]),
            "image_url": "",
        }
