"""
Trains the habit-timing model in Python (scikit-learn) and exports the fitted weights into
src/ml/model/weights.generated.ts, where they compile straight into the React Native bundle.

Run:  python ml_python/train_habit_recommender.py

Architecture note: Python cannot run on the phone, so it is used for training only. The exported
weights are a few dozen floats, and inference is a dot product plus a sigmoid — cheap enough to do
on-device with no native ML runtime, which is what lets recommendations work offline.

The evaluation is deliberately unkind to the model:

  * Accuracy and F1 are printed NEXT TO what a do-nothing "always predict success" classifier
    scores on the same split. On an imbalanced target those metrics can look strong while carrying
    no information, and printing them side by side makes that impossible to miss.
  * ROC AUC and Brier skill are reported because they are threshold-free — the deployed model never
    applies a 0.5 threshold, it only ranks hours against each other.
  * A top-1 hour ranking evaluation measures the job the model actually does, against four rival
    policies including "just use the user's own preferred time". The model is allowed to lose. If it
    does, that is the result that gets written down.
"""

import json
import math
import os
import random
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import FEATURE_NAMES, to_feature_vector  # noqa: E402
from synthetic_data import CANDIDATE_HOURS, generate_dataset, generate_ranking_scenarios  # noqa: E402

TRAIN_USERS = 600
VAL_USERS = 200
RANK_USERS = 1500
DAYS = 40

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_TS = os.path.join(REPO_ROOT, "src", "ml", "model", "weights.generated.ts")
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "habit_model_weights.json")


def evaluate(model, scaler, X, y, p_true):
    Xs = scaler.transform(X)
    probs = model.predict_proba(Xs)[:, 1]
    preds = (probs >= 0.5).astype(int)
    y = np.asarray(y)

    positive_rate = float(y.mean())

    return {
        "n": int(len(y)),
        "positiveRate": positive_rate,
        "accuracy": float((preds == y).mean()),
        "precision": float(precision_score(y, preds, zero_division=0)),
        "recall": float(recall_score(y, preds, zero_division=0)),
        "f1": float(f1_score(y, preds, zero_division=0)),
        # An "always predict success" classifier: accuracy equals the positive rate, recall is 1,
        # so F1 = 2p/(p+1). Reported so the model's own F1 can never be quoted without its floor.
        "alwaysYesAccuracy": positive_rate,
        "alwaysYesF1": (2 * positive_rate) / (positive_rate + 1),
        "rocAuc": float(roc_auc_score(y, probs)),
        "brier": float(brier_score_loss(y, probs)),
        "brierSkillScore": float(
            1 - brier_score_loss(y, probs) / brier_score_loss(y, np.full_like(probs, positive_rate))
        ),
        # What an oracle knowing the generator's own P(success) would score — the real ceiling.
        "bayesCeilingAccuracy": float(np.mean(np.maximum(p_true, 1 - np.asarray(p_true)))),
    }


def evaluate_ranking(model, scaler):
    scenarios = generate_ranking_scenarios(RANK_USERS, DAYS, seed=999)
    rng = random.Random(7)

    def pick_model(s):
        vectors = []
        for hour in CANDIDATE_HOURS:
            rate, evidence = s["rates"][hour]
            vectors.append(
                to_feature_vector(
                    hour=hour,
                    preferred_hour=s["preferred_hour"],
                    is_weekend=s["is_weekend"],
                    historical_success_rate=rate,
                    evidence=evidence,
                    streak_length=0,
                    habit_age_days=s["habit_age_days"],
                    wake_hour=s["wake_hour"],
                    work_start_hour=s["work_start_hour"],
                    work_end_hour=s["work_end_hour"],
                )
            )
        probs = model.predict_proba(scaler.transform(vectors))[:, 1]
        return CANDIDATE_HOURS[int(np.argmax(probs))]

    policies = [
        ("trained model", pick_model),
        ("argmax(historical rate)", lambda s: max(CANDIDATE_HOURS, key=lambda h: s["rates"][h][0])),
        ("user's preferred hour", lambda s: s["preferred_hour"]),
        ("random hour", lambda s: rng.choice(CANDIDATE_HOURS)),
        ("fixed 06:00", lambda s: 6),
    ]

    results = []
    for name, pick in policies:
        regret = top1 = within1h = 0
        for s in scenarios:
            chosen = pick(s)
            best_p = s["true_p"][s["best_hour"]]
            got_p = s["true_p"].get(chosen, 0.0)
            regret += (best_p - got_p) * 100
            if chosen == s["best_hour"]:
                top1 += 1
            if abs(chosen - s["best_hour"]) <= 1:
                within1h += 1
        n = len(scenarios)
        results.append(
            {
                "name": name,
                "meanRegret": regret / n,
                "top1": 100 * top1 / n,
                "within1h": 100 * within1h / n,
            }
        )
    return results


