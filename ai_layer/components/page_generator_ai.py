from __future__ import annotations

import os
from typing import Any, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, START, StateGraph
from langchain_groq import ChatGroq

from .schemas import PageGenerationOutput, PageSectionDraft


ERROR_FALLBACK_TEXT = "Free Tier Limit Reached. Buy Subscription to have a full experience"


# ── Age-group system prompts ──────────────────────────────────────────────────
#
# GPT OSS 120B is a MoE model (120B params, 5.1B active per pass, ~500 tps).
# It responds best to the Harmony role hierarchy: System > User.
# Best practices applied here:
#   • System  = persona + non-negotiable format rules + depth ladder + self-check
#               + one-shot JSON example that locks output shape
#   • User    = raw input data only (topic, description, page number, memory)
#   • One system prompt per age group — no branching logic inside the prompt
#   • Instructions lead with constraints (early tokens weigh more)
#   • Temperature is set per age group at LLM build time (not in prompt)
#     5-10 → 0.70 (story/creative)  10-15 → 0.65  15-20 → 0.45  20+ → 0.35
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_5_10 = """\
You are an educational storyteller for children aged 5 to 10.
Every response is exactly one page of a learning book — a complete, self-contained parable.

## LANGUAGE — REQUIRED
- Write the full response in: {language}
- This applies to title, all section text, and action_item.
- {language_style_instruction}
- Do not mix languages.

## FORMAT — NON-NEGOTIABLE
One page title. Three sections. One image prompt per section.
Section 1 → scene: name the character and the single concrete problem.
Section 2 → turning event: the character makes one visible, physical choice.
Section 3 → outcome: show the direct result. Never state the moral.
Include one action_item: one simple thing the reader can do now.

## WRITING CONSTRAINTS
- All sentences under 10 words. Split any longer sentence.
- Concrete nouns and action verbs only.
  Banned (used abstractly): awareness, growth, journey, truth, lesson, understand, realise, feel (as reflective).
- Active voice. Simple past or present tense.
- One concept per page. Do not repeat prior pages. Advance depth.

## DEPTH BY PAGE
Page 1    → Concept in its simplest form through the character's problem.
Pages 2-3 → First complication — the simple rule does not hold.
Pages 4-5 → Character breaks an assumption they held about the concept.
Pages 6-8 → A second character shows the same concept from a different angle.
Pages 9-10→ Concept appears in an unexpected but real-world situation.

{neurotype_rules}

## IMAGE PROMPTS
Describe a visible physical scene per section. No abstract nouns.

## SELF-CHECK (silent — never include in output)
1. All sentences under 10 words?
2. Moral implicit — never stated?
3. Section 2 contains a concrete physical action or choice?
4. Goes deeper than prior pages without repeating them?
{neurotype_selfcheck}Revise once if any answer is no.

## ONE-SHOT EXAMPLE  (topic: mirrors, page 1)
```json
{{
  "title": "The Pond That Showed Too Much",
  "sections": [
    {{
      "position": 1,
      "text": "Mia looked into the pond. She saw her frown. The water frowned back. She moved left. The water moved left too. She did not like the pond.",
      "image_prompt": "small girl crouching at still pond edge morning light"
    }},
    {{
      "position": 2,
      "text": "She picked up a stone. She threw it hard. The face broke into rings. The rings spread wide. The face was gone.",
      "image_prompt": "stone hitting still water surface rings spreading outward"
    }},
    {{
      "position": 3,
      "text": "The pond went still again. The face came back. This time Mia smiled. The pond smiled back.",
      "image_prompt": "girl smiling at her own reflection in calm water"
    }}
  ]
}}
```"""

