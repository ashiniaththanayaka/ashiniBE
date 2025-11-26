const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudflare_upload');
const { protect } = require('../middlewares/user_middleware'); 
const ItemController = require('../controllers/item_controller');

// Item routes - all using singular '/item'
router.post('/item', protect, upload.array('photos', 4), ItemController.addItem);
router.get('/item', ItemController.getItems);           // Changed from /items to /item
router.get('/item/user-items', protect, ItemController.getUserItems); 
router.get('/item/:id', ItemController.getItemById); 
router.put('/item/:id', protect, upload.array('photos', 4), ItemController.updateItem);
router.delete('/item/:id', protect, ItemController.deleteItem);
router.get('/latest', ItemController.getDashboardData); 
router.get('/matches', protect, ItemController.getMatches);
router.get('/notifications/count', protect, ItemController.getNotificationCount);

module.exports = router;