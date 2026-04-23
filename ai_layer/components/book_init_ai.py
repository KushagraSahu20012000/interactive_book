from __future__ import annotations

import os
from typing import Any, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, START, StateGraph
from langchain_groq import ChatGroq

from .schemas import BookInitOutput


ERROR_FALLBACK_TEXT = "Free Tier Limit Reached. Buy Subscription to have a full experience"


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
        self.model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.prompt = ChatPromptTemplate.from_template(BOOK_INIT_PROMPT)

        self.llm = ChatGroq(model=self.model_name, api_key=self.groq_api_key, temperature=0.6) if self.groq_api_key else None
        self.chain = self._build_chain()
        self.graph = self._build_graph()

    def _normalize_inputs(self, payload: dict[str, Any]) -> dict[str, Any]:
        age_group = payload.get("age_group", "15-20")
        neurotype = payload.get("neurotype", "None")
        language = payload.get("language", "English")
        valid_age = {"5-10", "10-15", "15-20", "20+"}
        valid_neuro = {"ADHD", "Dyslexia", "Autism", "None"}
        valid_language = {"English", "Hindi"}
        normalized_language = language if language in valid_language else "English"
        return {
            "topic": payload.get("topic", "General Learning"),
            "description": payload.get("description", "") or "",
            "age_group": age_group if age_group in valid_age else "15-20",
            "neurotype": neurotype if neurotype in valid_neuro else "None",
            "language": normalized_language,
            "language_style_instruction": "Native everyday speaking hindi" if normalized_language == "Hindi" else "",
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

    def _fallback_output(self, payload: dict[str, Any]) -> BookInitOutput:
        topic = payload["topic"]
        title = f"{topic} Quest"
        cover_prompt = (
            f"A4 portrait colorful educational kids cover about {topic}, high-contrast playful shapes, "
            "happy learners exploring concept objects, clean outlines, text-safe zone at top for title"
        )
        return BookInitOutput(title=title, cover_prompt=cover_prompt)

    def _error_fallback_output(self) -> BookInitOutput:
        return BookInitOutput(
            title=ERROR_FALLBACK_TEXT,
            cover_prompt="student reading subscription required message",
        )

    async def generate_book_init(self, payload: dict[str, Any]) -> BookInitOutput:
        try:
            state = await self.graph.ainvoke({"payload": payload})
            result = state["result"]
            if not result.title:
                return self._fallback_output(self._normalize_inputs(payload))
            return result
        except Exception:  # noqa: BLE001
            return self._error_fallback_output()
