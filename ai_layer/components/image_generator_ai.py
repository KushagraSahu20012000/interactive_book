from __future__ import annotations

import asyncio
import json
import os
import urllib.parse
import urllib.request
from typing import Any

import numpy as np
from huggingface_hub import InferenceClient
from PIL import Image, ImageDraw

from .config import get_env


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

    async def generate_payload(
        self,
        prompt: str,
        *,
        width: int,
        height: int,
        size: int = 64,
        rank: int = 10,
    ) -> dict[str, Any]:
        if self.hold_image_generation:
            return {
                "pixel_array": [],
                "width": 0,
                "height": 0,
                "image_url": "",
            }

        if self.image_source == "pexels":
            image_url = await asyncio.to_thread(self._pexels_image_link, prompt)
            if image_url:
                return {
                    "pixel_array": [],
                    "width": 0,
                    "height": 0,
                    "image_url": image_url,
                }
            image = await asyncio.to_thread(self._generate_image, prompt, width, height)
            return await asyncio.to_thread(self._low_rank_pixel_array, image, size, rank)

        image = await asyncio.to_thread(self._generate_image, prompt, width, height)
        return await asyncio.to_thread(self._low_rank_pixel_array, image, size, rank)

    def _pexels_image_link(self, prompt: str) -> str:
        if not self.pexels_api_key:
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
        except Exception:  # noqa: BLE001
            return ""

        photos = data.get("photos") or []
        if not photos:
            return ""

        src = photos[0].get("src") or {}
        link = str(src.get("large2x") or src.get("large") or src.get("original") or "").strip()
        if link.startswith("http://") or link.startswith("https://"):
            return link
        return ""

    def _generate_image(self, prompt: str, width: int, height: int) -> Image.Image:
        if self.hf_client:
            return self.hf_client.text_to_image(prompt, model=self.hf_model, width=width, height=height)

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
