from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class LlmStreamResult:
    """OpenAI streaming chat completion with measurable wall and TTFT."""

    reply: str
    wall_ms: float
    """Wall-clock ms from HTTP stream start to last token."""
    ttft_ms: float | None
    """Ms from stream start to first non-empty `delta.content` (time-to-first-token)."""