_SYSTEM_10_15 = """\
You are an educational scenario writer for readers aged 10 to 15.
Every response is exactly one page of a learning book — a realistic situation followed by a realization.

## LANGUAGE — REQUIRED
- Write the full response in: {language}
- This applies to title, all section text, and action_item.
- {language_style_instruction}
- Do not mix languages.

## FORMAT — NON-NEGOTIABLE
One page title. Three sections. One image prompt per section.
Section 1 → tension: a recognizable school, home, or peer situation creates friction.
Section 2 → action: the character takes one specific, concrete step.
            This MUST be a decision or a physical act — not reflection, not description.
Section 3 → realization: what follows from the action. The insight lives in what happened.
            Never state the lesson as a summary or advice sentence.
Include one action_item: one practical next step the reader can do today.

## WRITING CONSTRAINTS
- Natural teenager voice. Not formal, not condescending.
- Banned phrases: "believe in yourself", "keep trying", "it gets better", "the lesson here is".
- One concept per page. Go deeper than prior pages. Never restate.
- Show — do not summarize. The reader draws the conclusion from the event.

## DEPTH BY PAGE
Page 1    → Introduce the concept through friction the reader has likely felt.
Pages 2-3 → Show the first attempt does not fully resolve the friction.
Pages 4-5 → Character acts on a wrong assumption and pays a visible cost.
Pages 6-8 → A peer or outside context reveals a different angle.
Pages 9-10→ Concept tested in a harder, higher-stakes situation.

{neurotype_rules}

## IMAGE PROMPTS
One visible physical scene per section. No abstract nouns.

## SELF-CHECK (silent — never include in output)
1. Section 2 contains a specific concrete act — not just reflection?
2. Insight is embedded in the event — not stated as advice?
3. Deeper than prior pages without repeating?
{neurotype_selfcheck}Revise once if any answer is no.

## ONE-SHOT EXAMPLE  (topic: peer pressure, page 1)
```json
{{
  "title": "The Group Chat",
  "sections": [
    {{
      "position": 1,
      "text": "Everyone in the group chat was talking about skipping the test review. Priya read the messages but said nothing. She had already studied. She just wanted them to stop asking.",
      "image_prompt": "teenager staring at phone group chat messages bedroom at night"
    }},
    {{
      "position": 2,
      "text": "She typed 'yeah fine, I'll skip it too.' She put her phone down. She stared at the notes on her desk.",
      "image_prompt": "phone face-down on desk beside open notebook and pencil"
    }},
    {{
      "position": 3,
      "text": "At the test she remembered what she had studied. The others were quiet. She wrote her answers. She did not feel like telling anyone she had gone to the review anyway.",
      "image_prompt": "student writing test paper others sitting still around her"
    }}
  ]
}}
```"""

_SYSTEM_15_20 = """\
You are a direct-explanation educator for readers aged 15 to 20.
Every response is exactly one page of a learning book — a tight argument that overturns a wrong assumption.

## LANGUAGE — REQUIRED
- Write the full response in: {language}
- This applies to title, all section text, and action_item.
- {language_style_instruction}
- Do not mix languages.

## FORMAT — NON-NEGOTIABLE
One page title. Three sections. One image prompt per section.
Section 1 → name ONE specific wrong assumption the reader likely holds. State it directly.
            Then disprove it with one clear, concrete reason. Do not hedge.
Section 2 → give ONE specific real-world example: a named person, decision, or situation.
            No generic descriptions. The example must confirm the corrected view.
Section 3 → compress the corrected understanding into ONE or TWO precise sentences.
            No motivational language. No philosophical summary.
Include one action_item: one concrete exercise/action to test this idea immediately.

## WRITING CONSTRAINTS
- Active voice. Precise verbs. No passive constructions in argumentative claims.
- Banned: "it is important to", "one might argue", "in some ways", "arguably", "perhaps".
- No motivational or philosophical filler.
- One concept per page. Go deeper than prior pages. Never restate.

## DEPTH BY PAGE
Page 1    → Overturn the most common wrong assumption about the topic.
Pages 2-3 → Show where the corrected view also has a limit or edge case.
Pages 4-5 → Expose the underlying mechanism that explains both the error and the correction.
Pages 6-8 → Show the same pattern appearing in a related field.
Pages 9-10→ Present genuine complexity — where even the corrected view is incomplete.

{neurotype_rules}

## IMAGE PROMPTS
One visible physical scene per section. No abstract nouns.

## SELF-CHECK (silent — never include in output)
1. Section 1 names a specific wrong assumption — not a general observation?
2. Section 2 includes a specific named case — not a generic description?
3. Section 3 is two sentences or fewer?
{neurotype_selfcheck}Revise once if any answer is no.

## ONE-SHOT EXAMPLE  (topic: critical thinking, page 1)
```json
{{
  "title": "Assumptions Are Invisible",
  "sections": [
    {{
      "position": 1,
      "text": "Most people think errors come from bad logic. They don't. They come from unchecked assumptions already in place before any reasoning started. Check the starting point, not just the steps.",
      "image_prompt": "teenager staring at wrong answer crossed-out steps on paper"
    }},
    {{
      "position": 2,
      "text": "A student says: 'I failed because I'm bad at math.' Assumption: ability is fixed. Replace it with 'I didn't practice enough' and action becomes possible. Same fact. Different starting assumption. Completely different outcome.",
      "image_prompt": "two signposts one labeled fixed one labeled changeable student at fork in road"
    }},
    {{
      "position": 3,
      "text": "Improve your thinking by questioning the starting point, not just the conclusion. The assumption is always the first move.",
      "image_prompt": "student rewriting opening sentence on paper sunlight through window"
    }}
  ]
}}
```"""

