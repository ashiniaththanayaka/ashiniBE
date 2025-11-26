const Item = require('../models/item_model');
const Comment = require('../models/comment_model');
const Notification = require('../models/notification_model');
const User = require('../models/user_model');
const { uploadImageToCloudflare, deleteImageFromCloudflare } = require('../config/cloudflare');

// Enhanced text processing utilities
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  return normalized.split(' ').filter(word => word.length > 0);
}

// Remove common stop words for better matching
function removeStopWords(words) {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'i', 'me', 'you', 'he',
    'she', 'it', 'we', 'they', 'them', 'this', 'that', 'these', 'those'
  ]);
  
  return words.filter(word => !stopWords.has(word) && word.length > 2);
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// Check if two words are similar (fuzzy match)
function areSimilarWords(word1, word2, threshold = 0.75) {
  if (word1 === word2) return true;
  if (word1.includes(word2) || word2.includes(word1)) return true;
  
  const maxLen = Math.max(word1.length, word2.length);
  const distance = levenshteinDistance(word1, word2);
  const similarity = 1 - (distance / maxLen);
  
  return similarity >= threshold;
}

// Calculate word overlap score
function calculateWordOverlap(words1, words2) {
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchCount = 0;
  const used = new Set();
  
  for (const word1 of words1) {
    for (let i = 0; i < words2.length; i++) {
      if (!used.has(i) && areSimilarWords(word1, words2[i])) {
        matchCount++;
        used.add(i);
        break;
      }
    }
  }
  
  // Calculate percentage based on the shorter list
  const minLength = Math.min(words1.length, words2.length);
  return (matchCount / minLength) * 100;
}

// Enhanced match score calculation
function calculateMatchScore(item1, item2) {
  let score = 0;
  const breakdown = {
    location: 0,
    name: 0,
    description: 0,
    category: 0,
    time: 0
  };
  
  // 1. LOCATION MATCHING (0-35 points)
  const loc1Tokens = removeStopWords(tokenize(item1.location));
  const loc2Tokens = removeStopWords(tokenize(item2.location));
  const locationOverlap = calculateWordOverlap(loc1Tokens, loc2Tokens);
  
  if (locationOverlap >= 80) {
    breakdown.location = 35; // Very strong location match
  } else if (locationOverlap >= 60) {
    breakdown.location = 28; // Good location match
  } else if (locationOverlap >= 40) {
    breakdown.location = 20; // Moderate location match
  } else if (locationOverlap >= 20) {
    breakdown.location = 10; // Weak location match
  }
  
  // 2. NAME MATCHING (0-40 points) - Most important
  const name1Tokens = removeStopWords(tokenize(item1.name));
  const name2Tokens = removeStopWords(tokenize(item2.name));
  const nameOverlap = calculateWordOverlap(name1Tokens, name2Tokens);
  
  if (nameOverlap >= 80) {
    breakdown.name = 40; // Very strong name match
  } else if (nameOverlap >= 60) {
    breakdown.name = 32; // Good name match
  } else if (nameOverlap >= 40) {
    breakdown.name = 24; // Moderate name match
  } else if (nameOverlap >= 25) {
    breakdown.name = 15; // Weak name match
  }
  
  // 3. DESCRIPTION MATCHING (0-15 points)
  if (item1.description && item2.description && 
      item1.description.trim() && item2.description.trim()) {
    const desc1Tokens = removeStopWords(tokenize(item1.description));
    const desc2Tokens = removeStopWords(tokenize(item2.description));
    
    if (desc1Tokens.length > 0 && desc2Tokens.length > 0) {
      const descOverlap = calculateWordOverlap(desc1Tokens, desc2Tokens);
      
      if (descOverlap >= 50) {
        breakdown.description = 15; // Strong description match
      } else if (descOverlap >= 30) {
        breakdown.description = 10; // Moderate description match
      } else if (descOverlap >= 15) {
        breakdown.description = 5; // Weak description match
      }
    }
  }
  
  // 4. CATEGORY MATCH (0-5 points)
  if (item1.category === item2.category) {
    breakdown.category = 5;
  }
  
  // 5. TIME PROXIMITY (0-5 points)
  const item1TimePriority = getTimePriority(item1.timeSince);
  const item2TimePriority = getTimePriority(item2.timeSince);
  const timeDiff = Math.abs(item1TimePriority - item2TimePriority);
  
  if (timeDiff <= 1) {
    breakdown.time = 5; // Very close in time
  } else if (timeDiff <= 3) {
    breakdown.time = 3; // Reasonably close in time
  } else if (timeDiff <= 5) {
    breakdown.time = 1; // Somewhat close in time
  }
  
  // Calculate total score
  score = breakdown.location + breakdown.name + breakdown.description + 
          breakdown.category + breakdown.time;
  
  // Bonus: If name overlap is very high AND location overlap is good
  if (nameOverlap >= 60 && locationOverlap >= 40) {
    score += 5; // Bonus for strong combined match
  }
  
  console.log(`Match score breakdown for "${item1.name}" vs "${item2.name}":`, {
    total: score,
    breakdown,
    overlaps: {
      name: `${nameOverlap.toFixed(1)}%`,
      location: `${locationOverlap.toFixed(1)}%`,
      description: item1.description && item2.description ? 
        `${calculateWordOverlap(
          removeStopWords(tokenize(item1.description)), 
          removeStopWords(tokenize(item2.description))
        ).toFixed(1)}%` : 'N/A'
    }
  });
  
  return score;
}

