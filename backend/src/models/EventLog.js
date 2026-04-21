const mongoose = require('mongoose');

const eventLogSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  entityType: { type: String, required: true, trim: true },
  entityId: { type: String, required: true, trim: true, index: true },
  actorId: { type: String, default: null, index: true },
  actorRole: { type: String, default: null },
  severity: { type: String, enum: ['INFO', 'WARNING', 'ERROR'], default: 'INFO', index: true },
  message: { type: String, required: true, trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

eventLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('EventLog', eventLogSchema);
