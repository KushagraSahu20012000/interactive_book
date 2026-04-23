# Bright Minds — Prompt Engineering Guide (v3.0)

## Model

**openai/gpt-oss-120b** via Groq  
MoE architecture: 120B total parameters, ~5.1B active per forward pass, ~500 tokens/sec.  
Uses the **Harmony role hierarchy**: `System > User`. Instructions in the system prompt carry more weight than those in the user message.  
Early tokens in the system prompt carry disproportionate weight — format constraints and role definition go first.

---

## Architecture Overview

```
System prompt  →  Role + output format + neurotype adjustment (static per age group)
User message   →  All dynamic content: topic, page depth, few-shot, memory
```

The system prompt is stable across calls for the same age group.  
The user message changes on every call.

---

## Design Decisions

### 1. No deterministic style constraints

Previous versions prescribed section-by-section writing instructions (e.g. "Section 1 → scene: name the character and single problem"). This over-constrained the model and produced formulaic outputs.

**Prompt 3.0** gives the AI a role and a reader audience. It decides the structure. The only fixed constraint is the JSON output shape.

**Why:** GPT-class MoE models generate better content when given the *goal* and the *audience*, not a step-by-step prescription. Constraints reduce variance; they also reduce quality when the constraints are wrong for a particular topic.

### 2. Age 5-10 → always parables

A parable is the only format that works reliably for this age group:
- Children learn through story and character identification, not argument
- Abstract concepts need a concrete vessel to be retained
- Moral is embedded in outcome, never stated — prevents "preachy" content

**Implementation:** `_SYSTEM_5_10` hardcodes "Write one complete page of a learning book as a parable." No branching. No age-group-conditional logic inside the prompt.

### 3. Page-depth as a dynamic partial variable

The `{page_depth}` variable is injected into the **user message** at runtime from `_PAGE_DEPTH`, a 10-entry dict keyed by page number string.

```
Page 1    → Absolute first principles. Assume reader knows nothing.
Page 2    → First complication. Simple version is incomplete.
Page 3    → Second angle. Concept has more to it.
Page 4    → Break an assumption reader has formed.
Page 5    → Expose the mechanism. Why does this work this way?
Page 6    → Connect to broader pattern or different domain.
Page 7    → Something genuinely surprising. Contradicts convention.
Page 8    → Maximum depth. Nuance, edge cases, unresolved tension.
Page 9    → Begin synthesis. What does it all mean?
Page 10   → Conclusion. Crystallise, don't introduce new ideas.
```

This produces a book that reads like an actual book: first-principles → build-up → deep dive → conclusion.  
The depth instruction is in the user message so it changes without modifying the system prompt.

### 4. Page-number-specific few-shots (from `few_shots.json`)

Few-shot examples are loaded from `components/few_shots.json` at module startup.  
They are keyed by `age_group → page_bucket → example`.

**Page buckets:** `"1"`, `"2-3"`, `"4-5"`, `"6-8"`, `"9-10"`

**Why page-specific:** A page-1 example at first-principles depth calibrates the model differently than a page-8 example at maximum depth. Generic one-shot examples in the system prompt don't carry page-depth information.

**Why in the user message (not system):** The few-shot changes per call. System prompts should be stable.

**Format:**
```
## FEW-SHOT EXAMPLE  (topic: <topic_hint>, page <n>)
```json
{ ...example... }
```
```

### 5. Neurotype rules — research-grounded

#### ADHD
**Source:** Barkley (1997) *ADHD and the Nature of Self-Control*; Barkley (2011) *Executive Functions: What They Are, How They Work*.

Core deficit: executive function, specifically **temporal binding failure** — difficulty connecting present action to future consequence. Working memory is compressed. The dopaminergic reward system responds strongly to novelty and immediate salience.

**Writing implications:**
- Front-load the most concrete or surprising thing. Never build to a point.
- Sentences must be atomic. If two clauses, split them.
- No passive voice, no nested clauses.
- Each section self-contained — don't require memory of the prior sentence.

#### Autism
**Source:** Murray, Lesser & Lawson (2005) *Attention, monotropism and the diagnostic criteria for autism*. Philosophical Transactions of the Royal Society B.

Core model: **monotropism** — cognitive resources concentrate into a single, deeply focused interest tunnel. Context-switching between topics or interpretive frames is expensive. Implicit social and pragmatic cues are not automatically decoded.

**Writing implications:**
- Write out cause and effect explicitly. Never imply connections.
- Decode figurative language inline, immediately after use.
- Section structure must be consistent and predictable: state → example → result.
- No open-ended ambiguity — if uncertain, say so.

#### Dyslexia
**Source:** Shaywitz & Shaywitz (2008) *Paying attention to reading: The neurobiology of reading and dyslexia*. Development and Psychopathology.

Core deficit: **phonological processing** — orthographic mapping is effortful; word-level decoding consumes cognitive bandwidth that neurotypical readers allocate to comprehension. The gap is at the decoding stage, not at intelligence.

**Writing implications:**
- One idea per sentence.
- Simpler word always preferred when meaning is equal.
- No mid-sentence parenthetical insertions. No dashes mid-clause.
- Short paragraphs. White space is cognitive relief.

---

## Temperature Settings

Temperature is set at LLM construction time, not in the prompt.

| Age group | Temp | Rationale |
|-----------|------|-----------|
| 5-10      | 0.70 | Story/creative — needs variation and freshness |
| 10-15     | 0.65 | Scenario — needs personality but not randomness |
| 15-20     | 0.45 | Argument — needs precision and consistency |
| 20+       | 0.35 | Analytical — lowest randomness, highest precision |

---

## System / User Split Summary

| Content | Location |
|---------|----------|
| Role and persona | System |
| Output format (JSON shape) | System |
| Language instruction | System |
| Neurotype writing adjustment | System (injected as `{neurotype_rules}`) |
| Topic | User |
| Description | User |
| Page number | User |
| Page depth guidance | User (dynamic `{page_depth}`) |
| Few-shot example | User (dynamic `{few_shot_block}`) |
| Memory context (prior pages) | User |

---

## File References

| File | Purpose |
|------|---------|
| `components/page_generator_ai.py` | Main prompt construction and LangGraph pipeline |
| `components/few_shots.json` | Page-specific few-shot examples, keyed by age group and page bucket |
| `components/schemas.py` | `PageGenerationOutput` and `PageSectionDraft` Pydantic schemas |

---

## Extending This System

**Adding a new age group:** Add a `_SYSTEM_<group>` constant, add it to `self.age_prompts`, add a temperature to `_temperatures`, add few-shot entries to `few_shots.json`.

**Adding a new neurotype:** Add an entry to `_NEUROTYPE_RULES` with research citations in comments. Add matching entries to `few_shots.json` if type-specific examples are needed (currently examples are age-keyed, not neurotype-keyed).

**Changing depth arc:** Edit `_PAGE_DEPTH`. Each entry is a plain string — no code changes needed.

**Updating few-shots:** Edit `few_shots.json` directly. The file is loaded at import time; restart the server for changes to take effect.
