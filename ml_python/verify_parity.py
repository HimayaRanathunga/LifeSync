"""
Verifies that the Python feature pipeline (used for training) and the TypeScript one (used for
on-device inference) compute identical values.

This is the guard against train/serve skew: the model is fitted on vectors produced by
features.py, then queried in the app with vectors produced by src/ml/features.ts. If those two
drift apart, nothing raises an error — the model simply gets quietly worse, and no test would
catch it. Run this after touching either implementation.

Usage:  python ml_python/verify_parity.py
"""

import json
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import to_feature_vector          # noqa: E402
from historical_rate import HourlyAttempt, hour_kernel_success_rate  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOLERANCE = 1e-12

rng = random.Random(20260826)
cases = []
for _ in range(300):
    history = [
        {"hour": rng.randrange(24), "daysAgo": rng.randrange(60), "success": rng.random() < 0.6}
        for _ in range(rng.randrange(0, 25))
    ]
    cases.append(
        {
            "hour": rng.randrange(24),
            "preferredHour": rng.randrange(24),
            "isWeekend": rng.random() < 0.3,
            "streakLength": rng.randrange(0, 30),
            "habitAgeDays": rng.randrange(0, 120),
            "wakeHour": rng.randrange(4, 11),
            "workStartHour": rng.randrange(6, 15),
            "workEndHour": rng.randrange(14, 24),
            "history": history,
        }
    )

print(f"Comparing {len(cases)} random cases...")
# Written to a file rather than passed on argv: Windows caps the command line well below the
# size of a 300-case payload.
cases_path = os.path.join(REPO_ROOT, "ml_python", ".parity_cases.json")
with open(cases_path, "w", encoding="utf-8") as f:
    json.dump(cases, f)

try:
    proc = subprocess.run(
        ["npx", "--yes", "tsx", os.path.join("ml_python", "_ts_features.ts"), cases_path],
        cwd=REPO_ROOT, capture_output=True, text=True, shell=(os.name == "nt"),
    )
finally:
    os.remove(cases_path)
if proc.returncode != 0:
    print("TypeScript helper failed:\n", proc.stderr[-2000:])
    sys.exit(1)

ts_results = json.loads(proc.stdout)

mismatches = 0
worst = 0.0
for i, (case, ts) in enumerate(zip(cases, ts_results)):
    history = [HourlyAttempt(h["hour"], h["daysAgo"], h["success"]) for h in case["history"]]
    rate, evidence = hour_kernel_success_rate(history, case["hour"])
    py_vector = to_feature_vector(
        hour=case["hour"],
        preferred_hour=case["preferredHour"],
        is_weekend=case["isWeekend"],
        historical_success_rate=rate,
        evidence=evidence,
        streak_length=case["streakLength"],
        habit_age_days=case["habitAgeDays"],
        wake_hour=case["wakeHour"],
        work_start_hour=case["workStartHour"],
        work_end_hour=case["workEndHour"],
    )

    for a, b in zip(py_vector, ts["vector"]):
        diff = abs(a - b)
        worst = max(worst, diff)
        if diff > TOLERANCE:
            mismatches += 1
            if mismatches <= 5:
                print(f"  case {i}: python={a!r} ts={b!r} diff={diff:.3e}")

print(f"\nlargest absolute difference: {worst:.3e}")
if mismatches:
    print(f"FAIL — {mismatches} value(s) exceeded tolerance {TOLERANCE:.0e}")
    sys.exit(1)
print(f"PASS — Python and TypeScript features agree within {TOLERANCE:.0e}")
