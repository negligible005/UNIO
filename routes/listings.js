/* ==========================================================
   LISTINGS.JS - SERVICE LISTING MANAGEMENT
   This module provides endpoints for service providers to
   create, view, and manage their logistics or shipping listings.
   ========================================================== */

// Import the Express framework
const express = require('express');
// Create a new router instance for listing-related endpoints
const router = express.Router();
// Import the database pool connection from the local db module
const { pool } = require('../db');
// Import the authentication middleware to verify user identity
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * POST /api/listings/
 * Creates a new logistics or storage service offering for the authenticated provider.
 * @requires authenticateToken - Valid user session.
 */
router.post('/', authenticateToken, async (req, res) => {
    // Start a try block to handle asynchronous database operations
    try {
        // Destructure listing details from the incoming request body
        const { type, capacity, price_per_unit, location, date, details, base_cost } = req.body;
        // Retrieve the authenticated user's ID from the request object
        const providerId = req.user.id;

        // Note: Additional role-based checks for 'provider' could be added here
        // if (req.user.role !== 'provider') return res.status(403).json({ message: "Access denied" });

        // Insert the new listing into the database and return the full record
        const newListing = await pool.query(
            `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, base_cost) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            // Provide parameters to the SQL query to prevent injection
            [providerId, type, capacity, price_per_unit, location, date, JSON.stringify(details), base_cost || 0]
        );

        // Send the newly created listing data back to the client as JSON
        res.json(newListing.rows[0]);
    // Catch any errors that occurred during the insertion process
    } catch (err) {
        // Log the error message to the server console for debugging
        console.error(err.message);
        // Return a 500 Internal Server Error status to the client
        res.status(500).send("Server Error");
    }
// End of the listing creation route handler
});

/**
 * GET /api/listings/my
 * Retrieves a collection of all service listings created by the currently authenticated provider.
 * @requires authenticateToken - Valid user session.
 */
router.get('/my', authenticateToken, async (req, res) => {
    // Start a try block for the database query
    try {
        // Capture the ID of the authenticated provider
        const providerId = req.user.id;
        // Search the database for listings matching the provider's ID
        const result = await pool.query('SELECT * FROM listings WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
        // Return the provider's specific list of listings
        res.json(result.rows);
    // Handle any potential database errors
    } catch (err) {
        // Log the error details for server-side troubleshooting
        console.error(err.message);
        // Respond with a 500 status code indicating a generic failure
        res.status(500).send("Server Error");
    }
// End of the provider-specific retrieval route
});

/**
 * GET /api/listings/
 * Public endpoint to retrieve all approved service listings, sorted by creation date.
 */
router.get('/', async (req, res) => {
    // Start a try-catch block for the retrieval logic
    try {
        // Fetch listings that have been approved by administrators
        const listings = await pool.query('SELECT * FROM listings WHERE approved = TRUE ORDER BY created_at DESC');
        // Send the collection of approved listings to the client
        res.json(listings.rows);
    // Handle database connection or execution issues
    } catch (err) {
        // Log the error message to the server logs
        console.error(err.message);
        // Inform the client that an internal server error occurred
        res.status(500).send("Server Error");
    }
// End of the public listing retrieval route
});

/**
 * PUT /api/listings/:id
 * Allows a provider to update their own existing service listing.
 * Includes data validation to ensure the user owns the record being modified.
 * @requires authenticateToken
 */
router.put('/:id', authenticateToken, async (req, res) => {
    // Start a try block for the update operation
    try {
        // Extract the listing ID from the URL path parameters
        const { id } = req.params;
        // Retrieve the authenticated user's ID
        const providerId = req.user.id;
        // Destructure updated data fields from the request body
        const { capacity, price_per_unit, location, date, base_cost, details } = req.body;

        // Query the database to verify the listing exists and check ownership
        const listingCheck = await pool.query('SELECT provider_id, details FROM listings WHERE id = $1', [id]);
        // Return a 404 status if the requested listing is not found
        if (listingCheck.rows.length === 0) {
            return res.status(404).json({ message: "Listing not found" });
        }
        // Return a 403 Forbidden status if the user does not own the listing
        if (listingCheck.rows[0].provider_id !== providerId) {
            return res.status(403).json({ message: "Not authorized to edit this listing" });
        }

        // Merge existing details with any newly provided JSON metadata
        let newDetails = listingCheck.rows[0].details || {};
        if (details) {
            newDetails = { ...newDetails, ...details };
        }

        // Execute the update query using COALESCE to keep original values if null
        const updatedListing = await pool.query(
            `UPDATE listings 
             SET capacity = COALESCE($1, capacity), 
                 price_per_unit = COALESCE($2, price_per_unit), 
                 location = COALESCE($3, location), 
                 date = COALESCE($4, date), 
                 base_cost = COALESCE($5, base_cost),
                 details = $6
             WHERE id = $7 RETURNING *`,
            // Pass the sanitized parameters to the query
            [capacity, price_per_unit, location, date, base_cost, JSON.stringify(newDetails), id]
        );

        // Return the updated listing record to the client
        res.json(updatedListing.rows[0]);
    // Handle failures during the update or validation steps
    } catch (err) {
        // Log the specific error for administrative investigation
        console.error(err.message);
        // Notify the client that an internal error occurred
        res.status(500).send("Server Error");
    }
// End of the listing update route handler
});

/**
 * DELETE /api/listings/:id
 * Deletes a listing and its associated bookings from the database.
 * @requires authenticateToken - Must be the listing owner.
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    // Start a try-catch block for the deletion sequence
    try {
        // Extract the target listing ID from the URL
        const { id } = req.params;
        // Capture the authenticated user's unique ID
        const providerId = req.user.id;

        // Perform a check to ensure the listing exists and belongs to the user
        const listingCheck = await pool.query('SELECT provider_id FROM listings WHERE id = $1', [id]);
        // Respond with 404 if the listing ID does not exist
        if (listingCheck.rows.length === 0) {
            return res.status(404).json({ message: "Listing not found" });
        }
        // Respond with 403 if the user is not the original provider
        if (listingCheck.rows[0].provider_id !== providerId) {
            return res.status(403).json({ message: "Not authorized to delete this listing" });
        }

        // Delete all bookings associated with this listing to maintain integrity
        await pool.query('DELETE FROM bookings WHERE listing_id = $1', [id]);
        // Permanently remove the listing record from the database
        await pool.query('DELETE FROM listings WHERE id = $1', [id]);

        // Send a confirmation message indicating successful deletion
        res.json({ message: "Listing deleted successfully" });
    // Catch any database or foreign key constraint errors
    } catch (err) {
        // Log the detailed error message for server monitoring
        console.error(err.message);
        // Inform the client that a server failure prevented deletion
        res.status(500).send("Server Error");
    }
// End of the listing deletion route handler
});

// Export the router to be mounted in the main application file
module.exports = router;
