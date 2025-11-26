const Comment = require('../models/comment_model');
const Item = require('../models/item_model');

// Add a comment
exports.addComment = async (req, res) => {
  try {
    const { itemId, text } = req.body;
    const userId = req.user.id;

    if (!itemId || !text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Item ID and comment text are required'
      });
    }

    // Check if item exists
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    const newComment = new Comment({
      itemId,
      userId,
      text: text.trim()
    });

    const savedComment = await newComment.save();
    await savedComment.populate('userId', 'username email type registrationId');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: savedComment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all comments for an item
exports.getComments = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID is required'
      });
    }

    const comments = await Comment.find({ itemId })
      .populate('userId', 'username email type registrationId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      comments,
      count: comments.length
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete a comment (only by the user who created it)
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check if the user owns this comment
    if (comment.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }

    await Comment.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};