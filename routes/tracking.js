const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * POST /api/tracking/listings/:listing_id
 * Providers use this endpoint to submit new geographical checkpoints for their active services.
 * Each update includes a human-readable location name and precise GPS coordinates (lat/lng).
 * @requires authenticateToken - Must be the record owner.
 */
router.post('/listings/:listing_id', authenticateToken, async (req, res) => {
    try {
        const { listing_id } = req.params;
        const { location_name, lat, lng } = req.body;
        const providerId = req.user.id;

        // Verification: Ensure the listing exists and the requester is the authorized provider
        const listingRes = await pool.query('SELECT provider_id FROM listings WHERE id = $1', [listing_id]);
        if (listingRes.rows.length === 0) {
            return res.status(404).json({ message: "Listing not found" });
        }
        if (listingRes.rows[0].provider_id !== providerId) {
            return res.status(403).json({ message: "Only the provider can update tracking for this listing" });
        }

        // Insert checkpoint as 'unconfirmed'; will require admin verification for public visibility
        const newUpdate = await pool.query(
            `INSERT INTO tracking_updates (listing_id, location_name, lat, lng, is_confirmed) 
             VALUES ($1, $2, $3, $4, FALSE) RETURNING *`,
            [listing_id, location_name, lat, lng]
        );

        res.status(201).json({ message: "Tracking update submitted", update: newUpdate.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/**
 * GET /api/tracking/listings/:listing_id
 * Retrieves the sequence of checkpoints for a specific service listing.
 * Implements access-control:
 *   - Admins/Providers: See all checkpoints (including unconfirmed)
 *   - Consumers: See only confirmed checkpoints if they have an active booking
 * @requires authenticateToken
 */
router.get('/listings/:listing_id', authenticateToken, async (req, res) => {
    try {
        const { listing_id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Determining the filter level based on user role and booking history
        let isAuthorized = false;
        let fetchOnlyConfirmed = true;

        if (userRole === 'admin') {
            // Admins have unrestricted visibility for moderation purposes
            isAuthorized = true;
            fetchOnlyConfirmed = false;
        } else {
            // Check if the user is the primary service provider
            const listingRes = await pool.query('SELECT provider_id FROM listings WHERE id = $1', [listing_id]);
            if (listingRes.rows.length > 0 && listingRes.rows[0].provider_id === userId) {
                isAuthorized = true;
                // Providers see their own submissions immediately before confirmation
                fetchOnlyConfirmed = false;
            } else {
                // Determine if the user is a consumer who has joined this specific split
                const bookingRes = await pool.query('SELECT id FROM bookings WHERE user_id = $1 AND listing_id = $2', [userId, listing_id]);
                if (bookingRes.rows.length > 0) {
                    isAuthorized = true;
                }
            }
        }

        // Access restriction if none of the above criteria were satisfied
        if (!isAuthorized) {
            return res.status(403).json({ message: "Access denied" });
        }

        // Build the query to fetch checkpoints in chronological report order
        let query = 'SELECT * FROM tracking_updates WHERE listing_id = $1';
        if (fetchOnlyConfirmed) {
            query += ' AND is_confirmed = TRUE';
        }
        query += ' ORDER BY reported_at ASC';

        const result = await pool.query(query, [listing_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
