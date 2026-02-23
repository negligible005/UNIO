const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// Rate a User
router.post('/rate', authenticateToken, async (req, res) => {
    try {
        const { rateeId, score, comment } = req.body;
        const raterId = req.user.id;

        if (raterId === rateeId) return res.status(400).json({ message: "Cannot rate yourself" });

        // Ensure they shared a booking
        const shared = await pool.query(`
            SELECT 1 FROM bookings b1
            JOIN bookings b2 ON b1.listing_id = b2.listing_id
            WHERE b1.user_id = $1 AND b2.user_id = $2
        `, [raterId, rateeId]);

        if (shared.rows.length === 0) {
            return res.status(403).json({ message: "Must share a split to rate a user" });
        }

        await pool.query(
            "INSERT INTO trust_scores (rater_id, ratee_id, score, comment) VALUES ($1, $2, $3, $4)",
            [raterId, rateeId, score, comment]
        );

        res.json({ message: "Rating submitted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
