from __future__ import annotations

from pydantic import BaseModel, Field


class PageSectionDraft(BaseModel):
    position: int = Field(ge=1, le=3)
    text: str = Field(min_length=1)
    image_prompt: str = Field(min_length=1, description="within 6 words, no adjectives, focused on objects and actions, no style or artist references")


class PageGenerationOutput(BaseModel):
    title: str = Field(min_length=1)
    sections: list[PageSectionDraft] = Field(min_length=3, max_length=3)
    action_item: str = Field(min_length=1)


class BookInitOutput(BaseModel):
    title: str = Field(min_length=1)
    cover_prompt: str = Field(min_length=1, description="within 6 words, no adjectives, focused on objects and actions, no style or artist references")
