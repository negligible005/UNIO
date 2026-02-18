const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// Create Listing (Provider Only)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { type, capacity, price_per_unit, location, date, details } = req.body;
        const providerId = req.user.id;

        // Verify user is a provider (optional, but good practice)
        // if (req.user.role !== 'provider') return res.status(403).json({ message: "Access denied" });

        const newListing = await pool.query(
            `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [providerId, type, capacity, price_per_unit, location, date, JSON.stringify(details)]
        );

        res.json(newListing.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get Provider's Own Listings
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const providerId = req.user.id;
        const result = await pool.query('SELECT * FROM listings WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get All Listings (For Consumers)
router.get('/', async (req, res) => {
    try {
        // Build query based on filters if needed, for now return all approved
        const listings = await pool.query('SELECT * FROM listings WHERE approved = TRUE ORDER BY created_at DESC');
        res.json(listings.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
