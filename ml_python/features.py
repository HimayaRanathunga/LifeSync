"""
Feature engineering for the habit-timing model.

CRITICAL: this must stay byte-for-byte equivalent to src/ml/features.ts, which computes the same
vector on-device at inference time. Any divergence is train/serve skew — the model would be fitted
on one representation and queried with another, and nothing would report an error. `verify_parity.py`
checks the two implementations agree on random inputs; run it after touching either file.

Two decisions differ from a naive encoding, both driven by measurement:

1. Hour is encoded RELATIVE to the user's declared preferred hour, not as an absolute clock
   position. An absolute sinusoid can only learn a single population-wide "good time", which is
   wrong for anyone whose routine differs, and measured worse than simply using the user's own
   chosen time.

2. The user's waking and working hours are inputs. Onboarding already collects wakeTime,
   workStart and workEnd; nothing read them. A slot before the user wakes, or in the middle of
   their working day, is a poor suggestion no matter what the history says.
"""

import math

FEATURE_NAMES = [
    "hourOffsetSin",
    "hourOffsetCos",
    "isWeekend",
    "historicalSuccessRate",
    "evidenceNorm",
    "streakNorm",
    "habitAgeNorm",
    "isAwake",
    "isDuringWork",
]


def wrap_hour_delta(delta: float) -> float:
    """Signed hour difference wrapped to [-12, 12]: 23:00 vs 01:00 is +2, not -22."""
    d = ((delta % 24) + 24) % 24
    if d > 12:
        d -= 24
    return d


def is_hour_in_window(hour: int, start: int, end: int) -> bool:
    """Windows crossing midnight (a night shift, 22:00-06:00) need the inverted test."""
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end


def to_feature_vector(
    hour: int,
    preferred_hour: int,
    is_weekend: bool,
    historical_success_rate: float,
    evidence: float,
    streak_length: int,
    habit_age_days: int,
    wake_hour: int,
    work_start_hour: int,
    work_end_hour: int,
) -> list:
    offset = wrap_hour_delta(hour - preferred_hour)

    return [
        # A circle keeps "3 hours early" and "3 hours late" distinguishable while staying
        # continuous across the wrap point.
        math.sin((2 * math.pi * offset) / 24),
        math.cos((2 * math.pi * offset) / 24),
        1.0 if is_weekend else 0.0,
        historical_success_rate,
        # log1p keeps the first few observations informative without letting long histories
        # dominate the scale.
        min(1.0, math.log1p(evidence) / math.log1p(20)),
        min(streak_length, 14) / 14,
        min(habit_age_days, 60) / 60,
        1.0 if is_hour_in_window(hour, wake_hour, (wake_hour + 17) % 24) else 0.0,
        1.0 if is_hour_in_window(hour, work_start_hour, work_end_hour) else 0.0,
    ]
