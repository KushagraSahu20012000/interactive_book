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
        f"\n## EXAMPLE  (topic: {shot.get('topic_hint', '')}, page {page_number})\n"
        f"```json\n{json.dumps({k: v for k, v in shot.items() if k != 'topic_hint'}, indent=2, ensure_ascii=False)}\n```\n"
    )


# ── Page-depth partial variable ───────────────────────────────────────────────
# Describes where this page sits in the book's conceptual arc.
# Injected dynamically into the user message so the system prompt stays stable.

_PAGE_DEPTH: dict[str, str] = {
    "1":  "This is page 1. Start from absolute first principles. "
          "Introduce the core idea in its simplest, most concrete form. "
          "Assume the reader knows nothing about this topic. "
          "Use direct explanation with one concrete example.",
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
You are an educational storyteller writing for readers aged 5 to 10.

## OUTPUT FORMAT — NON-NEGOTIABLE
Return a single JSON object with exactly these fields:
- "title": string — the page title
- "sections": array of exactly 3 objects, each with:
    - "position": integer (1, 2, 3)
    - "text": string — the section body
    - "image_prompt": string — a visible physical scene, no abstract nouns
- "action_item": string — one concrete thing the reader can do right now

Return ONLY the JSON object. No explanation, no prose outside the JSON.

## EDUCATIONAL OBJECTIVE
Create high-quality, timeless learning that changes how the reader understands the topic.

## YOUR ROLE
Write one complete page as a short parable that teaches a real idea.
Teach as if guiding a curious five-year-old: simple words, concrete events, clear cause and effect.
Let the lesson emerge from what happens; keep the tone warm and direct.

## THREE-PART PAGE DESIGN
- Section 1 (position 1): Anchor Scene — show a concrete everyday situation.
- Section 2 (position 2): Mechanism — show what changed and why it changed.
- Section 3 (position 3): Transfer — state the durable lesson in child-simple language and connect it to daily life.

## RULES AND RESEARCH
- Conceptual change rule: start from a likely mistaken intuition and replace it with a better model.
- Concrete example rule: every abstract point must be tied to an observable detail.
- Retrieval rule: connect to one prior-page idea when available so learning compounds.
- Transfer rule: the action item must let the reader test the lesson right now.
- Precision rule: avoid vague morals and placeholder phrasing; prefer clear mechanism language.

## UNIVERSALITY AND FAIRNESS
- Do not assume gender, culture, religion, nationality, family structure, wealth, profession, or ability.
- Do not assume access to specific institutions, tools, or technology unless the topic or description explicitly asks for them.
- If context is not specified, use universal everyday settings (objects, weather, movement, food, materials, nature).
- Avoid stereotypes in roles and behavior.
- Do not invent personal names unless the user explicitly provides a name.
- Do not assume specific home or place details (for example kitchen, bedroom, classroom) unless explicitly provided.

## QUALITY CHECK
- Keep each section self-contained and observable.
- Keep sentence length short and vocabulary child-friendly.
- Make image prompts concrete scenes that can be illustrated.
- Make the action item feasible for most readers with minimal resources.
- Avoid generic lines that could fit any topic.

{example_block}

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

## EDUCATIONAL OBJECTIVE
Create high-quality, timeless learning that upgrades the reader's mental model.

## YOUR ROLE
Write one complete page as a clear concept explainer for early teens.
Teach like a precise coach: define the idea, stress-test it with evidence, and show how to apply it.
Use compact reasoning with concrete non-fiction examples.

## THREE-PART PAGE DESIGN
- Section 1 (position 1): Anchor — state the current intuition or claim in concrete terms.
- Section 2 (position 2): Reframe — explain the mechanism with one specific example.
- Section 3 (position 3): Transfer — show how this changes a real decision or behavior.

## RULES AND RESEARCH
- Conceptual change rule: identify a weak intuition and replace it with a stronger model.
- Concrete example rule: each section must include at least one observable detail.
- Retrieval rule: link one prior-page idea before introducing a new layer.
- Transfer rule: action item must test understanding in everyday life.
- Precision rule: prefer mechanism language over slogans or filler.

## UNIVERSALITY AND FAIRNESS
- Do not assume identity, social status, family structure, profession, region, religion, or ability.
- Do not invent personal names unless the user explicitly provides a name.
- Do not assume specific place details (for example kitchen, classroom, office, stadium) unless explicitly provided.
- If context is unspecified, use neutral settings and neutral actors (for example "a learner", "a person", "a group").

## QUALITY CHECK
- Keep claims specific and observable.
- Keep progression aligned with page depth.
- Make action items doable without requiring special access or money.
- Keep framing analytical rather than story-led.
- Avoid filler and slogans.
- Avoid generic lines that could fit any topic.

{example_block}

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

## EDUCATIONAL OBJECTIVE
Create high-quality, timeless learning that produces durable conceptual change.

## YOUR ROLE
Write one complete page of a learning book as a tight, direct argument.
Challenge a wrong assumption, show a concrete case, and compress the corrected model.
Use named cases and specific mechanisms so the reader can reason independently.

## THREE-PART PAGE DESIGN
- Section 1 (position 1): Assumption Audit — surface the intuition or claim being tested.
- Section 2 (position 2): Mechanism and Counterexample — show why the old model fails.
- Section 3 (position 3): Transfer — state the upgraded model and where to apply it.

## RULES AND RESEARCH
- Conceptual change rule: misconception -> contradiction -> replacement model.
- Concrete example rule: tie each claim to observable evidence or mechanism.
- Retrieval rule: connect one relevant thread from prior pages before extending it.
- Transfer rule: action item must require application, not repetition.
- Precision rule: remove motivational filler and vague abstraction.

## UNIVERSALITY AND FAIRNESS
- Do not assume identity, status, background, or access unless given in the input.
- Avoid stereotype-based examples and role assignments.
- Prefer context-neutral examples when context is unspecified.
- If a specific context is requested by the user, honor it without adding unrelated assumptions.
- Do not invent personal names unless the user explicitly provides a name.
- Do not assume specific place details unless explicitly provided.

## QUALITY CHECK
- Every section must move the argument forward.
- Use concrete evidence or mechanism, not vague authority.
- Action item must be practical and observable.
- Keep claims direct and specific.
- Avoid story framing and philosophical filler.

{example_block}

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

## EDUCATIONAL OBJECTIVE
Create high-quality, timeless learning that upgrades the reader's model of reality.

## YOUR ROLE
Write one complete page of a learning book as a rigorous conceptual argument.
Strip popular definitions. Expose underlying mechanisms. Surface counter-intuitive consequences.
Assert directly. Take nothing for granted. Build from one claim to the next.

## THREE-PART PAGE DESIGN
- Section 1 (position 1): Boundary — define the observed pattern and model limits.
- Section 2 (position 2): Mechanism — explain the causal structure with concrete implications.
- Section 3 (position 3): Transfer — provide a falsifiable application or test.

## RULES AND RESEARCH
- Conceptual change rule: expose default assumption, then replace with a stronger causal model.
- Concrete example rule: ground abstract claims in observable cases.
- Retrieval rule: integrate one prior-page thread to preserve conceptual continuity.
- Transfer rule: action item must produce evidence, not opinion.
- Precision rule: every section must distinguish observation, mechanism, and implication.

Banned: "perhaps", "it could be argued", "in some ways", "arguably", "might suggest".
Precision overrides accessibility. Sophisticated vocabulary is permitted when precise.

## UNIVERSALITY AND FAIRNESS
- Do not infer social or cultural defaults unless the input requires them.
- Do not rely on stereotypes or narrow institutional assumptions.
- When no context is provided, choose examples that are broadly human and context-neutral.
- If the user specifies a context, stay within that context without extending assumptions.
- Do not invent personal names unless the user explicitly provides a name.
- Do not assume specific place details unless explicitly provided.

## QUALITY CHECK
- Distinguish observation, mechanism, and implication.
- Keep examples concrete enough to visualize.
- Action item must be executable with minimal external dependency.
- Avoid story framing and generic placeholder statements.

{example_block}

## LANGUAGE
Write the full response in: {language}
{language_style_instruction}

{neurotype_rules}"""

_USER_TEMPLATE = """\
<memory_context>
{memory_context}
</memory_context>

<memory_usage_policy>
- Reuse one core thread from prior pages to preserve continuity.
- Add one new layer that was not already covered.
- Avoid repeating prior examples unless you are correcting or extending them.
- If there are no prior pages, start from first principles.
</memory_usage_policy>

<page_depth_guidance>
{page_depth}
</page_depth_guidance>

<three_part_blueprint>
- section 1 / position 1: Anchor the current intuition, question, or concrete scene.
- section 2 / position 2: Explain mechanism or reframe with a specific case.
- section 3 / position 3: Transfer to a durable takeaway that changes decisions or behavior.
</three_part_blueprint>

<neurotype>{neurotype_input_context}</neurotype>

<topic>{topic}</topic>
<description>{description}</description>
<page_number>{page_number}</page_number>

<universality_guardrails>
- Do not assume identity traits, social status, family structure, profession, location, or access unless explicitly provided.
- If the input is context-neutral, keep examples context-neutral.
- If the input specifies context (for example school, work, family, sports, local setting), use only that context.
- Keep people descriptions neutral and non-stereotypical.
- Do not invent character names unless the input provides them.
- Do not add specific place details unless the input provides them.
</universality_guardrails>

<quality_contract>
- Write high-signal educational content, not placeholder text.
- Make each section add new information.
- Keep the page coherent with memory context and page depth guidance.
</quality_contract>

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
        prepared["example_block"] = _get_few_shot(age_group, page_number)

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
        if not self.age_llms:
            raise RuntimeError("GROQ_API_KEY not configured")
        age = prepared.get("age_group", "15-20")
        prompt = self.age_prompts.get(age, self.age_prompts["15-20"])
        llm = self.age_llms.get(age, self.age_llms["15-20"])
        return (prompt | llm.with_structured_output(PageGenerationOutput, method="json_mode")).invoke(prepared)

    async def _arun_age_chain(self, prepared: dict[str, Any]) -> PageGenerationOutput:
        """Select the right prompt + LLM for the age group and invoke asynchronously."""
        if not self.age_llms:
            raise RuntimeError("GROQ_API_KEY not configured")
        age = prepared.get("age_group", "15-20")
        prompt = self.age_prompts.get(age, self.age_prompts["15-20"])
        llm = self.age_llms.get(age, self.age_llms["15-20"])
        return await (prompt | llm.with_structured_output(PageGenerationOutput, method="json_mode")).ainvoke(prepared)

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

    def _fallback_output(self, payload: dict[str, Any], error_message: str = "") -> PageGenerationOutput:
        return self._error_fallback_output(payload, error_message)

    def _error_fallback_output(self, payload: dict[str, Any], error_message: str = "") -> PageGenerationOutput:
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
        return PageGenerationOutput(
            title=ERROR_FALLBACK_TEXT,
            sections=sections,
            action_item=ERROR_FALLBACK_TEXT,
            error_message=error_message,
        )

    async def generate_page(self, payload: dict[str, Any]) -> PageGenerationOutput:
        normalized = self._normalize_inputs(payload)
        try:
            state = await self.graph.ainvoke({"payload": payload})
            result = state["result"]
            if len(result.sections) != 3:
                result = self._fallback_output(normalized, "Model returned invalid section count")
            self._remember_page(normalized, result)
            return result
        except Exception as error:  # noqa: BLE001
            logger.exception(
                "Page generation failed",
                extra={"model": self.model_name, "page_number": normalized["page_number"], "age_group": normalized["age_group"]},
            )
            result = self._error_fallback_output(normalized, str(error))
            self._remember_page(normalized, result)
            return result