def main():
    print(f"Generating {TRAIN_USERS} training users x {DAYS} days...")
    X_train, y_train, p_train = generate_dataset(TRAIN_USERS, DAYS, seed=1)
    X_val, y_val, p_val = generate_dataset(VAL_USERS, DAYS, seed=2)
    print(f"  train {len(X_train)} rows | validation {len(X_val)} rows")

    scaler = StandardScaler().fit(X_train)

    print("Training (scikit-learn LogisticRegression, L2)...")
    model = LogisticRegression(C=1.0, max_iter=2000, solver="lbfgs")
    model.fit(scaler.transform(X_train), y_train)

    train_metrics = evaluate(model, scaler, X_train, y_train, p_train)
    val_metrics = evaluate(model, scaler, X_val, y_val, p_val)
    ranking = evaluate_ranking(model, scaler)

    def pc(v):
        return f"{v * 100:.1f}%"

    print("\n=== Binary classification (validation) ===")
    print(f"  positive rate        {pc(val_metrics['positiveRate'])}")
    print(f"  accuracy             {pc(val_metrics['accuracy'])}   (always-yes: {pc(val_metrics['alwaysYesAccuracy'])})")
    print(f"  F1                   {pc(val_metrics['f1'])}   (always-yes: {pc(val_metrics['alwaysYesF1'])})")
    print(f"  Bayes ceiling        {pc(val_metrics['bayesCeilingAccuracy'])}")
    print(f"  ROC AUC              {val_metrics['rocAuc']:.4f}   (chance: 0.5000)")
    print(f"  Brier skill score    {val_metrics['brierSkillScore']:.4f}")

    print(f"\n=== Top-1 hour selection ({RANK_USERS} held-out users) ===")
    print("  policy                        regret   top-1   within 1h")
    for p in ranking:
        print(f"  {p['name']:<28} {p['meanRegret']:6.2f}  {p['top1']:5.1f}%  {p['within1h']:8.1f}%")

    beats_both = (
        ranking[0]["meanRegret"] < ranking[1]["meanRegret"]
        and ranking[0]["meanRegret"] < ranking[2]["meanRegret"]
    )
    print(f"\n  Pre-registered criterion (model must beat BOTH baselines): {'MET' if beats_both else 'NOT MET'}")

    weights = model.coef_[0].tolist()
    bias = float(model.intercept_[0])
    means = scaler.mean_.tolist()
    stds = scaler.scale_.tolist()

    payload = {
        "weights": weights,
        "bias": bias,
        "featureMeans": means,
        "featureStds": stds,
        "featureNames": list(FEATURE_NAMES),
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({**payload, "trainMetrics": train_metrics, "valMetrics": val_metrics, "ranking": ranking}, f, indent=2)

    ranking_lines = "\n".join(
        f" *   {p['name']:<26} regret {p['meanRegret']:6.2f}  top-1 {p['top1']:.1f}%  within-1h {p['within1h']:.1f}%"
        for p in ranking
    )

    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, "w", encoding="utf-8") as f:
        f.write(
            f"""/**
 * AUTO-GENERATED by ml_python/train_habit_recommender.py — do not edit by hand.
 * Re-run with `npm run train` (which invokes the Python trainer).
 *
 * Fitted with scikit-learn LogisticRegression (L2, lbfgs) on {TRAIN_USERS} simulated users x
 * {DAYS} days ({len(X_train)} rows) across 6 behavioural archetypes. Python trains; the phone
 * only evaluates a dot product and a sigmoid, which is why recommendations work offline.
 *
 * All data is synthetic: these figures measure how well the pipeline recovers a relationship the
 * generator encodes, not real-world human behaviour.
 *
 * Validation ({val_metrics['n']} rows, {VAL_USERS} unseen users):
 *   positive rate     {pc(val_metrics['positiveRate'])}
 *   accuracy          {pc(val_metrics['accuracy'])}  (always-yes baseline {pc(val_metrics['alwaysYesAccuracy'])})
 *   F1                {pc(val_metrics['f1'])}  (always-yes baseline {pc(val_metrics['alwaysYesF1'])})
 *   Bayes ceiling     {pc(val_metrics['bayesCeilingAccuracy'])}
 *   ROC AUC           {val_metrics['rocAuc']:.4f}
 *   Brier skill       {val_metrics['brierSkillScore']:.4f}
 *
 * Top-1 hour selection, {RANK_USERS} held-out users (lower regret is better):
{ranking_lines}
 *
 * Pre-registered criterion (beat both the historical-rate and preferred-hour policies): {'MET' if beats_both else 'NOT MET'}
 */
import type {{ TrainedModel }} from '../logisticRegression';

export const trainedModel: TrainedModel = {json.dumps(payload, indent=2)};

export const trainingMetadata = {json.dumps({"trainMetrics": train_metrics, "valMetrics": val_metrics, "ranking": ranking, "trainUsers": TRAIN_USERS, "valUsers": VAL_USERS, "days": DAYS}, indent=2)};
"""
        )

    print(f"\nWrote {OUT_TS}")
    print(f"Wrote {OUT_JSON}")


if __name__ == "__main__":
    main()
