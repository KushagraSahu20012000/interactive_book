from __future__ import annotations

import logging
from typing import Any, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, START, StateGraph
from langchain_groq import ChatGroq

from .config import (
    DEFAULT_AGE_GROUP,
    DEFAULT_GROQ_MODEL,
    DEFAULT_LANGUAGE,
    DEFAULT_NEUROTYPE,
    get_env,
    HINDI_STYLE_INSTRUCTION,
    VALID_AGE_GROUPS,
    VALID_LANGUAGES,
    VALID_NEUROTYPES,
)
from .schemas import BookInitOutput


logger = logging.getLogger(__name__)


BOOK_INIT_PROMPT = """
[Language : {language}]
{language_style_instruction}

You are initializing a new adaptive educational book.

Input:
- Topic: {topic}
- Description context: {description}
- Age group: {age_group}
- Neurotype: {neurotype}

Return structured output with:
1) exactly one book title suitable for a progressive learning series.
2) one detailed cover prompt for a kid-friendly, colorful, high-contrast educational cover illustration.

Constraints:
- No markdown, no explanations.
- Keep the title short and memorable.
- Cover prompt must describe visible scene composition, style, and mood.
"""


class BookInitState(TypedDict, total=False):
    payload: dict[str, Any]
    normalized: dict[str, Any]
    result: BookInitOutput


class BookInitAI:
    def __init__(self) -> None:
        self.model_name = DEFAULT_GROQ_MODEL
        self.groq_api_key = get_env("GROQ_API_KEY")
        self.prompt = ChatPromptTemplate.from_template(BOOK_INIT_PROMPT)

        self.llm = ChatGroq(model=self.model_name, api_key=self.groq_api_key, temperature=0.6) if self.groq_api_key else None
        self.chain = self._build_chain()
        self.graph = self._build_graph()

    def _normalize_inputs(self, payload: dict[str, Any]) -> dict[str, Any]:
        age_group = payload.get("age_group", DEFAULT_AGE_GROUP)
        neurotype = payload.get("neurotype", DEFAULT_NEUROTYPE)
        language = payload.get("language", DEFAULT_LANGUAGE)
        normalized_language = language if language in VALID_LANGUAGES else DEFAULT_LANGUAGE
        return {
            "topic": payload.get("topic", "General Learning"),
            "description": payload.get("description", "") or "",
            "age_group": age_group if age_group in VALID_AGE_GROUPS else DEFAULT_AGE_GROUP,
            "neurotype": neurotype if neurotype in VALID_NEUROTYPES else DEFAULT_NEUROTYPE,
            "language": normalized_language,
            "language_style_instruction": HINDI_STYLE_INSTRUCTION if normalized_language == "Hindi" else "",
        }

    def _build_chain(self):
        normalize = RunnableLambda(self._normalize_inputs)
        if self.llm:
            return normalize | self.prompt | self.llm.with_structured_output(BookInitOutput)
        return normalize | RunnableLambda(lambda payload: self._fallback_output(payload))

    def _build_graph(self):
        graph_builder = StateGraph(BookInitState)

        async def prepare_node(state: BookInitState) -> BookInitState:
            normalized = self._normalize_inputs(state["payload"])
            return {"normalized": normalized}

        async def generate_node(state: BookInitState) -> BookInitState:
            result = await self.chain.ainvoke(state["normalized"])
            return {"result": result}

        graph_builder.add_node("prepare", prepare_node)
        graph_builder.add_node("generate", generate_node)
        graph_builder.add_edge(START, "prepare")
        graph_builder.add_edge("prepare", "generate")
        graph_builder.add_edge("generate", END)
        return graph_builder.compile()

    def _fallback_output(self, payload: dict[str, Any], error_message: str = "") -> BookInitOutput:
        topic = payload["topic"]
        title = f"{topic} Quest"
        cover_prompt = (
            f"A4 portrait colorful educational kids cover about {topic}, high-contrast playful shapes, "
            "happy learners exploring concept objects, clean outlines, text-safe zone at top for title"
        )
        return BookInitOutput(title=title, cover_prompt=cover_prompt, error_message=error_message)

    def _error_fallback_output(self, payload: dict[str, Any], error_message: str = "") -> BookInitOutput:
        return self._fallback_output(payload, error_message)

    async def generate_book_init(self, payload: dict[str, Any]) -> BookInitOutput:
        try:
            state = await self.graph.ainvoke({"payload": payload})
            result = state["result"]
            if not result.title:
                return self._fallback_output(self._normalize_inputs(payload), "Book init returned empty title")
            return result
        except Exception as error:  # noqa: BLE001
            logger.exception("Book init generation failed", extra={"model": self.model_name})
            normalized = self._normalize_inputs(payload)
            return self._error_fallback_output(normalized, str(error))