function getTimePriority(timeSince) {
  const timePriority = {
    '1-hour-ago': 1, '2-hours-ago': 2, '3-hours-ago': 3, '4-hours-ago': 4,
    '5-hours-ago': 5, '6-hours-ago': 6, '12-hours-ago': 7, '1-day-ago': 8,
    '2-days-ago': 9, '3-days-ago': 10, '4-days-ago': 11, '5-days-ago': 12,
    '6-days-ago': 13, '1-week-ago': 14, '2-weeks-ago': 15, '3-weeks-ago': 16,
    '1-month-ago': 17, 'more-than-month': 18
  };
  return timePriority[timeSince] || 18;
}

// Enhanced function to find and create notifications for matches
async function findAndNotifyMatches(newItem) {
  try {
    console.log('Finding matches for new item:', newItem.name);
    
    // Find items with opposite status and same category
    const oppositeStatus = newItem.status === 'lost' ? 'found' : 'lost';
    
    // Get all tokens from the new item for better filtering
    const nameTokens = removeStopWords(tokenize(newItem.name));
    const locationTokens = removeStopWords(tokenize(newItem.location));
    
    // Build a more comprehensive query
    const searchTerms = [...new Set([...nameTokens, ...locationTokens])];
    
    const potentialMatches = await Item.find({
      userId: { $ne: newItem.userId },
      status: oppositeStatus,
      category: newItem.category,
      isResolved: { $ne: true }
    }).populate('userId', 'username email type registrationId');

    console.log(`Found ${potentialMatches.length} potential candidates for matching`);

    const notifications = [];
    const scoredMatches = [];

    // Score all potential matches
    for (const match of potentialMatches) {
      const matchScore = calculateMatchScore(newItem, match);
      
      if (matchScore > 0) {
        scoredMatches.push({ match, score: matchScore });
      }
    }
    
    // Sort by score (highest first)
    scoredMatches.sort((a, b) => b.score - a.score);
    
    // Only notify for high-quality matches (score >= 40)
    // This ensures we only notify when there's a strong match
    const highQualityMatches = scoredMatches.filter(sm => sm.score >= 40);
    
    console.log(`Found ${highQualityMatches.length} high-quality matches (score >= 40)`);
    
    for (const { match, score } of highQualityMatches) {
      console.log(`Creating notification for match with score: ${score}`);
      
      // Create notification for the matched item owner
      const notification = new Notification({
        userId: match.userId._id,
        type: 'match_found',
        title: 'Potential Match Found!',
        message: `We found a ${score >= 70 ? 'strong' : 'potential'} match for your ${match.status} item "${match.name}"`,
        data: {
          userItemId: match._id,
          userItemName: match.name,
          userItemStatus: match.status,
          matchedItem: {
            _id: newItem._id,
            name: newItem.name,
            category: newItem.category,
            location: newItem.location,
            status: newItem.status,
            description: newItem.description,
            photos: newItem.photos,
            contactInfo: newItem.contactInfo,
            createdAt: newItem.createdAt,
            timeSince: newItem.timeSince,
            userId: {
              _id: newItem.userId,
              username: newItem.userId.username || 'Unknown',
              email: newItem.userId.email || 'Unknown',
              type: newItem.userId.type || 'user',
              registrationId: newItem.userId.registrationId || 'Unknown'
            }
          },
          matchScore: score,
          matchType: match.status === 'lost' ? 'found_match' : 'lost_match'
        },
        isRead: false
      });

      notifications.push(notification);
    }

    // Bulk insert notifications
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
      console.log(`Created ${notifications.length} match notifications`);
    }

    return notifications.length;
  } catch (error) {
    console.error('Error in findAndNotifyMatches:', error);
    return 0;
  }
}

