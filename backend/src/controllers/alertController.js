const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const {
  listAlerts: listMemoryAlerts,
  saveAlert,
  acknowledgeAlert: acknowledgeMemoryAlert,
} = require('../utils/runtimeStore');

exports.getAlerts = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json(listMemoryAlerts());
    }
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(alerts || []);
  } catch (error) {
    console.error('Error fetching alerts:', error.message);
    res.status(500).json({ error: 'Failed to fetch alerts', details: error.message });
  }
};

exports.createAlert = async (req, res) => {
  try {
    if (!req.body.corridorId) {
      return res.status(400).json({ error: 'corridorId is required' });
    }
    if (!req.body.level) {
      return res.status(400).json({ error: 'level is required' });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(201).json(saveAlert(req.body));
    }

    const alert = await Alert.create(req.body);
    res.status(201).json({
      id: String(alert._id),
      ...alert.toObject()
    });
  } catch (error) {
    console.error('Error creating alert:', error.message);
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
    console.error('Error acknowledging alert:', error.message);
    res.status(500).json({ error: 'Failed to acknowledge alert', details: error.message });
  }
};
