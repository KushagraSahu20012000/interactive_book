from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .agent_tools import build_future_agent
from .book_init_ai import BookInitAI
from .config import (
    DEFAULT_AGE_GROUP,
    DEFAULT_LANGUAGE,
    DEFAULT_NEUROTYPE,
    DEFAULT_GROQ_MODEL,
    get_env,
    TTS_DEFAULT_LANGUAGE,
    TTS_ENGLISH_MODEL,
    TTS_ENGLISH_VOICE,
    TTS_HINDI_MODEL,
    TTS_HINDI_VOICE,
    TTS_MAX_TEXT_LENGTH,
    VALID_AGE_GROUPS,
    VALID_LANGUAGES,
    VALID_NEUROTYPES,
)
from .image_generator_ai import ImageGeneratorAI
from .page_generator_ai import PageGeneratorAI


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _configure_runtime_logging() -> None:
    """Ensure runtime logs are visible when launched via uvicorn shell scripts.

    Some environments default to WARNING on the root logger, which hides the
    INFO-level pipeline logs used for job/image observability.
    """
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )
        return

    if root_logger.level > logging.INFO:
        root_logger.setLevel(logging.INFO)


@dataclass
class JobState:
    job_id: str
    job_type: str
    topic: str
    description: str
    age_group: str
    neurotype: str
    language: str
    memory_key: str
    page_number: int
    status: str = "queued"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    error: str = ""
    book_title: str = ""
    title: str = ""
    action_item: str = ""
    sections: list[dict[str, Any]] = field(
        default_factory=lambda: [
            {
                "position": 1,
                "text": "",
                "image_prompt": "",
                "image_url": "",
                "image_status": "queued",
                "image_pixel_array": [],
                "image_width": 0,
                "image_height": 0,
            },
            {
                "position": 2,
                "text": "",
                "image_prompt": "",
                "image_url": "",
                "image_status": "queued",
                "image_pixel_array": [],
                "image_width": 0,
                "image_height": 0,
            },
            {
                "position": 3,
                "text": "",
                "image_prompt": "",
                "image_url": "",
                "image_status": "queued",
                "image_pixel_array": [],
                "image_width": 0,
                "image_height": 0,
            },
        ]
    )
    cover: dict[str, Any] = field(default_factory=lambda: {"pixel_array": [], "width": 0, "height": 0, "image_url": "", "prompt": "", "status": "queued"})
    pending_images: int = 0
    requires_cover: bool = False
    cover_ready: bool = False


@dataclass
class ImageTask:
    job_id: str
    prompt: str
    target: str
    section_index: Optional[int] = None
    width: int = 1024
    height: int = 1024


class CreateBookRequest(BaseModel):
    topic: str
    description: str = ""
    age_group: str = DEFAULT_AGE_GROUP
    neurotype: str = DEFAULT_NEUROTYPE
    language: str = DEFAULT_LANGUAGE
    memory_key: Optional[str] = None
    page_number: int = 1


class NextPageRequest(BaseModel):
    topic: str
    description: str = ""
    age_group: str = DEFAULT_AGE_GROUP
    neurotype: str = DEFAULT_NEUROTYPE
    language: str = DEFAULT_LANGUAGE
    memory_key: Optional[str] = None
    page_number: int


class TTSRequest(BaseModel):
    text: str
    language: str = TTS_DEFAULT_LANGUAGE
    voice: Optional[str] = None
    model: Optional[str] = None


class ProdGroqCheckRequest(BaseModel):
    prod_ai_url: str = "https://kush20sahu-bright-minds-ai.hf.space"
    topic: str = "Focus and Learning"
    description: str = "Give one practical study tip in plain language."
    age_group: str = DEFAULT_AGE_GROUP
    neurotype: str = DEFAULT_NEUROTYPE
    language: str = DEFAULT_LANGUAGE
    page_number: int = 1
    polls: int = 8
    poll_interval_seconds: float = 1.5


def _http_json(method: str, url: str, payload: Optional[dict[str, Any]] = None, timeout: int = 30) -> dict[str, Any]:
    request_body = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        request_body = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, data=request_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            parsed: Any
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"raw": raw}
            return {
                "ok": True,
                "status": response.status,
                "body": parsed,
            }
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw": raw}
        return {
            "ok": False,
            "status": error.code,
            "body": parsed,
        }
    except urllib.error.URLError as error:
        return {
            "ok": False,
            "status": 0,
            "body": {"error": f"Network error: {error.reason}"},
        }


