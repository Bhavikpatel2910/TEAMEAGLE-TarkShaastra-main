const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const {
  listAlerts: listMemoryAlerts,
  saveAlert,
  acknowledgeAlert: acknowledgeMemoryAlert,
} = require('../utils/runtimeStore');

const ALLOWED_LEVELS = new Set(['INFO', 'WARNING', 'CRITICAL']);

function normalizeAlertInput(body = {}) {
  const corridorId = String(body.corridorId || '').trim();
  const level = String(body.level || '').trim().toUpperCase();
  const message = String(body.message || 'Alert').trim() || 'Alert';

  if (!corridorId) {
    throw new Error('corridorId is required');
  }

  if (!ALLOWED_LEVELS.has(level)) {
    throw new Error('level must be one of: INFO, WARNING, CRITICAL');
  }

  return {
    corridorId,
    level,
    message,
    acknowledged: false,
  };
}

exports.getAlerts = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json(listMemoryAlerts());
    }
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(alerts || []);
  } catch (error) {
    logger.error('Error fetching alerts', error);
    res.status(500).json({ error: 'Failed to fetch alerts', details: error.message });
  }
};

exports.createAlert = async (req, res) => {
  try {
    const payload = normalizeAlertInput(req.body);

    if (mongoose.connection.readyState !== 1) {
      return res.status(201).json(saveAlert(payload));
    }

    const alert = await Alert.create(payload);
    res.status(201).json({
      id: String(alert._id),
      ...alert.toObject()
    });
  } catch (error) {
    logger.error('Error creating alert', error);
    res.status(500).json({ error: 'Failed to create alert', details: error.message });
  }
};

exports.acknowledgeAlert = async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: 'Alert ID is required' });
    }

    if (mongoose.connection.readyState !== 1) {
      const alert = acknowledgeMemoryAlert(req.params.id);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      return res.json(alert);
    }

    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { acknowledged: true },
      { new: true }
    ).lean();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      id: String(alert._id),
      ...alert
    });
  } catch (error) {
    logger.error('Error acknowledging alert', error);
    res.status(500).json({ error: 'Failed to acknowledge alert', details: error.message });
  }
};
