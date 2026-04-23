from __future__ import annotations

from typing import Any, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import Tool

try:
    from langchain.agents import AgentExecutor, create_tool_calling_agent
except Exception:  # noqa: BLE001
    AgentExecutor = Any
    create_tool_calling_agent = None


def build_future_agent(llm) -> Optional[AgentExecutor]:
    """Scaffold for future routing between generation components."""
    if llm is None or create_tool_calling_agent is None:
        return None

    tools = [
        Tool(
            name="page_guideline_lookup",
            description="Returns short guidance for generating a progressive educational page.",
            func=lambda _: "Keep one concept per page, concrete examples first, then concise insight.",
        ),
        Tool(
            name="cover_guideline_lookup",
            description="Returns short guidance for generating a kid-friendly educational cover prompt.",
            func=lambda _: "Use concrete visible scene, bright palette, and title-safe top area.",
        ),
    ]

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a routing helper for educational content generation."),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ]
    )

    try:
        agent = create_tool_calling_agent(llm, tools, prompt)
        return AgentExecutor(agent=agent, tools=tools, verbose=False)
    except Exception:
        return None
