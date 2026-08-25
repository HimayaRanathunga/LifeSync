"""
LifeSync AI - Supervised Logistic Regression Habit Recommender (Python ML)
Academic Formulation for CMP 7003 PRAC1 Coursework.
Uses Stochastic Gradient Descent (SGD) with L2 Weight Decay Regularization.
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import numpy as np
import json
import os

def generate_synthetic_habit_dataset(n_samples=3000, seed=42):
    np.random.seed(seed)
    
    hours = np.random.randint(6, 23, size=n_samples)
    hour_norm = hours / 24.0
    is_weekend = np.random.choice([0.0, 1.0], size=n_samples, p=[0.71, 0.29])
    historical_rate = np.random.beta(a=5, b=2, size=n_samples)
    
    sleep_hours = np.random.normal(loc=7.5, scale=1.2, size=n_samples)
    sleep_norm = np.clip(sleep_hours / 12.0, 0.0, 1.0)
    
    streak = np.random.exponential(scale=6.0, size=n_samples)
    streak_norm = np.clip(streak / 30.0, 0.0, 1.0)
    
    habit_age = np.random.uniform(1, 90, size=n_samples)
    habit_age_norm = np.clip(habit_age / 90.0, 0.0, 1.0)
    
    time_affinity = np.sin((hours - 6) / 16.0 * np.pi)
    
    z = (
        -0.8
        + 1.8 * historical_rate
        + 1.2 * time_affinity
        + 0.9 * sleep_norm
        + 0.7 * streak_norm
        - 0.4 * is_weekend * (hours < 10)
        + 0.3 * habit_age_norm
        + np.random.normal(0, 0.20, size=n_samples)
    )
    
    prob = 1.0 / (1.0 + np.exp(-z))
    y = (prob >= 0.5).astype(float)
    
    X = np.column_stack([
        hour_norm,
        is_weekend,
        historical_rate,
        sleep_norm,
        streak_norm,
        habit_age_norm
    ])
    
    return X, y

class LogisticRegressionSGD:
    def __init__(self, lr=0.08, l2_lambda=0.001, epochs=60):
        self.lr = lr
        self.l2_lambda = l2_lambda
        self.epochs = epochs
        self.weights = None
        self.bias = 0.0

    def sigmoid(self, z):
        return 1.0 / (1.0 + np.exp(-np.clip(z, -25.0, 25.0)))

    def fit(self, X, y):
        n_samples, n_features = X.shape
        self.weights = np.zeros(n_features)
        self.bias = 0.0

        for epoch in range(self.epochs):
            indices = np.random.permutation(n_samples)
            for idx in indices:
                xi = X[idx]
                yi = y[idx]
                
                z = np.dot(self.weights, xi) + self.bias
                pred = self.sigmoid(z)
                err = pred - yi
                
                grad_w = err * xi + (self.l2_lambda / n_samples) * self.weights
                grad_b = err
                
                self.weights -= self.lr * grad_w
                self.bias -= self.lr * grad_b

    def predict_proba(self, X):
        z = np.dot(X, self.weights) + self.bias
        return self.sigmoid(z)

    def predict(self, X):
        return (self.predict_proba(X) >= 0.5).astype(int)

def evaluate_and_export():
    print("=" * 65)
    print("LifeSync Python Machine Learning: Habit Recommender Engine")
    print("=" * 65)
    
    X, y = generate_synthetic_habit_dataset(n_samples=3000)
    
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    model = LogisticRegressionSGD(lr=0.08, l2_lambda=0.001, epochs=80)
    model.fit(X_train, y_train)
    
    probs = model.predict_proba(X_test)
    preds = model.predict(X_test)
    
    acc = np.mean(preds == y_test)
    eps = 1e-15
    clipped_p = np.clip(probs, eps, 1 - eps)
    loss = -np.mean(y_test * np.log(clipped_p) + (1 - y_test) * np.log(1 - clipped_p))
    
    print(f"Test Accuracy:   {acc * 100:.2f}%")
    print(f"Test Log-Loss:   {loss:.4f}")
    print(f"Model Weights:   {np.round(model.weights, 4)}")
    print(f"Model Bias:      {model.bias:.4f}")
    
    feature_names = [
        "hour_norm",
        "is_weekend",
        "historical_success_rate",
        "sleep_norm",
        "streak_norm",
        "habit_age_norm"
    ]
    
    export_payload = {
        "model": "Supervised Logistic Regression (SGD + L2)",
        "weights": model.weights.tolist(),
        "bias": float(model.bias),
        "features": feature_names,
        "metrics": {
            "accuracy": float(acc),
            "log_loss": float(loss),
            "epochs": 80,
            "samples": len(X)
        }
    }
    
    out_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "habit_model_weights.json")
    with open(out_file, "w") as f:
        json.dump(export_payload, f, indent=2)
    print(f"Exported trained model weights -> {out_file}")
    print("=" * 65)

if __name__ == "__main__":
    evaluate_and_export()
