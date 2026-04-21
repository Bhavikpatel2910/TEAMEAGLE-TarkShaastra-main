const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Corridor = require('../models/Corridor');
const SensorData = require('../models/SensorData');
const { callAIPrediction } = require('../services/aiService');
const logger = require('../utils/logger');
const {
  getCorridor: getMemoryCorridor,
  listHistory: listMemoryHistory,
  saveAlert,
} = require('../utils/runtimeStore');

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function normalizeHistoryInput(corridor, sensor) {
  const weatherPenalty = Number(sensor?.weatherPenalty);
  const weatherFromPenalty = weatherPenalty === 6 ? 'Rain' : weatherPenalty === 4 ? 'Heat' : 'Clear';
  return {
    entryRate: sensor?.entryRate ?? 0,
    exitRate: sensor?.exitRate ?? 0,
    density: sensor?.density ?? 0,
    width: corridor?.width ?? sensor?.width ?? 0.5,
    vehicleCount: sensor?.vehicleCount ?? 0,
    transportArrivalBurst: sensor?.transportArrivalBurst ?? sensor?.transportBurst ?? 0,
    weather: sensor?.weather || weatherFromPenalty,
    festivalPeak: sensor?.festivalPeak ?? sensor?.festival ?? 0,
  };
}

function isValidPredictionShape(payload) {
  return payload &&
    typeof payload.pressure_index === 'number' &&
    typeof payload.predicted_crush_window_min === 'number' &&
    typeof payload.risk_level === 'string' &&
    typeof payload.reason === 'string';
}

const ALLOWED_WEATHER = new Set(['clear', 'heat', 'rain']);

function normalizeWeather(value) {
  const raw = String(value || 'Clear').trim();
  if (!raw) return 'Clear';
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (!ALLOWED_WEATHER.has(normalized.toLowerCase())) {
    throw new Error('weather must be one of: Clear, Heat, Rain');
  }
  return normalized;
}

function requireNonNegativeNumber(value, fieldName, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (parsed < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }

  return parsed;
}

function normalizePredictInput(body = {}, widthFallback = 0.5) {
  return {
    entryRate: requireNonNegativeNumber(body.entryRate ?? body.entry_flow_rate_pax_per_min, 'entryRate', 0),
    exitRate: requireNonNegativeNumber(body.exitRate ?? body.exit_flow_rate_pax_per_min, 'exitRate', 0),
    density: requireNonNegativeNumber(body.density ?? body.queue_density_pax_per_m2, 'density', 0),
    width: Math.max(0.5, requireNonNegativeNumber(body.width ?? body.corridor_width_m, 'width', widthFallback)),
    vehicleCount: requireNonNegativeNumber(body.vehicleCount ?? body.vehicle_count, 'vehicleCount', 0),
    transportArrivalBurst: requireNonNegativeNumber(body.transportArrivalBurst ?? body.transport_arrival_burst, 'transportArrivalBurst', 0),
    weather: normalizeWeather(body.weather),
    festivalPeak: requireNonNegativeNumber(body.festivalPeak ?? body.festival_peak, 'festivalPeak', 0),
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
    logger.debug('Prediction request received', normalizedInput);
    const prediction = await callAIPrediction(normalizedInput);
    if (!isValidPredictionShape(prediction)) {
      return res.status(502).json({ error: 'Invalid AI prediction response shape' });
    }
    logger.debug('Prediction response ready', {
      pressure_index: prediction.pressure_index,
      risk_level: prediction.risk_level,
    });

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
    logger.error('Prediction request failed', error);
    res.status(500).json({
      error: 'Prediction failed',
      details: error.message,
    });
  }
};
