import asyncio
from contextlib import suppress

from components.book_init_ai import BookInitAI
from components.orchestrator import CreateBookRequest, NextPageRequest, Orchestrator
from components.image_generator_ai import ImageGeneratorAI
from components.page_generator_ai import PageGeneratorAI
from components.schemas import PageGenerationOutput, PageSectionDraft


def test_page_generator_fallback_shape():
    page_ai = PageGeneratorAI()
    result = asyncio.run(
        page_ai.generate_page(
            {
                "topic": "Fractions",
                "description": "pizza slicing",
                "age_group": "10-15",
                "neurotype": "ADHD",
                "page_number": 1,
            }
        )
    )

    assert isinstance(result.title, str)
    assert len(result.sections) == 3
    assert all(section.text for section in result.sections)
    assert all(section.image_prompt for section in result.sections)


def test_book_init_fallback_shape():
    book_ai = BookInitAI()
    result = asyncio.run(
        book_ai.generate_book_init(
            {
                "topic": "Fractions",
                "description": "pizza slicing",
                "age_group": "10-15",
                "neurotype": "ADHD",
            }
        )
    )
    assert result.title
    assert result.cover_prompt


def test_image_generator_payload_shape(monkeypatch):
    monkeypatch.setenv("HOLD_IMAGE_GENERATION", "false")
    monkeypatch.setenv("HF_TOKEN", "")
    monkeypatch.setenv("HF_API_KEY", "")
    monkeypatch.setenv("IMAGE_SOURCE", "fallback_local")
    monkeypatch.setenv("GOOGLE_SEARCH_API_KEY", "")
    monkeypatch.setenv("GOOGLE_CSE_ID", "")
    image_ai = ImageGeneratorAI()
    payload = asyncio.run(
        image_ai.generate_payload(
            "student sharing equal pizza slices",
            width=320,
            height=240,
            size=32,
            rank=8,
        )
    )
    assert payload["width"] == 32
    assert payload["height"] == 32
    assert len(payload["pixel_array"]) == 32


def test_orchestrator_next_page_flow_with_mocks(monkeypatch):
    orchestrator = Orchestrator()

    async def fake_generate_page(_):
        return PageGenerationOutput(
            title="Fraction Steps",
            sections=[
                PageSectionDraft(position=1, text="One whole can be split.", image_prompt="student holding full pizza"),
                PageSectionDraft(position=2, text="Two halves make one whole.", image_prompt="pizza cut into two halves"),
                PageSectionDraft(position=3, text="Four quarters are equal parts.", image_prompt="pizza cut into four quarters"),
            ],
        )

    async def fake_generate_payload(*args, **kwargs):
        return {"pixel_array": [[123]], "width": 1, "height": 1}

    monkeypatch.setattr(orchestrator.page_ai, "generate_page", fake_generate_page)
    monkeypatch.setattr(orchestrator.image_ai, "generate_payload", fake_generate_payload)

    async def run_case():
        response = await orchestrator.enqueue_next_page(
            NextPageRequest(topic="Fractions", description="", age_group="bad", neurotype="bad", page_number=0)
        )
        job_id = response["job_id"]

        page_task = asyncio.create_task(orchestrator.page_loop())
        image_task = asyncio.create_task(orchestrator.image_loop())

        try:
            for _ in range(20):
                status = await orchestrator.get_job_status(job_id)
                if status["status"] == "completed":
                    break
                await asyncio.sleep(0.05)

            final_status = await orchestrator.get_job_status(job_id)
            assert final_status["status"] == "completed"
            assert final_status["title"] == "Fraction Steps"
            assert final_status["sections"][0]["image_status"] == "ready"
            assert orchestrator.jobs[job_id].age_group == "15-20"
            assert orchestrator.jobs[job_id].neurotype == "None"
            assert orchestrator.jobs[job_id].page_number == 1
        finally:
            page_task.cancel()
            image_task.cancel()
            with suppress(asyncio.CancelledError):
                await page_task
            with suppress(asyncio.CancelledError):
                await image_task

    asyncio.run(run_case())


def test_orchestrator_create_book_flow_with_mocks(monkeypatch):
    orchestrator = Orchestrator()

    async def fake_generate_page(_):
        return PageGenerationOutput(
            title="Fraction Starter",
            sections=[
                PageSectionDraft(position=1, text="Start with one whole.", image_prompt="full pizza on table"),
                PageSectionDraft(position=2, text="Split into equal parts.", image_prompt="pizza sliced evenly"),
                PageSectionDraft(position=3, text="Compare part sizes.", image_prompt="students comparing slices"),
            ],
        )

    async def fake_generate_book_init(_):
        return type("X", (), {
            "title": "Fraction Journey",
            "cover_prompt": "colorful classroom cover with fraction visuals",
        })()

    async def fake_generate_payload(*args, **kwargs):
        return {"pixel_array": [[999]], "width": 1, "height": 1}

    monkeypatch.setattr(orchestrator.page_ai, "generate_page", fake_generate_page)
    monkeypatch.setattr(orchestrator.book_ai, "generate_book_init", fake_generate_book_init)
    monkeypatch.setattr(orchestrator.image_ai, "generate_payload", fake_generate_payload)

    async def run_case():
        response = await orchestrator.enqueue_create_book(
            CreateBookRequest(topic="Fractions", description="", age_group="10-15", neurotype="None", page_number=1)
        )
        job_id = response["job_id"]

        page_task = asyncio.create_task(orchestrator.page_loop())
        book_task = asyncio.create_task(orchestrator.book_loop())
        image_task = asyncio.create_task(orchestrator.image_loop())

        try:
            for _ in range(30):
                status = await orchestrator.get_job_status(job_id)
                if status["status"] == "completed":
                    break
                await asyncio.sleep(0.05)

            final_status = await orchestrator.get_job_status(job_id)
            assert final_status["status"] == "completed"
            assert final_status["book_title"] == "Fraction Journey"
            assert final_status["cover"]["status"] == "ready"
        finally:
            page_task.cancel()
            book_task.cancel()
            image_task.cancel()
            with suppress(asyncio.CancelledError):
                await page_task
            with suppress(asyncio.CancelledError):
                await book_task
            with suppress(asyncio.CancelledError):
                await image_task

    asyncio.run(run_case())