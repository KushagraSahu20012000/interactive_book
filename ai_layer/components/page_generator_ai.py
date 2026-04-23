from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, START, StateGraph
from langchain_groq import ChatGroq

from .config import (
    AGE_TEMPERATURES,
    DEFAULT_AGE_GROUP,
    DEFAULT_GROQ_MODEL,
    DEFAULT_LANGUAGE,
    DEFAULT_NEUROTYPE,
    get_env,
    HINDI_STYLE_INSTRUCTION,
    PAGE_MEMORY_LIMIT,
    VALID_AGE_GROUPS,
    VALID_LANGUAGES,
    VALID_NEUROTYPES,
)
from .schemas import PageGenerationOutput, PageSectionDraft


ERROR_FALLBACK_TEXT = "Free Tier Expired. Request Upgrade!"


logger = logging.getLogger(__name__)

# ── Few-shot examples loaded from JSON ───────────────────────────────────────
_FEW_SHOTS_PATH = Path(__file__).parent / "few_shots.json"
with _FEW_SHOTS_PATH.open("r", encoding="utf-8") as _f:
    _FEW_SHOTS: dict[str, dict[str, Any]] = json.load(_f)


def _get_few_shot(age_group: str, page_number: int) -> str:
    """Return a formatted few-shot JSON block keyed by age group and page bucket."""
    age_shots = _FEW_SHOTS.get(age_group, {})
    if page_number <= 1:
        key = "1"
    elif page_number <= 3:
        key = "2-3"
    elif page_number <= 5:
        key = "4-5"
    elif page_number <= 8:
        key = "6-8"
    else:
        key = "9-10"
    shot = age_shots.get(key)
    if not shot:
        return ""
    return (
        f"\n## FEW-SHOT EXAMPLE  (topic: {shot.get('topic_hint', '')}, page {page_number})\n"
        f"```json\n{json.dumps({k: v for k, v in shot.items() if k != 'topic_hint'}, indent=2, ensure_ascii=False)}\n```\n"
    )


# ── Page-depth partial variable ───────────────────────────────────────────────
# Describes where this page sits in the book's conceptual arc.
# Injected dynamically into the user message so the system prompt stays stable.

_PAGE_DEPTH: dict[str, str] = {
    "1":  "This is page 1. Start from absolute first principles. "
          "Introduce the core idea in its simplest, most concrete form. "
          "Assume the reader knows nothing about this topic.",
    "2":  "This is page 2. Build on the foundation from page 1. "
          "Introduce the first complication — something that shows the simple version is incomplete.",
    "3":  "This is page 3. Continue building. Show a second angle or a limit of what was established. "
          "The reader should feel the concept has more to it than they expected.",
    "4":  "This is page 4. Go deeper. Challenge an assumption the reader has likely formed by now. "
          "Introduce a case or situation that breaks the early model.",
    "5":  "This is page 5. Intermediate depth. "
          "Expose the mechanism behind the concept — not just what happens, but why it works this way.",
    "6":  "This is page 6. Start the deep dive. "
          "Connect the concept to a broader pattern or show it operating in a different domain.",
    "7":  "This is page 7. Deep. "
          "The reader should encounter something genuinely surprising about the concept — "
          "something that contradicts conventional understanding.",
    "8":  "This is page 8. Maximum depth. "
          "Present the concept at its most complex or nuanced form. "
          "Include edge cases or unresolved tension if they are real.",
    "9":  "This is page 9. Begin synthesis. "
          "Bring together the threads from earlier pages into a coherent whole. "
          "What does everything learned so far actually mean?",
    "10": "This is page 10. Conclusion. "
          "Close the arc. Leave the reader with the single most important insight from the full journey. "
          "Do not introduce new ideas — crystallise what was already there.",
}


def _get_page_depth(page_number: int) -> str:
    return _PAGE_DEPTH.get(str(page_number), _PAGE_DEPTH["5"])