// Enhanced addItem function with auto-matching
exports.addItem = async (req, res) => {
  try {
    const { name, category, location, date, status, description, contactInfo, timeSince } = req.body;
    const userId = req.user.id;

    if (!name || !category || !location || !date || !status || !timeSince) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, category, location, date, status, timeSince'
      });
    }

    // Validate timeSince
    const validTimeSince = [
      '1-hour-ago', '2-hours-ago', '3-hours-ago', '4-hours-ago', '5-hours-ago', '6-hours-ago',
      '12-hours-ago', '1-day-ago', '2-days-ago', '3-days-ago', '4-days-ago', '5-days-ago',
      '6-days-ago', '1-week-ago', '2-weeks-ago', '3-weeks-ago', '1-month-ago', 'more-than-month'
    ];

    if (!validTimeSince.includes(timeSince)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time since value'
      });
    }

    // Validate category and status
    const validCategories = ['electronics', 'documents', 'ids', 'cash', 'other'];
    const validStatuses = ['lost', 'found'];

    if (!validCategories.includes(category.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: electronics, documents, ids, cash, or other'
      });
    }

    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: lost or found'
      });
    }

    // Upload photos to Cloudflare R2 if provided
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      if (req.files.length > 4) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 4 photos allowed'
        });
      }

      try {
        const uploadPromises = req.files.map(file => uploadImageToCloudflare(file, 'items'));
        photoUrls = await Promise.all(uploadPromises);
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload images',
          error: error.message
        });
      }
    }

    // Create new item
    const newItem = new Item({
      userId,
      name: name.trim(),
      category: category.toLowerCase(),
      location: location.trim(),
      date: new Date(date),
      photos: photoUrls,
      status: status.toLowerCase(),
      description: description?.trim() || '',
      contactInfo: contactInfo?.trim() || '',
      timeSince: timeSince
    });

    const savedItem = await newItem.save();
    await savedItem.populate('userId', 'username email type registrationId');

    // **AUTO-MATCHING: Find and notify potential matches**
    try {
      const matchCount = await findAndNotifyMatches(savedItem);
      console.log(`Auto-matching completed: ${matchCount} notifications created`);
    } catch (matchError) {
      console.error('Auto-matching failed:', matchError);
      // Don't fail the item creation if matching fails
    }

    res.status(201).json({
      success: true,
      message: 'Item added successfully',
      item: savedItem
    });

  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// All other exports remain the same...
