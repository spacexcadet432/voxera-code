"""Telemetry helpers (latency aggregation, no external collectors)."""

from .stats import latency_aggregate

__all__ = ["latency_aggregate"]
