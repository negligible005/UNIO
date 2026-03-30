/* ==========================================================
   AUTH.JS - USER AUTHENTICATION ROUTES
   This module handles user registration and login, including
   password hashing, database storage, and JWT generation.
   ========================================================== */

// Import the Express framework
const express = require('express');
// Create a new router instance for authentication endpoints
const router = express.Router();
// Import bcrypt for secure password hashing and comparison
const bcrypt = require('bcrypt');
// Import jsonwebtoken for creating signed authentication tokens
const jwt = require('jsonwebtoken');
// Import the database pool connection from the local db module
const { pool } = require('../db');

/**
 * POST /api/auth/register
 * Handles the creation of a new user account including password hashing and initial role assignment.
 * @param {string} name - Full name of the user.
 * @param {string} email - Unique email address for login.
 * @param {string} password - Raw password string to be hashed.
 */
router.post('/register', async (req, res) => {
    // Start a try block to handle potential asynchronous errors
    try {
        // Destructure personal details from the request body
        const { name, email, password } = req.body;
        // Hash the plain-text password with a salt round of 10
        const hashedPassword = await bcrypt.hash(password, 10);

        // Assign 'admin' role to a specific email, otherwise 'consumer'
        const role = email === 'rachel@gmail.com' ? 'admin' : 'consumer';
        // Insert the new user into the database and return their core info
        const newUser = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, hashedPassword, role]
        );

        // Extract the newly created user object from the query result
        const user = newUser.rows[0];
        // Generate a JWT containing the user's ID, email, and role
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            // Sign the token using the secret key from environment variables
            process.env.JWT_SECRET,
            // Set the token to expire in 1 hour
            { expiresIn: '1h' }
        );

        // Send the generated token and user info back to the client
        res.json({ token, user });
    // Catch any errors that occurred during the registration process
    } catch (err) {
        // Log the detailed error message to the server console
        console.error(err.message);
        // Return a 500 Internal Server Error status to the client
        res.status(500).send("Server Error");
    }
// End of the registration route handler
});

/**
 * POST /api/auth/login
 * Verifies user credentials against the database and issues a signed JWT session token.
 * @param {string} email - Registered user email.
 * @param {string} password - Raw password for verification.
 */
router.post('/login', async (req, res) => {
    // Start a try block for the login logic
    try {
        // Extract credentials from the incoming request body
        const { email, password } = req.body;
        // Search the database for a user matching the provided email
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        // Return a 401 Unauthorized status if no matching user is found
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Retrieve the user data from the query rows
        const user = userResult.rows[0];
        // Compare the provided password with the stored hashed password
        const validPassword = await bcrypt.compare(password, user.password);

        // Return a 401 Unauthorized status if the password does not match
        if (!validPassword) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Return a 403 Forbidden status if the user has been suspended
        if (user.is_banned) {
            return res.status(403).json({ message: "Your account has been banned." });
        }

        // Generate a new JWT for the authenticated user session
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            // Use the environment secret key for signing
            process.env.JWT_SECRET,
            // Set the token expiration duration
            { expiresIn: '1h' }
        );

        // Return the token and non-sensitive user profile data
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    // Handle any unexpected errors during the login sequence
    } catch (err) {
        // Log the error message for server-side debugging
        console.error(err.message);
        // Inform the client that a server-side error occurred
        res.status(500).send("Server Error");
    }
// End of the login route handler
});

// Export the router to be mounted in the main server file
module.exports = router;