exports.getDashboardData = async (req, res) => {
  try {
    const latestItems = await Item.find()
      .populate('userId', 'username email type registrationId')
      .sort({ createdAt: -1 })
      .limit(3);

    const lostItemsCount = await Item.countDocuments({ status: 'lost' });
    const foundItemsCount = await Item.countDocuments({ status: 'found' });
    const usersCount = await User.countDocuments();
    const resolvedItemsCount = await Item.countDocuments({ isResolved: true });

    const totalItems = lostItemsCount + foundItemsCount;
    const successRate = totalItems > 0 ? Math.round((resolvedItemsCount / totalItems) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        latestItems,
        stats: {
          lostItems: lostItemsCount,
          foundItems: foundItemsCount,
          totalUsers: usersCount,
          resolvedItems: resolvedItemsCount,
          totalItems,
          successRate
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const matchNotifications = await Notification.find({
      userId: userId,
      type: 'match_found'
    }).sort({ 'data.matchScore': -1, createdAt: -1 }).limit(20);

    const matches = matchNotifications.map(notification => {
      return {
        notificationId: notification._id,
        userItemId: notification.data.userItemId,
        userItemName: notification.data.userItemName,
        userItemStatus: notification.data.userItemStatus,
        matchedItem: notification.data.matchedItem,
        matchScore: notification.data.matchScore,
        matchType: notification.data.matchType,
        createdAt: notification.createdAt,
        isRead: notification.isRead
      };
    });

    await Notification.updateMany(
      { userId: userId, type: 'match_found', isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      matches: matches,
      count: matches.length
    });

  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getNotificationCount = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const unreadCount = await Notification.countDocuments({
      userId: userId,
      type: 'match_found',
      isRead: false
    });
    
    console.log(`User ${userId} has ${unreadCount} unread match notifications`);

    res.status(200).json({
      success: true,
      unreadCount: unreadCount
    });

  } catch (error) {
    console.error('Get notification count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getItems = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const { category, status, location, userId, search } = req.query;

    let query = {};

    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }

    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    if (userId) {
      query.userId = userId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    const items = await Item.find(query)
      .populate('userId', 'username email type registrationId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalItems = await Item.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    const hasMore = page < totalPages;

    res.status(200).json({
      success: true,
      items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasMore,
        itemsPerPage: limit
      }
    });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findById(id).populate('userId', 'username email type registrationId');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.status(200).json({
      success: true,
      item
    });

  } catch (error) {
    console.error('Get item by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, category, location, date, status, description, contactInfo, isResolved } = req.body;

    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    if (item.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this item'
      });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (category) updateData.category = category.toLowerCase();
    if (location) updateData.location = location.trim();
    if (date) updateData.date = new Date(date);
    if (status) updateData.status = status.toLowerCase();
    if (description !== undefined) updateData.description = description.trim();
    if (contactInfo !== undefined) updateData.contactInfo = contactInfo.trim();
    if (isResolved !== undefined) updateData.isResolved = isResolved;

    if (req.files && req.files.length > 0) {
      if (req.files.length > 4) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 4 photos allowed'
        });
      }

      try {
        if (item.photos && item.photos.length > 0) {
          const deletePromises = item.photos.map(photoUrl => deleteImageFromCloudflare(photoUrl));
          await Promise.all(deletePromises);
        }

        const uploadPromises = req.files.map(file => uploadImageToCloudflare(file, 'items'));
        updateData.photos = await Promise.all(uploadPromises);
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update images',
          error: error.message
        });
      }
    }

    const updatedItem = await Item.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('userId', 'username email type registrationId');

    res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      item: updatedItem
    });

  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    if (item.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this item'
      });
    }

    if (item.photos && item.photos.length > 0) {
      const deletePromises = item.photos.map(photoUrl => deleteImageFromCloudflare(photoUrl));
      await Promise.all(deletePromises);
    }

    await Comment.deleteMany({ itemId: id });
    await Item.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getUserItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const { status, category } = req.query;

    let query = { userId };

    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }

    const items = await Item.find(query)
      .populate('userId', 'username email type registrationId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalItems = await Item.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    const hasMore = page < totalPages;

    res.status(200).json({
      success: true,
      items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasMore,
        itemsPerPage: limit
      }
    });

  } catch (error) {
    console.error('Get user items error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};