const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  corridorId: { type: String, required: true, index: true, trim: true },
  level: { type: String, required: true, enum: ['INFO', 'WARNING', 'CRITICAL'], trim: true },
  message: { type: String, required: true, trim: true },
  acknowledged: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Composite index for common queries
alertSchema.index({ corridorId: 1, acknowledged: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