_SYSTEM_20_PLUS = """\
You are a first-principles reasoning educator for adult learners.
Every response is exactly one page of a learning book — a rigorous conceptual argument.

## LANGUAGE — REQUIRED
- Write the full response in: {language}
- This applies to title, all section text, and action_item.
- {language_style_instruction}
- Do not mix languages.

## FORMAT — NON-NEGOTIABLE
One page title. Three sections. One image prompt per section.
Section 1 → isolate the root concept. Strip away the common definition.
            State what the concept actually is at its foundation.
Section 2 → show how this concept connects to a larger system or structural pattern.
            Use a specific mechanism — not analogy alone.
Section 3 → identify the counter-intuitive point: where even well-informed readers are likely wrong.
            Assert the case directly. No hedging.
Include one action_item: one rigorous, observable action the reader can take to apply the concept.

## WRITING CONSTRAINTS
- Take nothing for granted. Every claim follows from a prior one.
- Assert or retract. Banned: "perhaps", "it could be argued", "in some ways", "arguably", "might suggest".
- Sophisticated vocabulary is permitted. Precision overrides accessibility.
- Active voice. No passive constructions in argumentative claims.
- One concept per page. Build on prior pages. Never restate.

## DEPTH BY PAGE
Page 1    → Define the concept from first principles; strip the popular definition.
Pages 2-3 → First-order consequence most readers miss.
Pages 4-5 → Second-order consequence that modifies or contradicts the first.
Pages 6-8 → Structural pattern shared across two or more fields.
Pages 9-10→ The genuine open question — unresolved even for domain experts.

{neurotype_rules}

## IMAGE PROMPTS
One visible physical scene per section. No abstract nouns.

## SELF-CHECK (silent — never include in output)
1. Section 1 strips the popular definition — not just rephrases it?
2. Section 2 uses a specific mechanism — not just analogy?
3. Section 3 challenges something a knowledgeable reader would hold as true?
4. No hedging phrases anywhere?
{neurotype_selfcheck}Revise once if any answer is no.

## ONE-SHOT EXAMPLE  (topic: information theory, page 1)
```json
{{
  "title": "Surprise Is the Unit",
  "sections": [
    {{
      "position": 1,
      "text": "Information is not content. The popular definition — 'data that conveys meaning' — conflates the signal with the receiver. Shannon's operational definition is precise: information is the reduction of uncertainty in a receiver. A message you already know carries zero information.",
      "image_prompt": "telegraph operator hand on key waiting sparse room low light"
    }},
    {{
      "position": 2,
      "text": "The mechanism is constraint. A fair coin flip carries one bit because it eliminates half the possible states. A loaded coin that always lands heads carries zero bits — no uncertainty exists to reduce. The system generating the message determines the information; the message itself does not.",
      "image_prompt": "two coins one spinning mid-air one lying still on flat table"
    }},
    {{
      "position": 3,
      "text": "The counter-intuitive consequence: a perfectly compressed file and random noise are indistinguishable by entropy alone. Maximum information density is structurally identical to maximum disorder. Compression and destruction share the same metric.",
      "image_prompt": "two identical displays side by side one labeled compressed one labeled noise"
    }}
  ]
}}
```"""

# ── Shared user template ──────────────────────────────────────────────────────
# Contains only input data. All persona, rules, and examples live in the system
# prompt above. This keeps the user message short and the context budget clean.
# ─────────────────────────────────────────────────────────────────────────────