# ── Neurotype rules — research-grounded ──────────────────────────────────────
#
# ADHD  — Barkley (1997, 2011): executive function deficit; temporal binding failure;
#          dopaminergic system responds to novelty and immediate salience.
#          Writing: front-load salience, keep sentences atomic, concrete > abstract.
#
# Autism — Murray, Lesser & Lawson (2005) monotropism: cognitive resources tunnel
#           deeply into one focus; context-switching is expensive; implicit pragmatic
#           cues not auto-decoded. Writing: explicit causality, literal language,
#           predictable structure, decode all figurative speech inline.
#
# Dyslexia — Shaywitz & Shaywitz (2008): phonological processing deficit means
#             word-level decoding consumes bandwidth meant for comprehension.
#             Writing: short sentences, high-frequency words, no syntactic embedding,
#             no mid-clause parentheticals.
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_5_10 = """\
You are an educational storyteller writing for children aged 5 to 10.

## OUTPUT FORMAT — NON-NEGOTIABLE
Return a single JSON object with exactly these fields:
- "title": string — the page title
- "sections": array of exactly 3 objects, each with:
    - "position": integer (1, 2, 3)
    - "text": string — the section body
    - "image_prompt": string — a visible physical scene, no abstract nouns
- "action_item": string — one concrete thing the reader can do right now

Return ONLY the JSON object. No explanation, no prose outside the JSON.

## YOUR ROLE
Write one complete page of a learning book as a parable.
Every page must be a story — a character, a concrete problem, a visible choice, a result.
Never state the moral. Let the story carry it.

Write the way a thoughtful parent explains something to a curious 5-year-old.
Simple words. Short sentences. Physical, concrete, real.
You decide the style — your only anchor is: would a 5-year-old follow every word?

## LANGUAGE
Write the full response in: {language}
{language_style_instruction}

{neurotype_rules}"""

_SYSTEM_10_15 = """\
You are an educational writer writing for readers aged 10 to 15.

## OUTPUT FORMAT — NON-NEGOTIABLE
Return a single JSON object with exactly these fields:
- "title": string — the page title
- "sections": array of exactly 3 objects, each with:
    - "position": integer (1, 2, 3)
    - "text": string — the section body
    - "image_prompt": string — a visible physical scene, no abstract nouns
- "action_item": string — one concrete thing the reader can do right now

Return ONLY the JSON object. No explanation, no prose outside the JSON.

## YOUR ROLE
Write one complete page of a learning book.
Use real situations, real decisions, real consequences.
Your reader is a teenager. Write to that person — not at them.

Do not state lessons as summaries or advice sentences.
Let the situation show what the lesson is.
You decide the tone and structure that fits the content and the reader.

## LANGUAGE
Write the full response in: {language}
{language_style_instruction}

{neurotype_rules}"""

_SYSTEM_15_20 = """\
You are an educator writing for readers aged 15 to 20.

## OUTPUT FORMAT — NON-NEGOTIABLE
Return a single JSON object with exactly these fields:
- "title": string — the page title
- "sections": array of exactly 3 objects, each with:
    - "position": integer (1, 2, 3)
    - "text": string — the section body
    - "image_prompt": string — a visible physical scene, no abstract nouns
- "action_item": string — one concrete exercise or observable action

Return ONLY the JSON object. No explanation, no prose outside the JSON.

## YOUR ROLE
Write one complete page of a learning book as a tight, direct argument.
Challenge a wrong assumption, show a concrete case, compress the corrected view.

No motivational language. No hedging. No philosophical filler.
Assert clearly or retract. Use named cases and specific mechanisms.
You decide the rhetorical approach that is most honest and precise for this concept.

## LANGUAGE
Write the full response in: {language}
{language_style_instruction}

{neurotype_rules}"""

