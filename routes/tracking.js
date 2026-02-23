const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// POST /api/tracking/listings/:listing_id - Provider submits a tracking checkpoint
router.post('/listings/:listing_id', authenticateToken, async (req, res) => {
    try {
        const { listing_id } = req.params;
        const { location_name, lat, lng } = req.body;
        const providerId = req.user.id; // from token

        // Verify the user is the provider for this listing
        const listingRes = await pool.query('SELECT provider_id FROM listings WHERE id = $1', [listing_id]);
        if (listingRes.rows.length === 0) {
            return res.status(404).json({ message: "Listing not found" });
        }
        if (listingRes.rows[0].provider_id !== providerId) {
            return res.status(403).json({ message: "Only the provider can update tracking for this listing" });
        }

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

// GET /api/tracking/listings/:listing_id - Fetch checkpoints for a listing
router.get('/listings/:listing_id', authenticateToken, async (req, res) => {
    try {
        const { listing_id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role; // e.g. 'admin', 'consumer', missing/other

        // If the user is the provider OR an admin, fetch ALL checkpoints for this listing.
        // If the user is a consumer, verify they have a booking for this listing, and fetch only CONFIRMED checkpoints.
        let isAuthorized = false;
        let fetchOnlyConfirmed = true;

        if (userRole === 'admin') {
            isAuthorized = true;
            fetchOnlyConfirmed = false;
        } else {
            // Check if user is the provider
            const listingRes = await pool.query('SELECT provider_id FROM listings WHERE id = $1', [listing_id]);
            if (listingRes.rows.length > 0 && listingRes.rows[0].provider_id === userId) {
                isAuthorized = true;
                fetchOnlyConfirmed = false;
            } else {
                // Check if user has a booking
                const bookingRes = await pool.query('SELECT id FROM bookings WHERE user_id = $1 AND listing_id = $2', [userId, listing_id]);
                if (bookingRes.rows.length > 0) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "Access denied" });
        }

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
