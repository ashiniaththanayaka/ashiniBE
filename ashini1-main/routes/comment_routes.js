const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment_controller');
const { protect } = require('../middlewares/user_middleware'); // Your auth middleware

// All routes require authentication
router.post('/comments', protect, commentController.addComment);
router.get('/comments/:itemId', protect, commentController.getComments);
router.delete('/comments/:id', protect, commentController.deleteComment);

module.exports = router;