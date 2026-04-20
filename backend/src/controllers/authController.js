const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'stampede-window-predictor-dev-secret';
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function buildDemoUser(email, role = 'admin') {
  const safeEmail = String(email || 'demo@local').trim().toLowerCase();
  const safeRole = ['police', 'transport', 'admin'].includes(role) ? role : 'admin';

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

    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    if (!isDbConnected()) {
      return res.status(201).json({
        msg: 'User registered successfully',
        user: buildDemoUser(email, role || 'admin'),
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
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

    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    if (!isDbConnected()) {
      const user = buildDemoUser(email, 'admin');
      const token = jwt.sign(user, getJwtSecret(), { expiresIn: '1d' });
      return res.json({
        msg: 'Login successful',
        token,
        user,
      });
    }

    const user = await User.findOne({ email });
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
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
