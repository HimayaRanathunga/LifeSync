# 🤖 LifeSync AI - Python Machine Learning Engine

This module contains the standalone **Python Machine Learning & Deep Learning subsystem** for LifeSync (CMP 7003 PRAC1 Project).

## 📂 Module Structure
- `train_habit_recommender.py`: Supervised Logistic Regression model with SGD & L2 regularization for circadian habit slot optimization.
- `train_calorie_model.py`: Multiple Linear / Ridge Regression model for portion-to-calorie calibration.
- `food_classifier.py`: Real-world botanical food vision model for Sri Lankan dishes and Non-Food detection.
- `ml_api_server.py`: Flask REST microservice API exposing `/api/predict_habit_slot` and `/api/predict_food_calories`.
- `requirements.txt`: Package dependencies.

## 🚀 Execution Instructions
```bash
cd ml_python
pip install -r requirements.txt
python train_habit_recommender.py
python train_calorie_model.py
python ml_api_server.py
```
