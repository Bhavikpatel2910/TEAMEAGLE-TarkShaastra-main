const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['police', 'transport', 'admin'].includes(normalized) ? normalized : 'admin';
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return secret || 'stampede-window-predictor-dev-secret';
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function buildDemoUser(email, role = 'admin') {
  const safeEmail = normalizeEmail(email) || 'demo@local';
  const safeRole = normalizeRole(role);

  return {
    id: 'demo-user',
    name: safeEmail.split('@')[0] || 'demo',
    email: safeEmail,
    role: safeRole,
  };
}

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = normalizeRole(role);
    const safeName = String(name || normalizedEmail.split('@')[0] || 'user').trim();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters long' });
    }

    if (!isDbConnected()) {
      return res.status(201).json({
        msg: 'User registered successfully',
        user: buildDemoUser(normalizedEmail, normalizedRole),
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: safeName,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
    });

    res.status(201).json({
      msg: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    if (!isDbConnected()) {
      const user = buildDemoUser(normalizedEmail, 'admin');
      const token = jwt.sign(user, getJwtSecret(), { expiresIn: '1d' });
      return res.json({
        msg: 'Login successful',
        token,
        user,
      });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: String(user._id), name: user.name, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    res.json({
      msg: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
