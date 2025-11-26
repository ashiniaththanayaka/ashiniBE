const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user_model');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

exports.signup = (req, res) => {
  const { email, username, password, type, registrationId } = req.body;

  if (!email || !username || !password || !type || !registrationId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required fields'
    });
  }

  const originalPassword = password;


  User.findOne({ $or: [{ email }, { username }, { registrationId }] })
    .then(existingUser => {
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email, username, or registration ID'
        });
      }

      const newUser = new User({
        email,
        username,
        password,
        type,
        registrationId
      });

      return newUser.save();
    })
    .then(user => {
      const token = generateToken(user._id);
      
      const userResponse = {
        _id: user._id,
        email: user.email,
        username: user.username,
        type: user.type,
        registrationId: user.registrationId,
        password: originalPassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        token,
        user: userResponse
      });
    })
    .catch(error => {
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });
};

// Login Controller
exports.login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  User.findOne({ email })
    .then(user => {
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      return user.comparePassword(password)
        .then(isMatch => {
          if (!isMatch) {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials'
            });
          }

          const token = generateToken(user._id);
          
          res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user
          });
        });
    })
    .catch(error => {
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });
};

// Get Profile Controller
exports.getProfile = (req, res) => {
  User.findById(req.user.id)
    .then(user => {
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const userWithPassword = {
        _id: user._id,
        email: user.email,
        username: user.username,
        type: user.type,
        registrationId: user.registrationId,
        password: 'password_hidden_for_security',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      res.status(200).json({
        success: true,
        user: userWithPassword
      });
    })
    .catch(error => {
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });
};

exports.updateProfile = (req, res) => {
  const { email, username, type, registrationId, password } = req.body;

  const originalPassword = password;
  
  const updateData = {};
  if (email) updateData.email = email;
  if (username) updateData.username = username;
  if (type) updateData.type = type;
  if (registrationId) updateData.registrationId = registrationId;
  if (password) updateData.password = password;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields to update'
    });
  }

  const checkQuery = [];
  if (email) checkQuery.push({ email });
  if (username) checkQuery.push({ username });
  if (registrationId) checkQuery.push({ registrationId });


  const checkPromise = checkQuery.length > 0 
    ? User.findOne({ 
        $and: [
          { _id: { $ne: req.user.id } },
          { $or: checkQuery }
        ]
      })
    : Promise.resolve(null);

  checkPromise
    .then(existingUser => {
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email, username, or registration ID already exists'
        });
      }

      return User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true, runValidators: true }
      );
    })
    .then(user => {
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const userWithPassword = {
        _id: user._id,
        email: user.email,
        username: user.username,
        type: user.type,
        registrationId: user.registrationId,
        password: originalPassword || 'password_hidden_for_security',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: userWithPassword
      });
    })
    .catch(error => {
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });
};