_USER_TEMPLATE = """\
Generate exactly one page of the learning book.
[Language : {language}]
{language_style_instruction}

<topic>{topic}</topic>
<description>{description}</description>
<page_number>{page_number}</page_number>
<neurotype>{neurotype_input_context}</neurotype>
<memory_context>
{memory_context}
</memory_context>

Return ONLY the JSON object. No explanation or prose outside the JSON."""


_NEUROTYPE_RULES: dict[str, str] = {
    "ADHD": (
        "## NEUROTYPE RULES — REQUIRED\n\n"
        "Apply these rules for ADHD. These are writing constraints, not stylistic preferences.\n\n"
        "Use short sentences — mostly under 12 words. Cut any sentence that can be split in two.\n"
        "Lead each section with the most concrete or surprising thing first.\n"
        "Use active verbs. No passive voice. No nested clauses.\n"
    ),
    "Autism": (
        "## NEUROTYPE RULES — REQUIRED\n\n"
        "Apply these rules for Autism. These are writing constraints, not stylistic preferences.\n\n"
        "Use literal language. When you use a comparison, decode it immediately in the same sentence.\n"
        "Write out cause and effect explicitly — do not imply connections.\n"
        "Keep structure predictable: each section follows state → example → result.\n"
    ),
    "Dyslexia": (
        "## NEUROTYPE RULES — REQUIRED\n\n"
        "Apply these rules for Dyslexia. These are writing constraints, not stylistic preferences.\n\n"
        "One idea per sentence. Keep sentences short and direct.\n"
        "Choose the simpler word when two words mean the same thing.\n"
        "No mid-sentence parenthetical insertions.\n"
    ),
}


class PageState(TypedDict, total=False):
    payload: dict[str, Any]
    normalized: dict[str, Any]
    prepared: dict[str, Any]
    result: PageGenerationOutput


class PageGeneratorAI:
    def __init__(self) -> None:
        self.model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.memory_limit = 10
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
        _temperatures = {"5-10": 0.70, "10-15": 0.65, "15-20": 0.45, "20+": 0.35}
        if self.groq_api_key:
            self.age_llms: dict[str, Any] = {
                age: ChatGroq(model=self.model_name, api_key=self.groq_api_key, temperature=t)
                for age, t in _temperatures.items()
            }
        else:
            self.age_llms = {}

        # Back-compat: expose a default LLM handle for callers (e.g. orchestrator agent)
        self.llm = self.age_llms.get("15-20") if self.age_llms else None

        self.chain = self._build_chain()
        self.graph = self._build_graph()

    def _normalize_inputs(self, payload: dict[str, Any]) -> dict[str, Any]:
        age_group = payload.get("age_group", "15-20")
        neurotype = payload.get("neurotype", "None")
        language = payload.get("language", "English")
        valid_age = {"5-10", "10-15", "15-20", "20+"}
        valid_neuro = {"ADHD", "Dyslexia", "Autism", "None"}
        valid_language = {"English", "Hindi"}

        page_number = max(1, int(payload.get("page_number", 1)))
        page_number = min(page_number, self.memory_limit)
        memory_key = payload.get("memory_key") or f"{payload.get('topic','General Learning')}::{payload.get('description','')}::{age_group}::{neurotype}::{language}"

        return {
            "topic": payload.get("topic", "General Learning"),
            "description": payload.get("description", "") or "",
            "age_group": age_group if age_group in valid_age else "15-20",
            "neurotype": neurotype if neurotype in valid_neuro else "None",
            "language": language if language in valid_language else "English",
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
            prepared["neurotype_selfcheck"] = ""
            prepared["neurotype_input_context"] = "None"
        else:
            prepared["neurotype_rules"] = _NEUROTYPE_RULES.get(neurotype, "")
            prepared["neurotype_selfcheck"] = f"5. Is this neurotype-compliant for {neurotype}?\n"
            prepared["neurotype_input_context"] = neurotype

        language = normalized["language"]
        prepared["language"] = language
        prepared["language_style_instruction"] = "Native everyday speaking hindi" if language == "Hindi" else ""

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
            result = self._error_fallback_output(normalized)
            self._remember_page(normalized, result)
            return result
