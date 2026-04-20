const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Corridor = require('../models/Corridor');
const SensorData = require('../models/SensorData');
const { callAIPrediction } = require('../services/aiService');
const {
  getCorridor: getMemoryCorridor,
  listHistory: listMemoryHistory,
  saveAlert,
} = require('../utils/runtimeStore');

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function normalizeHistoryInput(corridor, sensor) {
  return {
    entryRate: sensor.entryRate,
    exitRate: sensor.exitRate,
    density: sensor.density,
    width: corridor?.width ?? sensor.width ?? 0.5,
    vehicleCount: sensor.vehicleCount ?? 0,
    transportArrivalBurst: sensor.transportArrivalBurst ?? sensor.transportBurst ?? 0,
    weather: sensor.weather ?? sensor.weatherPenalty ?? 'Clear',
    festivalPeak: sensor.festivalPeak ?? sensor.festival ?? 0,
  };
}

function isValidPredictionShape(payload) {
  return payload &&
    typeof payload.pressure_index === 'number' &&
    typeof payload.predicted_crush_window_min === 'number' &&
    typeof payload.risk_level === 'string' &&
    typeof payload.reason === 'string';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePredictInput(body = {}, widthFallback = 0.5) {
  return {
    entryRate: toNumber(body.entryRate ?? body.entry_flow_rate_pax_per_min, 0),
    exitRate: toNumber(body.exitRate ?? body.exit_flow_rate_pax_per_min, 0),
    density: toNumber(body.density ?? body.queue_density_pax_per_m2, 0),
    width: Math.max(0.5, toNumber(body.width ?? body.corridor_width_m, widthFallback)),
    vehicleCount: toNumber(body.vehicleCount ?? body.vehicle_count, 0),
    transportArrivalBurst: toNumber(body.transportArrivalBurst ?? body.transport_arrival_burst, 0),
    weather: String(body.weather || 'Clear'),
    festivalPeak: toNumber(body.festivalPeak ?? body.festival_peak, 0),
  };
}

function buildPredictionAlert(corridorId, prediction) {
  const cpi = Number(prediction?.pressure_index);
  const riskLevel = String(prediction?.risk_level || '').toUpperCase();

  if (!Number.isFinite(cpi)) return null;
  if (riskLevel !== 'HIGH' && riskLevel !== 'CRITICAL' && cpi < 120) return null;

  return {
    corridorId,
    level: riskLevel === 'CRITICAL' || cpi >= 200 ? 'CRITICAL' : 'WARNING',
    message: `High predicted CPI detected (${cpi})`,
  };
}

exports.getPrediction = async (req, res) => {
  try {
    const corridorId = String(req.params.id || '').trim();
    if (!corridorId) {
      return res.status(400).json({ error: 'corridor id is required' });
    }

    if (!isDbConnected()) {
      const corridor = getMemoryCorridor(corridorId);
      const history = listMemoryHistory(corridorId, 10);
      const latest = history[history.length - 1];

      if (!latest) {
        return res.status(404).json({ error: 'No sensor history for this corridor' });
      }

      const payload = normalizePredictInput(normalizeHistoryInput(corridor, latest));
      const prediction = await callAIPrediction(payload);
      if (!isValidPredictionShape(prediction)) {
        return res.status(502).json({ error: 'Invalid AI prediction response shape' });
      }
      return res.json(prediction);
    }

    const [corridor, history] = await Promise.all([
      Corridor.findById(corridorId).lean(),
      SensorData.find({ corridorId }).sort({ timestamp: -1 }).limit(10).lean(),
    ]);

    if (!history.length) {
      return res.status(404).json({ error: 'No sensor history for this corridor' });
    }

    const payload = normalizePredictInput(normalizeHistoryInput(corridor, history[0]));
    const prediction = await callAIPrediction(payload);
    if (!isValidPredictionShape(prediction)) {
      return res.status(502).json({ error: 'Invalid AI prediction response shape' });
    }
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prediction', details: error.message });
  }
};

exports.createPrediction = async (req, res) => {
  try {
    const normalizedInput = normalizePredictInput(req.body);
    console.log('INPUT:', normalizedInput);
    const prediction = await callAIPrediction(normalizedInput);
    if (!isValidPredictionShape(prediction)) {
      return res.status(502).json({ error: 'Invalid AI prediction response shape' });
    }
    console.log('PSI:', prediction.pressure_index);
    console.log('ML:', prediction.risk_level);

    const corridorId = String(req.body.corridor_id || req.body.corridorId || 'prediction');

    if (process.env.STORE_PREDICTIONS === 'true' && isDbConnected()) {
      await SensorData.create({
        corridorId,
        entryRate: normalizedInput.entryRate,
        exitRate: normalizedInput.exitRate,
        density: normalizedInput.density,
        width: normalizedInput.width,
        vehicleCount: normalizedInput.vehicleCount,
        transportBurst: normalizedInput.transportArrivalBurst,
        transportArrivalBurst: normalizedInput.transportArrivalBurst,
        weather: normalizedInput.weather,
        festival: normalizedInput.festivalPeak,
        festivalPeak: normalizedInput.festivalPeak,
        cpi: prediction.pressure_index,
        pressureIndex: prediction.pressure_index,
        riskLevel: prediction.risk_level,
        timestamp: new Date(),
      });
    }

    const alertPayload = buildPredictionAlert(corridorId, prediction);
    if (alertPayload) {
      if (isDbConnected()) {
        await Alert.create(alertPayload);
      } else {
        saveAlert(alertPayload);
      }
    }

    res.json(prediction);
  } catch (error) {
    console.error('Prediction error:', error.message);
    res.status(500).json({
      error: 'Prediction failed',
      details: error.message,
    });
  }
};
