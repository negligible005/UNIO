/* ==========================================================
   ADMIN.JS - ADMINISTRATIVE API ROUTES
   This module provides endpoints for administrators to manage
   users, listings, bookings, marketplace posts, and system stats.
   ========================================================== */

// Import the Express framework
const express = require('express');
// Create a new router instance for administrative endpoints
const router = express.Router();
// Import the database pool connection from the local db module
const { pool } = require('../db');
// Import the authentication middleware to verify user identity
const { authenticateToken } = require('../middleware/authMiddleware');
// Import the admin authorization middleware to restrict access
const { isAdmin } = require('../middleware/admin');

/* --- ADMIN ACCESS CONTROL ---
   Ensures all routes in this file are protected and restricted to admins. */

// Apply authentication and admin-check middleware to all subsequent routes
router.use(authenticateToken, isAdmin);

/* --- USER MANAGEMENT SECTION ---
   Endpoints for viewing, modifying, and banning registered users. */

// GET endpoint to fetch a list of all registered users with activity counts
router.get('/users', async (req, res) => {
    // Start a try block for the database operation
    try {
        // Query the database for user details and sub-queries for activity counts
        const result = await pool.query(`
            SELECT id, name, email, role, created_at,
                   -- Count the total bookings made by each user
                   (SELECT COUNT(*) FROM bookings WHERE user_id = users.id) as booking_count,
                   -- Count the total marketplace items listed by each user
                   (SELECT COUNT(*) FROM marketplace_items WHERE seller_id = users.id) as listing_count
            FROM users ORDER BY created_at DESC
        `);
        // Return the resulting rows of user data as a JSON response
        res.json(result.rows);
    // Handle any potential database errors
    } catch (err) {
        // Log the error message to the server console
        console.error(err.message);
        // Respond with a 500 status and a generic error message
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to update the role of a specific user by their ID
router.put('/users/:id/role', async (req, res) => {
    // Start a try block for the update logic
    try {
        // Extract the user ID from the URL parameters
        const { id } = req.params;
        // Extract the new role from the request body
        const { role } = req.body;
        // Validate that the provided role is one of the allowed types
        if (!['consumer', 'provider', 'admin'].includes(role)) {
            // Return a 400 Bad Request error if the role is invalid
            return res.status(400).json({ message: 'Invalid role' });
        }
        // Update the user's role in the database for the matching ID
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        // Return a success message confirming the role change
        res.json({ message: `User role updated to ${role}` });
    // Catch any errors during the update process
    } catch (err) {
        // Log the error details for server-side debugging
        console.error(err.message);
        // Inform the client that a server-side error occurred
        res.status(500).send("Server Error");
    }
});

// DELETE endpoint to ban a user (logic-level deletion)
router.delete('/users/:id', async (req, res) => {
    // Start a try block for the banning operation
    try {
        // Extract the user ID to be banned from the request parameters
        const { id } = req.params;
        // Update the user record to 'banned' status instead of actual deletion
        await pool.query('UPDATE users SET is_banned = TRUE WHERE id = $1', [id]);
        // Confirm the banning operation was successful
        res.json({ message: "User banned successfully" });
    // Handle any exceptions during the database query
    } catch (err) {
        // Log the error message to the server's standard error stream
        console.error(err.message);
        // Send a generic server error response to the client
        res.status(500).send("Server Error");
    }
});

/* --- LISTINGS MANAGEMENT SECTION ---
   Endpoints for approving, rejecting, and viewing service listings. */

// GET endpoint to fetch all listings that have not yet been approved
router.get('/listings/pending', async (req, res) => {
    // Start a try block for the pending listings query
    try {
        // Query the database for listings and join with users for provider details
        const result = await pool.query(`
            SELECT l.*, u.name as provider_name, u.email as provider_email
            FROM listings l
            LEFT JOIN users u ON l.provider_id = u.id
            WHERE l.approved = FALSE ORDER BY l.created_at DESC
        `);
        // Return the list of pending listings as a JSON array
        res.json(result.rows);
    // Handle any potential errors during the retrieval process
    } catch (err) {
        // Log the error message for server-side troubleshooting
        console.error(err.message);
        // Respond with a 500 status code indicating a server-side error
        res.status(500).send("Server Error");
    }
});

// GET endpoint to fetch every listing in the system, regardless of status
router.get('/listings/all', async (req, res) => {
    // Start a try block for the comprehensive listings query
    try {
        // Query the database for all listings and include owner details
        const result = await pool.query(`
            SELECT l.*, u.name as provider_name, u.email as provider_email
            FROM listings l
            LEFT JOIN users u ON l.provider_id = u.id
            ORDER BY l.created_at DESC
        `);
        // Send the complete list of listings to the client
        res.json(result.rows);
    // Catch and handle any errors during the data fetch
    } catch (err) {
        // Log the specific error for administrative review
        console.error(err.message);
        // Notify the client that the server encountered an error
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to mark a specific listing as 'approved' by its ID
router.put('/listings/:id/approve', async (req, res) => {
    // Start a try block for the approval update
    try {
        // Extract the listing ID from the request URL parameters
        const { id } = req.params;
        // Update the listing's approval status and set its state to 'approved'
        await pool.query("UPDATE listings SET approved = TRUE, status = 'approved' WHERE id = $1", [id]);
        // Confirm successful approval of the listing
        res.json({ message: "Listing approved successfully" });
    // Catch errors during the status update
    } catch (err) {
        // Log the error message to the console
        console.error(err.message);
        // Send a 500 error response to the client
        res.status(500).send("Server Error");
    }
});

// DELETE endpoint to reject a listing (logical rejection)
router.delete('/listings/:id/reject', async (req, res) => {
    // Start a try block for the rejection logic
    try {
        // Retrieve the ID of the listing to be rejected from parameters
        const { id } = req.params;
        // Update the listing status to 'rejected' to hide it without deleting records
        await pool.query("UPDATE listings SET approved = FALSE, status = 'rejected' WHERE id = $1", [id]);
        // Return a confirmation message for the rejection
        res.json({ message: "Listing rejected successfully" });
    // Handle database or connection errors
    } catch (err) {
        // Log the failure message for server-side monitoring
        console.error(err.message);
        // Respond with an internal server error status
        res.status(500).send("Server Error");
    }
});

/* --- BOOKINGS MANAGEMENT SECTION ---
   Endpoints for monitoring and updating customer bookings. */

// GET endpoint to fetch all system bookings with comprehensive details
router.get('/bookings', async (req, res) => {
    // Start a try block for the bookings data retrieval
    try {
        // Execute a large query joining bookings with users, listings, and payments
        const result = await pool.query(`
            SELECT b.*, u.name as user_name, u.email as user_email, l.type as listing_type,
                   l.price_per_unit, l.base_cost,
                   dp.id as payment_table_id, dp.confirmation_id, dp.status as dp_status
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN listings l ON b.listing_id = l.id
            LEFT JOIN dummy_payments dp ON dp.booking_id = b.id
            -- Sort by priority first, then by the most recent creation date
            ORDER BY b.is_priority DESC, b.created_at DESC
        `);
        // Return the combined booking and payment data as JSON
        res.json(result.rows);
    // Handle failures in the database join or query
    } catch (err) {
        // Log the error message to the server's standard error stream
        console.error(err.message);
        // Respond with a 500 status code to the client
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to flip the 'is_priority' status of a specific booking
router.put('/bookings/:id/prioritize', async (req, res) => {
    // Start a try block for the priority toggle
    try {
        // Extract the booking ID from the parameters
        const { id } = req.params;
        // Fetch the current priority status for the given booking ID
        const currentRes = await pool.query('SELECT is_priority FROM bookings WHERE id = $1', [id]);
        // Return 404 if the booking does not exist in the database
        if (currentRes.rows.length === 0) return res.status(404).json({ message: "Booking not found" });

        // Invert the existing priority value (True becomes False, and vice versa)
        const newPriority = !currentRes.rows[0].is_priority;
        // Update the database record with the new priority state
        await pool.query('UPDATE bookings SET is_priority = $1 WHERE id = $2', [newPriority, id]);

        // Send confirmation and the new priority status back to the client
        res.json({ message: `Booking priority updated to ${newPriority}`, is_priority: newPriority });
    // Handle query errors or database disconnection
    } catch (err) {
        // Log the error message for debugging
        console.error(err.message);
        // Inform the client that the update failed
        res.status(500).send("Server Error");
    }
});

/// PUT endpoint to modify the status and ETA for a specific customer booking
router.put('/bookings/:id/status', async (req, res) => {
    // Start a try block for the booking status update
    try {
        // Get the target booking ID from the URL
        const { id } = req.params;
        // Extract the new status value and ETA from the request body
        const { status, eta } = req.body;
        
        // Update the database and return the updated record details
        const result = await pool.query(
            'UPDATE bookings SET status = $1, eta = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [status, eta, id]
        );

        // Return a 404 response if the booking ID was not found
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Booking not found" });
        }

        // Extract the updated booking object from the result rows
        const booking = result.rows[0];
        
        // Retrieve the Socket.IO instance configured in the app
        const io = req.app.get('io');
        // Check if the Socket.IO instance is available
        if (io) {
            // Send a real-time 'order_update' event to the specific user's room
            io.to(`user_${booking.user_id}`).emit('order_update', {
                orderId: booking.id,
                status: booking.status,
                eta: booking.eta,
                updatedAt: booking.updated_at
            });
            // Log the successful real-time event emission
            console.log(`[SOCKET] Emitted update for user_${booking.user_id}, booking ${booking.id}`);
        }

        // Confirm the status change and return the updated booking data
        res.json({ message: `Booking status updated to ${status}`, booking });
    // Handle database field update errors
    } catch (err) {
        // Log the internal error message
        console.error(err.message);
        // Return a standard 500 server error response
        res.status(500).send("Server Error");
    }
});
/* --- MARKETPLACE POSTS MANAGEMENT SECTION ---
   Endpoints for overseeing community marketplace active and pending items. */

// GET endpoint to retrieve all items listed in the marketplace
router.get('/marketplace/posts', async (req, res) => {
    // Start a try block for the marketplace data fetch
    try {
        // Query the database for items and join with users to get seller info
        const result = await pool.query(`
            SELECT mi.*, u.name as seller_name, u.email as seller_email
            FROM marketplace_items mi
            LEFT JOIN users u ON mi.seller_id = u.id
            -- Sort items by their creation date in descending order
            ORDER BY mi.created_at DESC
        `);
        // Return the list of marketplace items as JSON
        res.json(result.rows);
    // Handle database retrieval errors
    } catch (err) {
        // Log the error message to the server console
        console.error(err.message);
        // Respond with a 500 internal server error status
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to approve a marketplace item by its ID
router.put('/marketplace/:id/approve', async (req, res) => {
    // Start a try block for the approval status update
    try {
        // Extract the unique item ID from the URL parameters
        const { id } = req.params;
        // Update the item status to 'active' in the database
        await pool.query("UPDATE marketplace_items SET status = 'active' WHERE id = $1", [id]);
        // Confirm the item has been approved
        res.json({ message: "Marketplace item approved" });
    // Catch any database update failures
    } catch (err) {
        // Log the error for administrative tracking
        console.error(err.message);
        // Notify the client of the server failure
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to reject a marketplace item by its ID
router.put('/marketplace/:id/reject', async (req, res) => {
    // Start a try block for the rejection update
    try {
        // Get the item ID from the request parameter list
        const { id } = req.params;
        // Mark the item as 'rejected' to remove it from public view
        await pool.query("UPDATE marketplace_items SET status = 'rejected' WHERE id = $1", [id]);
        // Confirm successful rejection of the item
        res.json({ message: "Marketplace item rejected" });
    // Handle database record update errors
    } catch (err) {
        // Log the error message to the server log
        console.error(err.message);
        // Send a 500 error status back to the client
        res.status(500).send("Server Error");
    }
});

/* --- SPLIT REQUESTS MANAGEMENT SECTION ---
   Endpoints for administrators to moderate cost-sharing split requests. */

// GET endpoint to fetch all cost-split requests in the system
router.get('/splits/all', async (req, res) => {
    // Start a try block for the split requests data query
    try {
        // Execute a query joining splits with users and marketplace items
        const result = await pool.query(`
            SELECT sr.*, u.name as creator_name, u.email as creator_email,
                   mi.title as item_title, mi.type as item_type
            FROM split_requests sr
            LEFT JOIN users u ON sr.creator_id = u.id
            LEFT JOIN marketplace_items mi ON sr.item_id = mi.id
            -- Display the most recent split requests first
            ORDER BY sr.created_at DESC
        `);
        // Return the enriched list of split requests as JSON
        res.json(result.rows);
    // Handle any issues with the complex database join
    } catch (err) {
        // Log the error details for the system administrator
        console.error(err.message);
        // Return a 500 status code indicating a logic failure
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to approve and open a pending split request
router.put('/splits/:id/approve', async (req, res) => {
    // Start a try block for the split approval
    try {
        // Retrieve the specific split ID from the URL
        const { id } = req.params;
        // Update the split status to 'open' to allow users to join
        await pool.query("UPDATE split_requests SET status = 'open' WHERE id = $1", [id]);
        // Confirm the split request is now active
        res.json({ message: "Split request approved" });
    // Catch database field modification errors
    } catch (err) {
        // Log the specific error to the console
        console.error(err.message);
        // Inform the client of the internal error
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to reject a pending split request
router.put('/splits/:id/reject', async (req, res) => {
    // Start a try block for the split rejection
    try {
        // Capture the split ID from the request parameters
        const { id } = req.params;
        // Mark the split as 'rejected' in the database records
        await pool.query("UPDATE split_requests SET status = 'rejected' WHERE id = $1", [id]);
        // Return a confirmation of the rejection
        res.json({ message: "Split request rejected" });
    // Handle potential exceptions during the update
    } catch (err) {
        // Log the error message for system health monitoring
        console.error(err.message);
        // Pass a standard 500 error response to the requester
        res.status(500).send("Server Error");
    }
});

/* --- TRACKING MANAGEMENT SECTION ---
   Endpoints for verifying provider-submitted location and status updates. */

// GET endpoint for fetching tracking updates that require admin confirmation
router.get('/tracking/pending', async (req, res) => {
    // Start a try block for the pending tracking query
    try {
        // Query the database for updates and join with listings and users
        const result = await pool.query(`
            SELECT t.*, l.type as listing_type, l.location as route_details, u.name as provider_name
            FROM tracking_updates t
            JOIN listings l ON t.listing_id = l.id
            JOIN users u ON l.provider_id = u.id
            WHERE t.is_confirmed = FALSE
            -- Sort by the time the update was reported
            ORDER BY t.reported_at DESC
        `);
        // Return the pending tracking updates as a JSON response
        res.json(result.rows);
    // Handle database connection or query errors
    } catch (err) {
        // Log the error message to the server console
        console.error(err.message);
        // Respond with a 500 internal server error status
        res.status(500).send("Server Error");
    }
});

// PUT endpoint to confirm a specific tracking update by its ID
router.put('/tracking/:id/confirm', async (req, res) => {
    // Start a try block for the confirmation update
    try {
        // Extract the unique tracking update ID from the URL
        const { id } = req.params;
        // Mark the tracking update as confirmed in the database
        await pool.query('UPDATE tracking_updates SET is_confirmed = TRUE WHERE id = $1', [id]);
        // Confirm successful confirmation of the tracking data
        res.json({ message: "Tracking update confirmed" });
    // Catch any errors during the status update
    } catch (err) {
        // Log the error for administrative tracking
        console.error(err.message);
        // Inform the client that the server encountered an error
        res.status(500).send("Server Error");
    }
});

// DELETE endpoint to reject and delete an inaccurate tracking update
router.delete('/tracking/:id/reject', async (req, res) => {
    // Start a try block for the rejection logic
    try {
        // Get the specific tracking update ID from parameters
        const { id } = req.params;
        // Permanently remove the tracking record from the database
        await pool.query('DELETE FROM tracking_updates WHERE id = $1', [id]);
        // Return a confirmation message for the removal
        res.json({ message: "Tracking update rejected and removed" });
    // Handle database deletion errors
    } catch (err) {
        // Log the failure message to the server's standard error stream
        console.error(err.message);
        // Respond with a generic server error status
        res.status(500).send("Server Error");
    }
});

/* --- SITE INQUIRIES MANAGEMENT SECTION ---
   Endpoints for managing contact form submissions and user support requests. */

// GET endpoint to retrieve all inquiries submitted through the site
router.get('/inquiries', async (req, res) => {
    // Start a try block for the inquiries retrieval
    try {
        // Fetch all site inquiries sorted by the most recent submission
        const result = await pool.query('SELECT * FROM site_inquiries ORDER BY created_at DESC');
        // Return the list of inquiry records as JSON
        res.json(result.rows);
    // Handle database retrieval failures
    } catch (err) {
        // Log the error details for server-side monitoring
        console.error(err.message);
        // Send a 500 error status back to the client
        res.status(500).send("Server Error");
    }
});

// DELETE endpoint to remove a resolved or spam inquiry
router.delete('/inquiries/:id', async (req, res) => {
    // Start a try block for the inquiry deletion
    try {
        // Extract the inquiry ID to be deleted from the request URL
        const { id } = req.params;
        // Permanently delete the inquiry record from the database
        await pool.query('DELETE FROM site_inquiries WHERE id = $1', [id]);
        // Confirm the inquiry has been removed successfully
        res.json({ message: "Inquiry removed successfully" });
    // Catch any errors during the deletion process
    } catch (err) {
        // Log the error message to the console
        console.error(err.message);
        // Inform the client of the internal server failure
        res.status(500).send("Server Error");
    }
});

/* --- DASHBOARD STATISTICS SECTION ---
   Consolidated endpoint for system-wide overview metrics. */

// GET endpoint to calculate and return aggregate platform statistics
router.get('/overview', async (req, res) => {
    // Start a try block for the complex statistical computations
    try {
        // Execute multiple count queries simultaneously for better performance
        const [users, bookings, listings, marketplace, splits, tracking, inquiries] = await Promise.all([
            // Count total registered users
            pool.query('SELECT COUNT(*) FROM users'),
            // Count total bookings processed through the system
            pool.query('SELECT COUNT(*) FROM bookings'),
            // Count listings currently awaiting administrative approval
            pool.query('SELECT COUNT(*) FROM listings WHERE approved = FALSE'),
            // Count marketplace items needing review (excluding active/rejected)
            pool.query("SELECT COUNT(*) FROM marketplace_items WHERE status NOT IN ('active', 'rejected')"),
            // Count split requests that are currently in 'pending' status
            pool.query("SELECT COUNT(*) FROM split_requests WHERE status = 'pending'"),
            // Count tracking updates that have not yet been verified
            pool.query('SELECT COUNT(*) FROM tracking_updates WHERE is_confirmed = FALSE'),
            // Count the total number of site inquiries received
            pool.query('SELECT COUNT(*) FROM site_inquiries'),
        ]);
        // Return a structured JSON object containing all collected metrics
        res.json({
            // Parse counts as integers (PostgreSQL returns them as strings)
            totalUsers: parseInt(users.rows[0].count),
            totalBookings: parseInt(bookings.rows[0].count),
            pendingListings: parseInt(listings.rows[0].count),
            pendingMarketplace: parseInt(marketplace.rows[0].count),
            pendingSplits: parseInt(splits.rows[0].count),
            pendingTracking: parseInt(tracking.rows[0].count),
            totalInquiries: parseInt(inquiries.rows[0].count),
        });
    // Handle any failures during the parallel query execution
    } catch (err) {
        // Log the full error message for investigative review
        console.error(err.message);
        // notify the requester of the internal server-side error
        res.status(500).send("Server Error");
    }
});

// Export the administrative router for integration into the main application
module.exports = router;

