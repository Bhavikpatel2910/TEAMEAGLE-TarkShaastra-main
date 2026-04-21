# OPTIONAL: AI PREDICTION SERVICE (PYTHON)

## Overview

The `AI/` folder contains an optional Python FastAPI service for advanced predictions. This is **completely optional** - the main backend (Node.js) already handles all predictions.

**When to use:**
- ✅ Want ML-enhanced predictions (optional model.pkl)
- ❌ Not needed for basic system to work

---

## Setup & Run

### Step 1: Activate Python Environment

**Windows:**
```bash
cd AI
.venv\Scripts\activate
```

**Linux/Mac:**
```bash
cd AI
source .venv/bin/activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
# OR if no requirements.txt:
pip install fastapi uvicorn pydantic pandas scikit-learn joblib
```

### Step 3: Run the API

```bash
# Make sure you're in the AI folder
cd AI
python -m uvicorn api:app --reload --port 5000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:5000
INFO:     Application startup complete
```

---

## Verify It's Working

```bash
# In another terminal
curl http://localhost:5000/
# Should return: {"status":"ok",...}
```

---

## ⚠️ COMMON ERRORS & FIXES

### Error: "Could not import module 'api'"

**Cause:** Running from wrong directory

**Fix:**
```bash
# Make sure you're in AI folder
cd AI
python -m uvicorn api:app --reload
```

### Error: "No module named 'fastapi'"

**Cause:** Dependencies not installed

**Fix:**
```bash
pip install fastapi uvicorn pydantic
```

### Error: "Port 5000 already in use"

**Fix:**
```bash
python -m uvicorn api:app --port 5001
# Or kill the process using port 5000
```

---

## Architecture

```
Frontend (port 8000)
    ↓
Node.js Backend (port 5001) ← MAIN API (Always needed)
    ├─→ MongoDB (optional)
    └─→ Python AI API (port 5000) ← OPTIONAL ENHANCEMENT
```

---

## Integration

The Node.js backend can optionally call this Python API:

```javascript
// In backend/.env
AI_API_URL=http://localhost:5000
```

If the Python API is running, the backend will use it for enhanced predictions.
If it's not running, the backend falls back to pure PSI calculation.

---

## Testing the Python API Directly

```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "entry_flow_rate_pax_per_min": 15,
    "exit_flow_rate_pax_per_min": 8,
    "queue_density_pax_per_m2": 4,
    "corridor_width_m": 6,
    "vehicle_count": 3,
    "transport_arrival_burst": 2,
    "weather": "rain",
    "festival_peak": 1
  }'
```

**Response:**
```json
{
  "pressure_index": 25.34,
  "risk_level": "Low",
  "predicted_crush_window_min": 18.5,
  "reason": "Stable crowd conditions"
}
```

---

## IS THIS REQUIRED?

**NO** - The Node.js backend works perfectly without this Python service.

**USE CASES FOR PYTHON API:**
- ✅ Running ML predictions
- ✅ Advanced data analysis
- ✅ Scientific computing
- ✅ Using trained model.pkl

**NOT NEEDED IF:**
- ✅ Using only PSI calculation
- ✅ Don't have ML model.pkl
- ✅ Want simple system

---

## Summary

| Component | Required | Port |
|-----------|----------|------|
| Node.js Backend | ✅ YES | 5001 |
| Frontend Server | ✅ YES | 8000 |
| Python AI API | ❌ NO (Optional) | 5000 |
| MongoDB | ❌ NO (Optional) | 27017 |

---

**Status:** This is an optional enhancement. System works fully without it! 🎉
