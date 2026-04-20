# Stampede Window Predictor

FastAPI backend for PSI-based crowd pressure prediction with optional ML support from `model.pkl`.

## Structure

```text
AI/
|-- api.py
|-- model.py
|-- db.py
|-- model.pkl
|-- requirements.txt
`-- README.md
```

## Install

```bash
pip install -r requirements.txt
```

## Environment

Database settings live in `.env`:

```text
MONGO_URI=<your-mongodb-uri>
MONGO_DB=stampede_window_predictor
MONGO_COLLECTION=predictions
```

Use `.env.example` as the template. `.env` is ignored by Git.

## Run

Run from the `AI` folder:

```bash
python -m uvicorn api:app --reload
```

Open:

```text
http://127.0.0.1:8000/docs
```

## Endpoint

`POST /predict`

Request:

```json
{
  "entry_flow_rate_pax_per_min": 100,
  "exit_flow_rate_pax_per_min": 40,
  "queue_density_pax_per_m2": 5.5,
  "corridor_width_m": 2.5,
  "vehicle_count": 3,
  "transport_arrival_burst": 2,
  "weather": "Heat",
  "festival_peak": 1
}
```

Response:

```json
{
  "pressure_index": 94.63,
  "risk_level": "Moderate",
  "predicted_crush_window_min": 11.45,
  "reason": "High density (5.5 pax/m2), High inflow (60 pax/min net), Transport burst (2), Festival crowd (1), Adverse weather (Heat), Vehicle congestion (3)"
}
```

## PSI Logic

```text
net_inflow = max(0, entry_flow_rate_pax_per_min - exit_flow_rate_pax_per_min)
effective_width = max(corridor_width_m, 0.5)

pressure_index =
  (8.7 * queue_density_pax_per_m2)
  + (0.42 * (net_inflow / effective_width))
  + (1.9 * vehicle_count)
  + (10 * transport_arrival_burst)
  + (7 * festival_peak)
  + weather_penalty
```

Weather encoding:

```text
Clear = 0
Heat = 4
Rain = 6
```

Risk levels:

```text
Low: pressure_index < 50
Moderate: 50 <= pressure_index < 120
High: 120 <= pressure_index < 200
Critical: pressure_index >= 200
```

MongoDB is optional. If MongoDB is offline, the API still returns predictions.
