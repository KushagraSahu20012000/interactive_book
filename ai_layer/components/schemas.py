from __future__ import annotations

from pydantic import BaseModel, Field

IMAGE_DESCRIPTION_INSTRUCTION = "Describe a single visible scene with concrete objects and actions, using no adjectives or style references, within 6 words."
AI_IMAGE_DESCRIPTION_INSTRUCTION = "Describe a single visible scene with concrete objects and actions. Include style and mood references, within 12 words."

class PageSectionDraft(BaseModel):
    position: int = Field(ge=1, le=3)
    text: str = Field(
        min_length=1,
        description="Section text must be non-empty and within 30 words.",
    )
    image_prompt: str = Field(min_length=1, description=IMAGE_DESCRIPTION_INSTRUCTION)


class PageGenerationOutput(BaseModel):
    title: str = Field(min_length=1)
    sections: list[PageSectionDraft] = Field(min_length=3, max_length=3)
    action_item: str = Field(min_length=1)
    error_message: str = ""


class BookInitOutput(BaseModel):
    title: str = Field(min_length=1)
    cover_prompt: str = Field(min_length=1, description=IMAGE_DESCRIPTION_INSTRUCTION)
    error_message: str = ""
