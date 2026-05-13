require('dotenv').config();

const express = require('express')
const app = express()
const http = require('http')
const mongoose = require('mongoose')
const cors = require('cors')
const morgan = require('morgan')
const multer = require('multer')

const server = http.createServer(app)

// Middleware setup
app.use(express.json({ limit: '10mb', extended: true }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))
app.use(morgan("common"))

const corsOptions = {
    // Adding 8081 for Expo and '*' for testing if needed
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://192.168.1.11:5000'], 
    credentials: true,
    optionSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}
app.use(cors(corsOptions));

// Additional CORS headers
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'FoundHere API is running!',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            items: '/api/items',
            comments: '/api/comments'
        }
    });
});

try {
    // Authentication routes
    const userRoutes = require('./routes/user_routes')
    app.use('/api/auth', userRoutes);
    console.log('✅ User/Auth routes loaded successfully');

    // Item management routes
    const itemRoutes = require('./routes/item_routes')
    app.use('/api', itemRoutes);
    console.log('✅ Item routes loaded successfully');

    const commentRoutes = require('./routes/comment_routes')
    app.use('/api', commentRoutes);
    console.log('✅ comment routes loaded successfully');


} catch (error) {
    console.error('❌ Error loading routes:', error.message);
    console.error('Stack:', error.stack);
}

// Global error handling middleware for multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB per file.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 4 files allowed.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected file field. Use "photos" field for images.'
            });
        }
    }

    // Firebase or other errors
    if (error.message && error.message.includes('Firebase')) {
        return res.status(500).json({
            success: false,
            message: 'Image upload failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // General error handler
    console.error('Global Error Handler:', error);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});


// MongoDB connection with better error handling
const PORT = process.env.PORT || 5000

console.log('🔄 Connecting to MongoDB...');
mongoose.set('strictQuery', true);

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ MongoDB Connected:', conn.connection.host);

        // Start server only after successful DB connection
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 FoundHere Mobile Application server running on port ${PORT}`);
            console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
            console.log(`📱 Health Check: http://localhost:${PORT}/`);
            console.log('\n📋 Available Endpoints:');
            console.log('   Auth: http://localhost:' + PORT + '/api/auth');
            console.log('   Items: http://localhost:' + PORT + '/api/items');
            console.log('   Comments: http://localhost:' + PORT + '/api/comments');
        });

    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);

        // Retry connection after 5 seconds
        console.log('🔄 Retrying MongoDB connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down gracefully...');
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// Initialize database connection
connectDB();

module.exports = app;