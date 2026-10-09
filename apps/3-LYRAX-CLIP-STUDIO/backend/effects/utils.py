"""Small deterministic helpers shared by visual-effect plugins."""
from __future__ import annotations


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, float(value)))


def deterministic_random(seed: int, index: int, lower: float = 0.0, upper: float = 1.0) -> float:
    """Stable pseudo-random value in [lower, upper], derived only from inputs."""
    x = ((int(seed) * 1103515245 + 12345 + int(index) * 2654435761) & 0x7FFFFFFF)
    normalized = (x % 10000) / 10000.0
    return lower + normalized * (upper - lower)


def seed_for_time(time_seconds: float, salt: int = 0) -> int:
    return (int(round(float(time_seconds) * 1000.0)) * 997 + int(salt) * 104729) & 0x7FFFFFFF


def normalize_seed(value, fallback: int) -> int:
    """Normalize imported seeds and replace null/malformed values deterministically."""
    try:
        if value is None or isinstance(value, bool):
            raise ValueError("seed is not an integer")
        return int(value) & 0x7FFFFFFF
    except (TypeError, ValueError, OverflowError):
        return int(fallback) & 0x7FFFFFFF