def _local_groq_smoke_test(prompt: str) -> dict[str, Any]:
    api_key = get_env("GROQ_API_KEY")
    if not api_key:
        return {"ok": False, "error": "GROQ_API_KEY not configured locally"}

    try:
        from groq import Groq
    except ImportError:
        return {"ok": False, "error": "groq client not installed"}

    try:
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=DEFAULT_GROQ_MODEL,
            messages=[
                {"role": "system", "content": "Reply in one short sentence."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=80,
        )
        text = ""
        if completion.choices and completion.choices[0].message:
            text = completion.choices[0].message.content or ""
        return {
            "ok": True,
            "model": DEFAULT_GROQ_MODEL,
            "preview": text[:200],
        }
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "error": str(error)}


def _synthesize_speech(text: str, language: str = TTS_DEFAULT_LANGUAGE, voice: Optional[str] = None, model: Optional[str] = None) -> bytes:
    api_key = get_env("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")

    try:
        from groq import Groq
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="groq client not installed") from exc

    client = Groq(api_key=api_key)
    try:
        normalized_language = language if language in VALID_LANGUAGES else DEFAULT_LANGUAGE
        default_voice = TTS_HINDI_VOICE if normalized_language == "Hindi" else TTS_ENGLISH_VOICE
        default_model = TTS_HINDI_MODEL if normalized_language == "Hindi" else TTS_ENGLISH_MODEL
        model_name = model or default_model
        voice_name = voice or default_voice
        response = client.audio.speech.create(
            model=model_name,
            voice=voice_name,
            input=text,
            response_format="wav",
        )
        return response.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"TTS failed: {exc}") from exc


