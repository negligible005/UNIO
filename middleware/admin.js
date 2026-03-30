/* ==========================================================
   ADMIN.JS - ADMINISTRATIVE PRIVILEGE VERIFICATION
   This middleware ensures that the authenticated user has
   the 'admin' role before allowing access to restricted paths.
   ========================================================== */

/**
 * Middleware function to check for administrative privileges.
 * @param {Object} req - Express request object containing 'user' from authMiddleware.
 * @param {Object} res - Express response object.
 * @param {Function} next - Callback to proceed to the next middleware.
 */
const isAdmin = (req, res, next) => {
    // Check if the user object exists and has the required 'admin' role
    if (req.user && req.user.role === 'admin') {
        // Grant access by proceeding to the next function in the chain
        next();
    // Execute block if the user is not an administrator
    } else {
        // Return a 403 Forbidden response with a descriptive error message
        res.status(403).json({ message: "Access denied. Admin role required." });
    }
// End of the isAdmin function definition
};

// Export the isAdmin middleware for use in administrative API routes
module.exports = { isAdmin };
