// Import the Express web framework for server creation
const express = require('express');
// Import the built-in path module for directory and file path management
const path = require('path');
// Import CORS to allow the admin panel to communicate with the main API
const cors = require('cors');
// Initialize environment variables from a .env file into the system process
require('dotenv').config();

// Create a new instance of an Express application
const app = express();
// Define the dedicated port specifically for the Admin Interface
const ADMIN_PORT = 3001;
// Construct the base URL for the backend API by reading from environment variables
const API_URL = `http://localhost:${process.env.PORT || 3000}/api`;

// Enable Cross-Origin Resource Sharing for the admin application
app.use(cors());
// Serve all static files (HTML, CSS, JS) from the current root directory
app.use(express.static(path.join(__dirname, '/')));

/**
 * Define the primary route for the Admin Panel.
 * This serves the 'admin-panel.html' file when the root URL is accessed.
 */
app.get('/', (req, res) => {
    // Send the specific admin panel HTML file to the client
    res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

/**
 * Start the HTTP listener on the designated ADMIN_PORT.
 */
app.listen(ADMIN_PORT, () => {
    // Log a success message indicating the admin panel is live
    console.log(`\n🚀 UNIO Admin Panel is running on http://localhost:${ADMIN_PORT}`);
    // Log the connection status to the main backend API for debugging
    console.log(`🔗 Connected to Main API at http://localhost:${process.env.PORT || 3000}\n`);
});