class Orchestrator:
    def __init__(self) -> None:
        self.jobs: dict[str, JobState] = {}
        self.page_queue: asyncio.Queue[str] = asyncio.Queue()
        self.book_queue: asyncio.Queue[str] = asyncio.Queue()
        self.image_queue: asyncio.Queue[ImageTask] = asyncio.Queue()
        self.lock = asyncio.Lock()

        self.page_ai = PageGeneratorAI()
        self.book_ai = BookInitAI()
        self.image_ai = ImageGeneratorAI()

        llm_for_agent = self.page_ai.llm or self.book_ai.llm
        self.future_agent = build_future_agent(llm_for_agent)

    def _touch(self, job: JobState, status: Optional[str] = None) -> None:
        if status:
            job.status = status
        job.updated_at = time.time()

    @staticmethod
    def _normalize_age_group(value: str) -> str:
        return value if value in VALID_AGE_GROUPS else DEFAULT_AGE_GROUP

    @staticmethod
    def _normalize_neurotype(value: str) -> str:
        return value if value in VALID_NEUROTYPES else DEFAULT_NEUROTYPE

    @staticmethod
    def _normalize_language(value: str) -> str:
        return value if value in VALID_LANGUAGES else DEFAULT_LANGUAGE

    async def enqueue_create_book(self, payload: CreateBookRequest) -> dict[str, str]:
        job_id = str(uuid.uuid4())
        job = JobState(
            job_id=job_id,
            job_type="create_book",
            topic=payload.topic,
            description=payload.description,
            age_group=self._normalize_age_group(payload.age_group),
            neurotype=self._normalize_neurotype(payload.neurotype),
            language=self._normalize_language(payload.language),
            memory_key=payload.memory_key or f"{payload.topic}:{payload.age_group}:{payload.neurotype}:{payload.language}",
            page_number=max(1, payload.page_number),
            requires_cover=True,
        )
        async with self.lock:
            self.jobs[job_id] = job
        logger.info(
            "enqueue_create_book job_id=%s topic=%s age_group=%s neurotype=%s language=%s page=%s",
            job_id,
            payload.topic,
            payload.age_group,
            payload.neurotype,
            payload.language,
            payload.page_number,
        )
        await self.page_queue.put(job_id)
        await self.book_queue.put(job_id)
        return {"job_id": job_id, "status": job.status}

    async def enqueue_next_page(self, payload: NextPageRequest) -> dict[str, str]:
        job_id = str(uuid.uuid4())
        job = JobState(
            job_id=job_id,
            job_type="next_page",
            topic=payload.topic,
            description=payload.description,
            age_group=self._normalize_age_group(payload.age_group),
            neurotype=self._normalize_neurotype(payload.neurotype),
            language=self._normalize_language(payload.language),
            memory_key=payload.memory_key or f"{payload.topic}:{payload.age_group}:{payload.neurotype}:{payload.language}",
            page_number=max(1, payload.page_number),
            requires_cover=False,
        )
        async with self.lock:
            self.jobs[job_id] = job
        logger.info(
            "enqueue_next_page job_id=%s topic=%s age_group=%s neurotype=%s language=%s page=%s",
            job_id,
            payload.topic,
            payload.age_group,
            payload.neurotype,
            payload.language,
            payload.page_number,
        )
        await self.page_queue.put(job_id)
        return {"job_id": job_id, "status": job.status}

    async def get_job_status(self, job_id: str) -> dict[str, Any]:
        async with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")

            return {
                "job_id": job.job_id,
                "status": job.status,
                "book_title": job.book_title,
                "title": job.title,
                "action_item": job.action_item,
                "cover": job.cover,
                "sections": job.sections,
                "error": job.error,
                "updated_at": job.updated_at,
                "page_number": job.page_number,
            }

    async def _maybe_complete(self, job: JobState) -> None:
        if not job.title:
            return
        if job.pending_images > 0:
            return
        if job.requires_cover and not job.cover_ready:
            return
        self._touch(job, "completed")

    async def page_loop(self) -> None:
        while True:
            job_id = await self.page_queue.get()
            try:
                started_at = time.perf_counter()
                async with self.lock:
                    job = self.jobs.get(job_id)
                    if not job:
                        logger.warning("page_loop missing job_id=%s", job_id)
                        continue
                    self._touch(job, "processing")
                    payload = {
                        "topic": job.topic,
                        "description": job.description,
                        "age_group": job.age_group,
                        "neurotype": job.neurotype,
                        "language": job.language,
                        "memory_key": job.memory_key,
                        "page_number": job.page_number,
                    }
                logger.info("page_loop start job_id=%s page=%s", job_id, payload["page_number"])

                page_result = await self.page_ai.generate_page(payload)

                async with self.lock:
                    job = self.jobs.get(job_id)
                    if not job:
                        continue
                    job.title = page_result.title
                    job.action_item = page_result.action_item
                    job.error = page_result.error_message or ""
                    job.pending_images = 3
                    for idx, section in enumerate(page_result.sections):
                        job.sections[idx]["text"] = section.text
                        job.sections[idx]["image_prompt"] = section.image_prompt
                        job.sections[idx]["image_status"] = "queued"
                    self._touch(job, "text_ready")
                logger.info(
                    "page_loop text_ready job_id=%s title=%s pending_images=%s",
                    job_id,
                    page_result.title,
                    3,
                )

                for idx, section in enumerate(page_result.sections):
                    logger.info(
                        "page_loop enqueue_image job_id=%s section=%s prompt=%s",
                        job_id,
                        idx + 1,
                        section.image_prompt[:160],
                    )
                    await self.image_queue.put(
                        ImageTask(
                            job_id=job_id,
                            prompt=section.image_prompt,
                            target="section",
                            section_index=idx,
                            width=1024,
                            height=768,
                        )
                    )
                logger.info("page_loop done job_id=%s elapsed_ms=%.1f", job_id, (time.perf_counter() - started_at) * 1000)
            except Exception as error:  # noqa: BLE001
                async with self.lock:
                    job = self.jobs.get(job_id)
                    if job:
                        job.error = str(error)
                        self._touch(job, "failed")
                logger.exception("page_loop failed job_id=%s error=%s", job_id, error)
            finally:
                self.page_queue.task_done()

    async def book_loop(self) -> None:
        while True:
            job_id = await self.book_queue.get()
            try:
                started_at = time.perf_counter()
                async with self.lock:
                    job = self.jobs.get(job_id)
                    if not job:
                        logger.warning("book_loop missing job_id=%s", job_id)
                        continue
                    payload = {
                        "topic": job.topic,
                        "description": job.description,
                        "age_group": job.age_group,
                        "neurotype": job.neurotype,
                        "language": job.language,
                    }
                logger.info("book_loop start job_id=%s topic=%s", job_id, payload["topic"])

                init_result = await self.book_ai.generate_book_init(payload)

                async with self.lock:
                    job = self.jobs.get(job_id)
                    if not job:
                        continue
                    job.book_title = init_result.title
                    job.error = getattr(init_result, "error_message", "") or job.error
                    job.cover["prompt"] = init_result.cover_prompt
                    job.cover["status"] = "queued"
                    self._touch(job)
                logger.info("book_loop cover_queued job_id=%s title=%s", job_id, init_result.title)

                await self.image_queue.put(
                    ImageTask(
                        job_id=job_id,
                        prompt=init_result.cover_prompt,
                        target="cover",
                        width=1024,
                        height=1448,
                    )
                )
                logger.info("book_loop done job_id=%s elapsed_ms=%.1f", job_id, (time.perf_counter() - started_at) * 1000)
            except Exception as error:  # noqa: BLE001
                async with self.lock:
                    job = self.jobs.get(job_id)
                    if job:
                        job.error = str(error)
                        self._touch(job, "failed")
                logger.exception("book_loop failed job_id=%s error=%s", job_id, error)
            finally:
                self.book_queue.task_done()

    async def image_loop(self) -> None:
        while True:
            task = await self.image_queue.get()
            try:
                started_at = time.perf_counter()
                async with self.lock:
                    job = self.jobs.get(task.job_id)
                    if not job:
                        logger.warning("image_loop missing job_id=%s target=%s", task.job_id, task.target)
                        continue
                    if task.target == "section" and task.section_index is not None:
                        job.sections[task.section_index]["image_status"] = "generating"
                    if task.target == "cover":
                        job.cover["status"] = "generating"
                    self._touch(job)
                logger.info(
                    "image_loop start job_id=%s target=%s section=%s source=%s prompt=%s",
                    task.job_id,
                    task.target,
                    task.section_index + 1 if task.section_index is not None else 0,
                    self.image_ai.image_source,
                    task.prompt[:160],
                )

                payload = await self.image_ai.generate_payload(task.prompt, width=task.width, height=task.height)

                async with self.lock:
                    job = self.jobs.get(task.job_id)
                    if not job:
                        continue

                    if task.target == "section" and task.section_index is not None:
                        section = job.sections[task.section_index]
                        section["image_pixel_array"] = payload["pixel_array"]
                        section["image_width"] = payload["width"]
                        section["image_height"] = payload["height"]
                        section["image_url"] = payload.get("image_url", "")
                        if payload.get("notice"):
                            section["image_prompt"] = payload["notice"]
                        section["image_status"] = "ready"
                        job.pending_images = max(0, job.pending_images - 1)
                        logger.info(
                            "image_loop section_ready job_id=%s section=%s image_url=%s dims=%sx%s pending_images=%s",
                            task.job_id,
                            task.section_index + 1,
                            bool(payload.get("image_url")),
                            payload.get("width", 0),
                            payload.get("height", 0),
                            job.pending_images,
                        )

                    if task.target == "cover":
                        job.cover["pixel_array"] = payload["pixel_array"]
                        job.cover["width"] = payload["width"]
                        job.cover["height"] = payload["height"]
                        job.cover["image_url"] = payload.get("image_url", "")
                        if payload.get("notice"):
                            job.cover["prompt"] = payload["notice"]
                        job.cover["status"] = "ready"
                        job.cover_ready = True
                        logger.info(
                            "image_loop cover_ready job_id=%s image_url=%s dims=%sx%s",
                            task.job_id,
                            bool(payload.get("image_url")),
                            payload.get("width", 0),
                            payload.get("height", 0),
                        )

                    await self._maybe_complete(job)
                logger.info("image_loop done job_id=%s target=%s elapsed_ms=%.1f", task.job_id, task.target, (time.perf_counter() - started_at) * 1000)
            except Exception as error:  # noqa: BLE001
                async with self.lock:
                    job = self.jobs.get(task.job_id)
                    if job:
                        job.error = str(error)
                        self._touch(job, "failed")
                logger.exception(
                    "image_loop failed job_id=%s target=%s section=%s error=%s",
                    task.job_id,
                    task.target,
                    task.section_index + 1 if task.section_index is not None else 0,
                    error,
                )
            finally:
                self.image_queue.task_done()

    async def start_workers(self) -> None:
        page_workers = 2
        book_workers = 2
        image_workers = 4
        logger.info(
            "start_workers page_workers=%s book_workers=%s image_workers=%s image_source=%s",
            page_workers,
            book_workers,
            image_workers,
            self.image_ai.image_source,
        )

        for _ in range(page_workers):
            asyncio.create_task(self.page_loop())
        for _ in range(book_workers):
            asyncio.create_task(self.book_loop())
        for _ in range(image_workers):
            asyncio.create_task(self.image_loop())


