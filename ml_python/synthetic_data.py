"""
Synthetic training population for the habit-timing model.

Why synthetic: the app has no user base to learn from, and a recommender that only works after
months of logging is useless on day one. Training on a simulated population is what solves cold
start — the shipped weights encode how habit timing tends to behave, and the per-user history
feature then adapts that to the individual.

Honesty note for the report: every metric produced from this data measures the model's ability to
recover a relationship this file encodes. It is evidence that the learning pipeline works, not
evidence about real human behaviour.
"""

import math
import random
from dataclasses import dataclass

from features import to_feature_vector
from historical_rate import HourlyAttempt, hour_kernel_success_rate

CANDIDATE_HOURS = list(range(6, 23))


@dataclass
class Archetype:
    name: str
    base_preferred_hour: float
    consistency: float       # probability of attempting near the intended hour
    baseline_success: float
    peak_boost: float        # extra P(success) at the intended hour
    sigma: float             # how sharply success falls off away from it
    wake_hour: int
    work_start_hour: int
    work_end_hour: int
    weekend_shift: float


# Each archetype has a genuinely different preferred hour, so no single population-wide "best
# time" can fit them all — which is precisely why hour is encoded relative to the user's own
# preference rather than absolutely.
ARCHETYPES = [
    Archetype("early-riser",   6.5,  0.88, 0.20, 0.62, 2.0, 5,  9, 17,  1.0),
    Archetype("lunch-breaker", 13.0, 0.72, 0.22, 0.50, 1.8, 7,  9, 18,  1.5),
    Archetype("after-work",    19.0, 0.78, 0.18, 0.58, 2.2, 7,  9, 18, -2.0),
    Archetype("night-owl",     22.0, 0.80, 0.24, 0.55, 2.0, 9, 11, 19,  0.5),
    Archetype("shift-worker",  10.0, 0.60, 0.25, 0.45, 3.0, 6, 14, 22,  0.0),
    Archetype("inconsistent",  16.0, 0.55, 0.30, 0.35, 3.5, 8, 10, 18,  2.0),
]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _is_hour_in_window(hour, start, end):
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end


def _is_awake(hour, wake_hour):
    return _is_hour_in_window(hour, wake_hour, (wake_hour + 17) % 24)


def success_probability(a: Archetype, attempt_hour, target_hour, streak, day_index, is_weekend):
    """
    The generator's ground-truth P(success).

    Factored out so the training labels and the ranking evaluation cannot silently disagree about
    what "the best hour" means.
    """
    distance = abs(((attempt_hour - target_hour + 12 + 24) % 24) - 12)
    p = a.baseline_success + a.peak_boost * math.exp(-(distance**2) / (2 * a.sigma**2))

    # Being awake, and not mid-shift, genuinely helps regardless of preference.
    if not _is_awake(attempt_hour, a.wake_hour):
        p -= 0.25
    if _is_hour_in_window(attempt_hour, a.work_start_hour, a.work_end_hour):
        p -= 0.12

    p += 0.015 * math.log2(min(streak, 10) + 1)   # momentum, deliberately small
    p += 0.05 * min(day_index / 30, 1)            # habits consolidate over the first month
    if is_weekend:
        p -= 0.03

    return _clamp(p, 0.05, 0.95)


def simulate_user(rng: random.Random, days: int):
    """Simulates one user's habit over `days`, returning training rows plus their raw history."""
    a = rng.choice(ARCHETYPES)
    declared_preferred_hour = int(_clamp(round(rng.gauss(a.base_preferred_hour, 1.0)), 6, 22))

    def target_hour_for(is_weekend):
        return _clamp(a.base_preferred_hour + (a.weekend_shift if is_weekend else 0), 0, 23)

    attempts = []
    rows = []
    streak = 0

    for day in range(days):
        is_weekend = day % 7 >= 5
        target_hour = target_hour_for(is_weekend)

        if rng.random() < a.consistency:
            attempt_hour = int(_clamp(round(target_hour + rng.uniform(-1.5, 1.5)), 0, 23))
        else:
            attempt_hour = rng.randrange(24)

        p = success_probability(a, attempt_hour, target_hour, streak, day, is_weekend)
        success = rng.random() < p

        # Features come strictly from history BEFORE today — no label leakage.
        prior = [HourlyAttempt(at.hour, day - i, at.success) for i, at in enumerate(attempts)]
        rate, evidence = hour_kernel_success_rate(prior, attempt_hour)

        rows.append(
            (
                to_feature_vector(
                    hour=attempt_hour,
                    preferred_hour=declared_preferred_hour,
                    is_weekend=is_weekend,
                    historical_success_rate=rate,
                    evidence=evidence,
                    streak_length=streak,
                    habit_age_days=day,
                    wake_hour=a.wake_hour,
                    work_start_hour=a.work_start_hour,
                    work_end_hour=a.work_end_hour,
                ),
                1 if success else 0,
                p,
            )
        )

        attempts.append(HourlyAttempt(attempt_hour, 0, success))
        streak = streak + 1 if success else 0

    return a, declared_preferred_hour, target_hour_for, attempts, rows


def generate_dataset(user_count: int, days: int, seed: int):
    """Returns (X, y, true_probabilities)."""
    rng = random.Random(seed)
    X, y, p_true = [], [], []
    for _ in range(user_count):
        _, _, _, _, rows = simulate_user(rng, days)
        for features, label, p in rows:
            X.append(features)
            y.append(label)
            p_true.append(p)
    return X, y, p_true


def generate_ranking_scenarios(user_count: int, days: int, seed: int):
    """
    One held-out user each, posed the question the recommender actually answers: which hour is
    best? Returns dicts carrying the per-hour rates, the generator's true probabilities, and the
    hour that genuinely maximises them.
    """
    rng = random.Random(seed)
    scenarios = []

    for _ in range(user_count):
        a, declared, target_hour_for, attempts, _ = simulate_user(rng, days)
        is_weekend = days % 7 >= 5
        target_hour = target_hour_for(is_weekend)

        history = [HourlyAttempt(at.hour, days - i, at.success) for i, at in enumerate(attempts)]

        rates = {}
        true_p = {}
        for hour in CANDIDATE_HOURS:
            rates[hour] = hour_kernel_success_rate(history, hour)
            true_p[hour] = success_probability(a, hour, target_hour, 0, days, is_weekend)

        scenarios.append(
            {
                "preferred_hour": declared,
                "is_weekend": is_weekend,
                "habit_age_days": days,
                "wake_hour": a.wake_hour,
                "work_start_hour": a.work_start_hour,
                "work_end_hour": a.work_end_hour,
                "rates": rates,
                "true_p": true_p,
                "best_hour": max(true_p, key=true_p.get),
            }
        )

    return scenarios
