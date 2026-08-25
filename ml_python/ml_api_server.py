"""
LifeSync AI - Python ML REST API Server (Flask)
Exposes endpoints for habit slot prediction and food calorie calibration.
Run: python ml_api_server.py
"""

from flask import Flask, request, jsonify
import numpy as np
import json
import os

app = Flask(__name__)

# Load Pre-trained Weights if available
dir_path = os.path.dirname(os.path.abspath(__file__))
habit_weights_path = os.path.join(dir_path, "habit_model_weights.json")
calorie_weights_path = os.path.join(dir_path, "calorie_model_weights.json")

habit_model_data = None
calorie_model_data = None

if os.path.exists(habit_weights_path):
    with open(habit_weights_path, "r") as f:
        habit_model_data = json.load(f)

if os.path.exists(calorie_weights_path):
    with open(calorie_weights_path, "r") as f:
        calorie_model_data = json.load(f)

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "engine": "LifeSync Python Machine Learning Microservice",
        "version": "2.4.0",
        "models": {
            "habit_recommender": habit_model_data is not None,
            "calorie_calibrator": calorie_model_data is not None
        }
    })

@app.route("/api/predict_habit_slot", methods=["POST"])
def predict_habit_slot():
    """
    Scores candidate hours [6..22] and returns optimal time with probability.
    Body JSON: { isWeekend: bool, sleepHours: float, streakLength: int, habitAgeDays: int }
    """
    data = request.get_json() or {}
    is_weekend = float(data.get("isWeekend", False))
    sleep_norm = float(data.get("sleepHours", 7.5)) / 12.0
    streak_norm = min(float(data.get("streakLength", 0)) / 30.0, 1.0)
    age_norm = min(float(data.get("habitAgeDays", 1)) / 90.0, 1.0)
    
    weights = habit_model_data["weights"] if habit_model_data else [0.3, -0.4, 1.8, 0.9, 0.7, 0.3]
    bias = habit_model_data["bias"] if habit_model_data else -0.8
    
    best_hour = 7
    best_prob = -1.0
    
    for h in range(6, 23):
        h_norm = h / 24.0
        hist_rate = 0.8 if 7 <= h <= 9 or 17 <= h <= 19 else 0.5
        
        x = np.array([h_norm, is_weekend, hist_rate, sleep_norm, streak_norm, age_norm])
        z = np.dot(weights, x) + bias
        prob = 1.0 / (1.0 + np.exp(-z))
        
        if prob > best_prob:
            best_prob = prob
            best_hour = h
            
    return jsonify({
        "suggestedHour": best_hour,
        "suggestedTimeFormatted": f"{best_hour:02d}:00",
        "confidenceProbability": float(best_prob),
        "recommendationReason": f"Circadian peak focus slot ({int(best_prob * 100)}% completion likelihood)."
    })

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 LifeSync Python ML API Server running on http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