_SYSTEM_20_PLUS = """\
You are a first-principles reasoning educator writing for adult learners.

## OUTPUT FORMAT — NON-NEGOTIABLE
Return a single JSON object with exactly these fields:
- "title": string — the page title
- "sections": array of exactly 3 objects, each with:
    - "position": integer (1, 2, 3)
    - "text": string — the section body
    - "image_prompt": string — a visible physical scene, no abstract nouns
- "action_item": string — one rigorous observable action or experiment

Return ONLY the JSON object. No explanation, no prose outside the JSON.

## YOUR ROLE
Write one complete page of a learning book as a rigorous conceptual argument.
Strip popular definitions. Expose underlying mechanisms. Surface counter-intuitive consequences.
Assert directly. Take nothing for granted. Build from one claim to the next.

Banned: "perhaps", "it could be argued", "in some ways", "arguably", "might suggest".
Precision overrides accessibility. Sophisticated vocabulary is permitted when precise.
You decide how to structure the argument — the standard is: is every claim earned?

## LANGUAGE
Write the full response in: {language}
{language_style_instruction}

{neurotype_rules}"""

_USER_TEMPLATE = """\
<topic>{topic}</topic>
<description>{description}</description>
<page_number>{page_number}</page_number>

<page_depth_guidance>
{page_depth}
</page_depth_guidance>

<neurotype>{neurotype_input_context}</neurotype>

<memory_context>
{memory_context}
</memory_context>
{few_shot_block}
Generate exactly one page of the learning book for the topic above.
Return ONLY the JSON object."""


_NEUROTYPE_RULES: dict[str, str] = {
    "ADHD": (
        "## LEARNING PATTERN — ADHD\n\n"
        "The reader has an executive function profile where working memory is compressed "
        "and temporal binding — connecting present actions to future consequences — is difficult. "
        "Novelty and immediate salience drive engagement; abstraction without grounding loses attention fast.\n\n"
        "Adjust your writing accordingly:\n"
        "- Open every section with the most concrete or surprising thing first. Never build to a point — lead with it.\n"
        "- Keep sentences short. If a sentence has more than one clause, split it.\n"
        "- No passive voice. No nested clauses. Subject → verb → object, always.\n"
        "- Each section must be self-contained. Do not require memory of the previous sentence to understand the current one.\n"
    ),
    "Autism": (
        "## LEARNING PATTERN — AUTISM\n\n"
        "The reader processes information with deep focus but high cost on context-switching. "
        "Implicit connections, figurative language, and unstated social cues are not automatically decoded. "
        "Predictable structure reduces cognitive switching cost and builds trust with the content.\n\n"
        "Adjust your writing accordingly:\n"
        "- Write out cause and effect explicitly. 'X happened, therefore Y' — never imply the connection.\n"
        "- When you use a comparison or metaphor, immediately decode it in the same sentence.\n"
        "- Section structure must be consistent and predictable: state → concrete example → result.\n"
        "- No open-ended ambiguity. If something is uncertain, say so directly.\n"
    ),
    "Dyslexia": (
        "## LEARNING PATTERN — DYSLEXIA\n\n"
        "The reader's phonological processing means word-level decoding consumes cognitive bandwidth "
        "that would otherwise go to comprehension. Reading is effortful. "
        "Every unnecessary word, every nested clause, every rare vocabulary choice increases the load.\n\n"
        "Adjust your writing accordingly:\n"
        "- One idea per sentence. No exceptions.\n"
        "- Choose the simpler word when two words mean the same thing.\n"
        "- No mid-sentence parenthetical insertions. No dashes mid-clause.\n"
        "- Short paragraphs. White space is cognitive relief.\n"
        "- Read each sentence aloud mentally. If it trips, rewrite it.\n"
    ),
}


class PageState(TypedDict, total=False):
    payload: dict[str, Any]
    normalized: dict[str, Any]
    prepared: dict[str, Any]
    result: PageGenerationOutput


