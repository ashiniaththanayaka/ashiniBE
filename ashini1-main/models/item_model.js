const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  category: {
    type: String,
    required: true,
    enum: ['electronics', 'documents', 'ids', 'cash', 'other'],
    lowercase: true
  },
  location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  date: {
    type: Date,
    required: true
  },
  // FIXED: Changed maxlength from 4 to 500 to accommodate full URLs
  photos: [{
    type: String, 
    maxlength: 500, // Increased to store full Cloudflare R2 URLs
    validate: {
      validator: function(v) {
        // Validate that it's a valid image URL
        return /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(v);
      },
      message: 'Photo must be a valid image URL'
    }
  }],
  status: {
    type: String,
    required: true,
    enum: ['lost', 'found'],
    lowercase: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  contactInfo: {
    type: String,
    trim: true,
    maxlength: 100
  },
  timeSince: {
    type: String,
    required: true,
    enum: [
      '1-hour-ago',
      '2-hours-ago', 
      '3-hours-ago',
      '4-hours-ago',
      '5-hours-ago',
      '6-hours-ago',
      '12-hours-ago',
      '1-day-ago',
      '2-days-ago',
      '3-days-ago',
      '4-days-ago',
      '5-days-ago',
      '6-days-ago',
      '1-week-ago',
      '2-weeks-ago',
      '3-weeks-ago',
      '1-month-ago',
      'more-than-month'
    ]
  }
}, {
  timestamps: true
});

// Validation for photos array length (maximum 4 photos)
itemSchema.pre('save', function(next) {
  if (this.photos && this.photos.length > 4) {
    const err = new Error('Maximum 4 photos allowed');
    return next(err);
  }
  next();
});

// Additional validation to ensure photos array doesn't contain empty strings
itemSchema.pre('save', function(next) {
  if (this.photos) {
    // Remove empty strings and null values
    this.photos = this.photos.filter(photo => photo && photo.trim() !== '');
  }
  next();
});

// Index for better query performance
itemSchema.index({ userId: 1, createdAt: -1 });
itemSchema.index({ category: 1, status: 1 });
itemSchema.index({ location: 1 });
itemSchema.index({ isResolved: 1, createdAt: -1 });

// Virtual for getting photo count
itemSchema.virtual('photoCount').get(function() {
  return this.photos ? this.photos.length : 0;
});

// Method to add photo (with validation)
itemSchema.methods.addPhoto = function(photoUrl) {
  if (!this.photos) {
    this.photos = [];
  }
  
  if (this.photos.length >= 4) {
    throw new Error('Cannot add more than 4 photos');
  }
  
  if (!photoUrl || typeof photoUrl !== 'string') {
    throw new Error('Invalid photo URL');
  }
  
  // Check for duplicate URLs
  if (this.photos.includes(photoUrl)) {
    throw new Error('Photo URL already exists');
  }
  
  this.photos.push(photoUrl);
  return this.photos.length;
};

// Method to remove photo
itemSchema.methods.removePhoto = function(photoUrl) {
  if (!this.photos || !photoUrl) {
    return false;
  }
  
  const index = this.photos.indexOf(photoUrl);
  if (index > -1) {
    this.photos.splice(index, 1);
    return true;
  }
  
  return false;
};

// Method to replace all photos
itemSchema.methods.setPhotos = function(photoUrls) {
  if (!Array.isArray(photoUrls)) {
    throw new Error('Photos must be an array');
  }
  
  if (photoUrls.length > 4) {
    throw new Error('Maximum 4 photos allowed');
  }
  
  // Validate each URL
  for (const url of photoUrls) {
    if (url && !/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url)) {
      throw new Error(`Invalid photo URL: ${url}`);
    }
  }
  
  // Filter out empty/null values
  this.photos = photoUrls.filter(url => url && url.trim() !== '');
  return this.photos.length;
};

// Static method to find items with photos
itemSchema.statics.findWithPhotos = function() {
  return this.find({
    photos: { $exists: true, $not: { $size: 0 } }
  });
};

// Static method to find items without photos
itemSchema.statics.findWithoutPhotos = function() {
  return this.find({
    $or: [
      { photos: { $exists: false } },
      { photos: { $size: 0 } }
    ]
  });
};

module.exports = mongoose.model('Item', itemSchema);