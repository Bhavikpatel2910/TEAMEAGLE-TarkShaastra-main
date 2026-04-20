const express = require('express');
const router = express.Router();
const {
  getAlerts,
  createAlert,
  acknowledgeAlert
} = require('../controllers/alertController');

router.get('/', getAlerts);
router.post('/', createAlert);
router.patch('/:id', acknowledgeAlert);

module.exports = router;