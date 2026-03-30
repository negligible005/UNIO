/* ==========================================================
   SERVER.JS - MAIN APPLICATION ENTRY POINT
   This section handles the core server setup, including 
   dependencies, middleware, Socket.io, and API routing.
   ========================================================== */

// Import the Express framework
const express = require('express');
// Import CORS to allow cross-origin requests
const cors = require('cors');
// Import the database initialization function from the db module
const { initDb } = require('./db');
// Import the built-in Node.js HTTP module
const http = require('http');
// Import Socket.io for real-time bi-directional communication
const socketIo = require('socket.io');

// Import the path module for handling file and directory paths
const path = require('path');
// Import Multer for handling multipart/form-data (file uploads)
const multer = require('multer');
// Import the file system module for interaction with the disk
const fs = require('fs');
// Load environment variables from a .env file into process.env
require('dotenv').config();

// Create an instance of an Express application
const app = express();
// Create an HTTP server using the Express app instance
const server = http.createServer(app);
// Initialize Socket.io and attach it to the HTTP server for real-time capabilities
const io = socketIo(server, {
    // Configure Cross-Origin Resource Sharing (CORS) settings for Socket.io connections
    cors: {
        // Allow connections from any origin (flexible for development/production)
        origin: "*",
        // Permit specified HTTP methods for the WebSocket handshake
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});
// Define the primary server port using environment variables or defaulting to 3000
const PORT = process.env.PORT || 3000;

/* --- GLOBAL SETTINGS & UTILITIES ---
   Configures shared instances and global error handling. */

// Make the Socket.io instance accessible in other route files
app.set('io', io);

// Generate a unique ID based on timestamp to identify the current server session
const SERVER_START_ID = Date.now().toString();

// Set up a listener for uncaught JavaScript exceptions
process.on('uncaughtException', (err) => {
    // Log the error details to the console without crashing the server
    console.error('Uncaught Exception:', err);
});
// Set up a listener for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    // Log the rejected promise and the reason to the console
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/* --- CORE MIDDLEWARE ---
   Pre-processes incoming requests before they reach route handlers. */

// Enable Cross-Origin Resource Sharing for all routes
app.use(cors());
// Parse incoming JSON payloads and populate req.body
app.use(express.json());

/* --- API ROUTES ---
   Defines the endpoints for front-end interaction. 
   These must be defined before static file serving. */

// Route to check the current server session ID
app.get('/api/sys/session', (req, res) => {
    // Return the session start ID as a JSON response
    res.json({ sessionId: SERVER_START_ID });
});

// Simple test endpoint to verify server responsiveness
app.get('/api/test-ping', (req, res) => {
    // Return a 'pong' message with the current server timestamp
    res.json({ message: 'pong', timestamp: Date.now() });
});

/* --- SOCKET.IO CONNECTION HANDLING ---
   Manages real-time events when clients connect via WebSockets. */

// Listen for new WebSocket connections
io.on('connection', (socket) => {
    // Log the ID of the newly connected client
    console.log('New client connected:', socket.id);

    // Listen for a 'join' event from the client with a userId
    socket.on('join', (userId) => {
        // Add the socket to a private room named 'user_<userId>'
        socket.join(`user_${userId}`);
        // Log that the user has joined their specific room
        console.log(`User ${userId} joined their private room.`);
    });

    // Listen for the client disconnecting from the server
    socket.on('disconnect', () => {
        // Log that the client has disconnected
        console.log('Client disconnected:', socket.id);
    });
});

/* --- ROUTE MODULE REGISTRATION ---
   Mounts specific feature routes to their respective base paths. */

// Register authentication-related routes
app.use('/api/auth', require('./routes/auth'));
// Register booking-related routes
app.use('/api/bookings', require('./routes/bookings'));
// Register service/product listing routes
app.use('/api/listings', require('./routes/listings'));
// Register user feedback and review routes
app.use('/api/feedback', require('./routes/feedback'));
// Register administrative restricted routes
app.use('/api/admin', require('./routes/admin'));
// Register shipment or activity tracking routes
app.use('/api/tracking', require('./routes/tracking'));
// Register platform statistics routes
app.use('/api/stats', require('./routes/stats'));
// Register social/friendship management routes
app.use('/api/friends', require('./routes/friends'));
// Register user notification and alert management routes
app.use('/api/notifications', require('./routes/notifications'));
// Register cost-split management and group coordination routes
app.use('/api/splits', require('./routes/splits'));
// Register peer-to-peer user trust and reputation system routes
app.use('/api/trust', require('./routes/trust'));
// Register legacy AI routes (retained for backward system compatibility)
app.use('/api/ai', require('./routes/ai')); 
// Register the new guided chatbot assistant logical flow routes
app.use('/api/chatbot', require('./routes/chatbot')); 
// Register the community-driven marketplace and item listing routes
app.use('/api/marketplace', require('./routes/marketplace'));
// Register financial transaction, checkout, and payment processing routes
app.use('/api/payments', require('./routes/payments'));

/* --- FILE UPLOAD CONFIGURATION ---
   Sets up disk storage and validation for image uploads. */

// Define the absolute path for the uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
// Synchronously create the uploads folder if it doesn't already exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure Multer storage engine properties
const storage = multer.diskStorage({
    // Specify the destination directory for uploaded files
    destination: (req, file, cb) => cb(null, uploadsDir),
    // Define how the uploaded file should be named
    filename: (req, file, cb) => {
        // Extract the file extension from the original filename
        const ext = path.extname(file.originalname);
        // Create a unique filename using timestamp, random string, and extension
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
// Initialize Multer with the storage and limit configurations
const upload = multer({
    // Use the custom disk storage engine
    storage,
    // Set the maximum allowed file size to 10MB
    limits: { fileSize: 10 * 1024 * 1024 },
    // Filter uploaded files to ensure they are images
    fileFilter: (req, file, cb) => {
        // Check if the mime type starts with 'image/'
        if (file.mimetype.startsWith('image/')) cb(null, true);
        // Reject the file if it's not an image
        else cb(new Error('Only images are allowed'));
    }
});

/* --- UPLOAD ENDPOINT & STATIC SERVING ---
   Handles file saving and public access to uploaded assets. */

// Define the POST endpoint for uploading a single 'image' file
app.post('/api/upload', upload.single('image'), (req, res) => {
    // Return an error if no file was received by the server
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // Return the relative URL of the newly uploaded file to the client
    res.json({ url: `/uploads/${req.file.filename}` });
});

// Serve files from the 'uploads' directory as static assets at /uploads
app.use('/uploads', express.static(uploadsDir));

/* --- FRONT-END STATIC SERVING ---
   Serves the client-side application files. */

// Serve all static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

/* --- SERVER INITIALIZATION ---
   Initializes the database and starts the HTTP listener. */

// Check if the script is being run directly as the main module
if (require.main === module) {
    // Initialize database tables before starting the server
    initDb().then(() => {
        // Start listening for incoming HTTP requests on the defined PORT
        server.listen(PORT, () => {
            // Log a confirmation message with the server address
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    });
}

// Export the app and server instances for testing or external use
module.exports = { app, server };
