/* ==========================================================
   AUTHMIDDLEWARE.JS - USER AUTHENTICATION
   This middleware verifies the JSON Web Token (JWT) provided
   in the request headers to ensure the user is logged in.
   ========================================================== */

// Import the jsonwebtoken library for token verification
const jwt = require('jsonwebtoken');

/**
 * Middleware function to authenticate the JSON Web Token (JWT).
 * Extracts the token from the Authorization header and verifies it.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Callback to proceed to the next middleware.
 */
const authenticateToken = (req, res, next) => {
    // Retrieve the 'authorization' header (formatted as 'Bearer <token>')
    const authHeader = req.headers['authorization'];
    // Extract the precise token string using split, handles null cases
    const token = authHeader && authHeader.split(' ')[1];

    // Return a 401 Unauthorized response if the token is missing
    if (!token) return res.status(401).json({ message: 'No token provided' });

    // Verify the retrieved token against the server's secret key
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        // Return a 403 Forbidden response if the token is invalid or expired
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        // Attach the decoded user information to the request object
        req.user = user;
        // Pass control to the next middleware or route handler in the stack
        next();
    });
// End of the authenticateToken function definition
};

// Export the middleware function for use in protected API routes
module.exports = { authenticateToken };
