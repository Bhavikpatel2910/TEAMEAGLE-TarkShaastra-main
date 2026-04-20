const express = require('express');
const router = express.Router();
const corridorController = require('../controllers/corridorController');

router.get('/', corridorController.getCorridors);
router.post('/', corridorController.createCorridor);
router.post('/sensor', corridorController.ingestSensorData);
router.get('/:id/history', corridorController.getCorridorHistory);
router.get('/:id', corridorController.getCorridorById);

module.exports = router;
