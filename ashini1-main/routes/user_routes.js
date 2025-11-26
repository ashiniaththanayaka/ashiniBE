const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/user_controller');
const { protect } = require('../middlewares/user_middleware');

// Public routes
router.post('/user/signup', AuthController.signup);
router.post('/user/login', AuthController.login);

// Protected routes
router.get('/user/profile', protect, AuthController.getProfile);
router.put('/user/profile', protect, AuthController.updateProfile);

module.exports = router;