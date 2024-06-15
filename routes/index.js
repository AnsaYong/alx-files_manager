const express = require('express');
const AppController = require('../controllers/AppController');
const UsersController = require('../controllers/UsersController');

const router = express.Router();

router.get('/satatus', AppController.getStatus);
router.get('/stats', AppController.getStats);
router.get('/users', UsersController.postNew);

module.exports = router;