def create_app() -> FastAPI:
    _configure_runtime_logging()
    app = FastAPI(title="Interactive Book AI Layer", version="2.0.0")
    orchestrator = Orchestrator()

    @app.on_event("startup")
    async def startup() -> None:
        await orchestrator.start_workers()

    @app.get("/")
    async def root() -> dict[str, Any]:
        return {
            "service": "bright-minds-ai",
            "status": "ok",
            "health": "/health",
            "docs": "/docs",
        }

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "jobs": len(orchestrator.jobs),
            "future_agent_enabled": orchestrator.future_agent is not None,
            "groq_configured": bool(get_env("GROQ_API_KEY")),
            "groq_model": DEFAULT_GROQ_MODEL,
            "image_source": orchestrator.image_ai.image_source,
            "hf_image_configured": orchestrator.image_ai.hf_client is not None,
        }

    @app.post("/jobs/create-book")
    async def create_book_job(payload: CreateBookRequest) -> dict[str, str]:
        return await orchestrator.enqueue_create_book(payload)

    @app.post("/jobs/next-page")
    async def next_page_job(payload: NextPageRequest) -> dict[str, str]:
        return await orchestrator.enqueue_next_page(payload)

    @app.get("/jobs/{job_id}")
    async def job_status(job_id: str) -> dict[str, Any]:
        return await orchestrator.get_job_status(job_id)

    @app.post("/tts")
    async def tts(payload: TTSRequest) -> Response:
        text = (payload.text or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="text is required")
        if len(text) > TTS_MAX_TEXT_LENGTH:
            text = text[:TTS_MAX_TEXT_LENGTH]
        audio_bytes = await asyncio.to_thread(_synthesize_speech, text, payload.language, payload.voice, payload.model)
        return Response(content=audio_bytes, media_type="audio/wav")

    @app.post("/debug/prod-groq-check")
    async def prod_groq_check(payload: ProdGroqCheckRequest) -> dict[str, Any]:
        base_url = payload.prod_ai_url.strip().rstrip("/")
        local_check = await asyncio.to_thread(_local_groq_smoke_test, payload.description or payload.topic)

        create_payload = {
            "topic": payload.topic,
            "description": payload.description,
            "age_group": payload.age_group,
            "neurotype": payload.neurotype,
            "language": payload.language,
            "memory_key": f"prod-key-check:{uuid.uuid4()}",
            "page_number": max(1, payload.page_number),
        }

        create_result = await asyncio.to_thread(_http_json, "POST", f"{base_url}/jobs/create-book", create_payload)
        if not create_result["ok"]:
            return {
                "local_groq": local_check,
                "prod_submit": create_result,
                "conclusion": "Could not submit production job",
            }

        job_id = str(create_result.get("body", {}).get("job_id", ""))
        if not job_id:
            return {
                "local_groq": local_check,
                "prod_submit": create_result,
                "conclusion": "Production submit response did not include job_id",
            }

        polls: list[dict[str, Any]] = []
        latest: dict[str, Any] = {}
        poll_count = max(1, min(payload.polls, 20))
        sleep_seconds = max(0.2, min(payload.poll_interval_seconds, 10.0))

        for _ in range(poll_count):
            latest = await asyncio.to_thread(_http_json, "GET", f"{base_url}/jobs/{job_id}", None)
            polls.append(latest)
            if latest.get("ok"):
                status = str(latest.get("body", {}).get("status", ""))
                if status in {"completed", "failed"}:
                    break
            await asyncio.sleep(sleep_seconds)

        prod_body = latest.get("body", {}) if isinstance(latest.get("body"), dict) else {}
        prod_error = str(prod_body.get("error", ""))
        prod_error_lower = prod_error.lower()
        prod_text = " ".join(
            [
                str(prod_body.get("title", "")),
                str(prod_body.get("action_item", "")),
                " ".join(str(section.get("text", "")) for section in prod_body.get("sections", [])),
            ]
        )
        fallback_text = "free tier expired. request upgrade!"
        has_fallback = fallback_text in prod_text.lower()
        invalid_key = "invalid api key" in prod_error_lower or "invalid_api_key" in prod_error_lower
        invalid_hf_image_token = (
            "invalid or expired token" in prod_error_lower
            or ("nscale" in prod_error_lower and "unauthorized" in prod_error_lower)
            or ("inference.api.nscale.com" in prod_error_lower and "401" in prod_error_lower)
        )

        if local_check.get("ok") and has_fallback and invalid_key:
            conclusion = "Local GROQ key works, production GROQ key/config is likely invalid"
        elif local_check.get("ok") and invalid_hf_image_token:
            conclusion = "Production HF/Nscale image token is invalid or expired"
        elif not local_check.get("ok"):
            conclusion = "Local GROQ check failed; fix local key first"
        else:
            conclusion = "No definitive key mismatch detected"

        return {
            "local_groq": local_check,
            "prod_submit": create_result,
            "prod_latest": latest,
            "prod_job_id": job_id,
            "prod_error_excerpt": prod_error[:400],
            "prod_fallback_detected": has_fallback,
            "prod_invalid_key_detected": invalid_key,
            "prod_invalid_hf_image_token_detected": invalid_hf_image_token,
            "conclusion": conclusion,
        }

    return app
