# Bright Minds - Prompt Engineering Guide (v3.0)

## Model

openai/gpt-oss-120b via Groq.

Uses Harmony role hierarchy: System > User.
System prompt instructions dominate user prompt instructions, and earlier system tokens carry stronger weight.
Therefore JSON constraints and role definition appear first.

## Prompt 3.0 Core Objective

Generate timeless, universal educational pages that avoid stereotypical assumptions while preserving age-appropriate depth.

## Architecture

System prompt:
- Role and audience per age group
- Output schema constraints
- Universality and fairness constraints
- Neurotype writing adjustments

User message:
- Topic and description
- Page number and page depth guidance
- Memory context from prior pages
- Page-bucket few-shot example
- Universality guardrails for dynamic context

This keeps system prompts stable and places runtime-varying information in the user turn.

## Balanced Universality Policy (Approved Option 2)

Default behavior:
- Do not assume identity, social status, family structure, profession, region, religion, ability, or special access.
- Use context-neutral scenarios when no context is provided.

Conditional behavior:
- If the user explicitly provides context (for example school, work, family, local environment), the model may use that context.
- Do not extend beyond provided context with unrelated assumptions.

This is "balanced" universality: context is allowed only when user-specified.

## GPT-OSS Best Practices Applied

1. Keep output shape constraints at the top of each system prompt.
2. Keep system prompts stable by age group.
3. Keep dynamic guidance (few-shots, memory, depth) in user message.
4. Use concrete, observable language in instructions to improve schema-consistent outputs.
5. Keep anti-stereotype constraints explicit and close to role instructions.

## Prompt Structure

Each system prompt includes:
1. Output format constraints
2. Role constraints for the age group
3. Universality and fairness constraints
4. Quality checks for concrete output
5. Language instruction
6. Neurotype instruction injection

## Few-Shot Strategy

Few-shots are keyed by age group and page bucket:
- 1
- 2-3
- 4-5
- 6-8
- 9-10

Design principles:
- Timeless and broadly relatable settings
- Concrete scenes for image_prompt fields
- No culturally narrow default assumptions
- Arc alignment with page depth progression

## Quality Rubric

The generated page should satisfy all checks:
1. JSON schema exactness: title, three sections, action_item.
2. Concrete section text and image prompts.
3. No implicit stereotype assumptions.
4. Context-neutral by default; context-specific only when input asks.
5. Action item feasible with minimal resources.

## Neurotype Layer

Neurotype rules remain research-grounded and are injected into system prompts.
They adapt language processing style, not social assumptions.

## Runtime Notes

- few_shots.json is loaded at import time.
- Restart AI layer after few-shot or prompt changes.
- Structured output path for page generation remains json_mode.

## Files

- components/page_generator_ai.py: prompt templates and user template.
- components/few_shots.json: age-group and page-depth few-shots.
- components/schemas.py: output schema enforced by structured output.
