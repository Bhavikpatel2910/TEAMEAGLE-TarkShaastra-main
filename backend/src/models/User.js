const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['police', 'transport', 'admin'], default: 'admin', required: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