class PageGeneratorAI:
    def __init__(self) -> None:
        self.model_name = DEFAULT_GROQ_MODEL
        self.groq_api_key = get_env("GROQ_API_KEY")
        self.memory_limit = PAGE_MEMORY_LIMIT
        self.memory_store: dict[str, list[dict[str, Any]]] = {}

        # Per-age-group prompts — System/User split for GPT OSS 120B Harmony format
        self.age_prompts: dict[str, ChatPromptTemplate] = {
            "5-10":  ChatPromptTemplate.from_messages([("system", _SYSTEM_5_10),  ("human", _USER_TEMPLATE)]),
            "10-15": ChatPromptTemplate.from_messages([("system", _SYSTEM_10_15), ("human", _USER_TEMPLATE)]),
            "15-20": ChatPromptTemplate.from_messages([("system", _SYSTEM_15_20), ("human", _USER_TEMPLATE)]),
            "20+":   ChatPromptTemplate.from_messages([("system", _SYSTEM_20_PLUS),("human", _USER_TEMPLATE)]),
        }

        # Per-age-group LLMs — temperature tuned per cognitive mode
        # Story/creative (5-10, 10-15) → higher; analytical/first-principles → lower
        if self.groq_api_key:
            self.age_llms: dict[str, Any] = {
                age: ChatGroq(model=self.model_name, api_key=self.groq_api_key, temperature=t)
                for age, t in AGE_TEMPERATURES.items()
            }
        else:
            self.age_llms = {}

        # Back-compat: expose a default LLM handle for callers (e.g. orchestrator agent)
        self.llm = self.age_llms.get("15-20") if self.age_llms else None

        self.chain = self._build_chain()
        self.graph = self._build_graph()

    def _normalize_inputs(self, payload: dict[str, Any]) -> dict[str, Any]:
        age_group = payload.get("age_group", DEFAULT_AGE_GROUP)
        neurotype = payload.get("neurotype", DEFAULT_NEUROTYPE)
        language = payload.get("language", DEFAULT_LANGUAGE)

        page_number = max(1, int(payload.get("page_number", 1)))
        page_number = min(page_number, self.memory_limit)
        memory_key = payload.get("memory_key") or f"{payload.get('topic','General Learning')}::{payload.get('description','')}::{age_group}::{neurotype}::{language}"

        return {
            "topic": payload.get("topic", "General Learning"),
            "description": payload.get("description", "") or "",
            "age_group": age_group if age_group in VALID_AGE_GROUPS else DEFAULT_AGE_GROUP,
            "neurotype": neurotype if neurotype in VALID_NEUROTYPES else DEFAULT_NEUROTYPE,
            "language": language if language in VALID_LANGUAGES else DEFAULT_LANGUAGE,
            "page_number": page_number,
            "memory_key": str(memory_key),
        }

    def _build_memory_context(self, normalized: dict[str, Any]) -> str:
        key = normalized["memory_key"]
        page_number = normalized["page_number"]

        if page_number <= 1:
            self.memory_store[key] = []
            return "No prior pages."

        records = self.memory_store.get(key, [])
        if not records:
            return "No prior pages."

        lines: list[str] = []
        for record in records:
            lines.append(f"Page {record['page_number']} title: {record['title']}")
            for idx, text in enumerate(record["section_texts"], start=1):
                lines.append(f"Page {record['page_number']} section {idx}: {text}")
        return "\n".join(lines)

    def _prepare_prompt_inputs(self, normalized: dict[str, Any]) -> dict[str, Any]:
        prepared = dict(normalized)
        prepared["memory_context"] = self._build_memory_context(normalized)

        neurotype = normalized["neurotype"]
        if neurotype == "None":
            prepared["neurotype_rules"] = ""
            prepared["neurotype_input_context"] = "None"
        else:
            prepared["neurotype_rules"] = _NEUROTYPE_RULES.get(neurotype, "")
            prepared["neurotype_input_context"] = neurotype

        language = normalized["language"]
        prepared["language_style_instruction"] = (
            HINDI_STYLE_INSTRUCTION
            if language == "Hindi"
            else ""
        )

        page_number = normalized["page_number"]
        age_group = normalized["age_group"]
        prepared["page_depth"] = _get_page_depth(page_number)
        prepared["few_shot_block"] = _get_few_shot(age_group, page_number)

        return prepared

    def _remember_page(self, normalized: dict[str, Any], result: PageGenerationOutput) -> None:
        key = normalized["memory_key"]
        page_number = normalized["page_number"]
        records = self.memory_store.setdefault(key, [])
        records[:] = [r for r in records if r["page_number"] != page_number]
        records.append(
            {
                "page_number": page_number,
                "title": result.title,
                "section_texts": [section.text for section in result.sections],
            }
        )
        records.sort(key=lambda r: r["page_number"])
        self.memory_store[key] = [r for r in records if r["page_number"] <= self.memory_limit]

    def _run_age_chain(self, prepared: dict[str, Any]) -> PageGenerationOutput:
        """Select the right prompt + LLM for the age group and invoke synchronously."""
        age = prepared.get("age_group", "15-20")
        prompt = self.age_prompts.get(age, self.age_prompts["15-20"])
        llm = self.age_llms.get(age, self.age_llms["15-20"])
        return (prompt | llm.with_structured_output(PageGenerationOutput)).invoke(prepared)

    async def _arun_age_chain(self, prepared: dict[str, Any]) -> PageGenerationOutput:
        """Select the right prompt + LLM for the age group and invoke asynchronously."""
        age = prepared.get("age_group", "15-20")
        prompt = self.age_prompts.get(age, self.age_prompts["15-20"])
        llm = self.age_llms.get(age, self.age_llms["15-20"])
        return await (prompt | llm.with_structured_output(PageGenerationOutput)).ainvoke(prepared)

    def _build_chain(self):
        normalize = RunnableLambda(self._normalize_inputs)
        prepare = RunnableLambda(self._prepare_prompt_inputs)
        if self.age_llms:
            return normalize | prepare | RunnableLambda(self._run_age_chain)
        return normalize | prepare | RunnableLambda(lambda payload: self._fallback_output(payload))

    def _build_graph(self):
        graph_builder = StateGraph(PageState)

        async def prepare_node(state: PageState) -> PageState:
            normalized = self._normalize_inputs(state["payload"])
            prepared = self._prepare_prompt_inputs(normalized)
            return {"normalized": normalized, "prepared": prepared}

        async def generate_node(state: PageState) -> PageState:
            result = await self._arun_age_chain(state["prepared"])
            return {"result": result}

        graph_builder.add_node("prepare", prepare_node)
        graph_builder.add_node("generate", generate_node)
        graph_builder.add_edge(START, "prepare")
        graph_builder.add_edge("prepare", "generate")
        graph_builder.add_edge("generate", END)
        return graph_builder.compile()

    def _fallback_output(self, payload: dict[str, Any]) -> PageGenerationOutput:
        return self._error_fallback_output(payload)

    def _error_fallback_output(self, payload: dict[str, Any]) -> PageGenerationOutput:
        sections = [
            PageSectionDraft(
                position=1,
                text=ERROR_FALLBACK_TEXT,
                image_prompt="student looking at locked lesson screen",
            ),
            PageSectionDraft(
                position=2,
                text=ERROR_FALLBACK_TEXT,
                image_prompt="classroom board showing subscription notice",
            ),
            PageSectionDraft(
                position=3,
                text=ERROR_FALLBACK_TEXT,
                image_prompt="student opening premium plan dialog",
            ),
        ]
        return PageGenerationOutput(title=ERROR_FALLBACK_TEXT, sections=sections, action_item=ERROR_FALLBACK_TEXT)

    async def generate_page(self, payload: dict[str, Any]) -> PageGenerationOutput:
        normalized = self._normalize_inputs(payload)
        try:
            state = await self.graph.ainvoke({"payload": payload})
            result = state["result"]
            if len(result.sections) != 3:
                result = self._fallback_output(normalized)
            self._remember_page(normalized, result)
            return result
        except Exception:  # noqa: BLE001
            logger.exception(
                "Page generation failed",
                extra={"model": self.model_name, "page_number": normalized["page_number"], "age_group": normalized["age_group"]},
            )
            result = self._error_fallback_output(normalized)
            self._remember_page(normalized, result)
            return result
