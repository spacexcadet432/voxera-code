from __future__ import annotations


def _median(sorted_vals: list[float]) -> float:
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2:
        return float(sorted_vals[mid])
    return float(sorted_vals[mid - 1] + sorted_vals[mid]) / 2.0


def latency_aggregate(runs: list[dict[str, float]], keys: tuple[str, ...]) -> dict[str, float | int]:
    """
    Rolling mean + median (p50) for each key over runs (ignores missing or non-positive for that key).
    """

    out: dict[str, float | int] = {"n": len(runs)}
    if not runs:
        for k in keys:
            out[f"{k}_avg"] = 0.0
            out[f"{k}_p50"] = 0.0
        return out

    for k in keys:
        vals = sorted(float(r[k]) for r in runs if k in r and float(r[k]) > 0)
        if not vals:
            out[f"{k}_avg"] = 0.0
            out[f"{k}_p50"] = 0.0
            continue
        out[f"{k}_avg"] = sum(vals) / len(vals)
        out[f"{k}_p50"] = _median(vals)
    return out
