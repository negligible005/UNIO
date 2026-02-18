const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// POST /api/feedback - Submit feedback for a booking
router.post('/', authenticateToken, async (req, res) => {
    const { booking_id, rating, comment } = req.body;
    const userId = req.user.id;

    if (!booking_id || !rating) {
        return res.status(400).json({ message: "Booking ID and Rating are required" });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    try {
        // Check if booking exists and belongs to user
        const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [booking_id, userId]);
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ message: "Booking not found or unauthorized" });
        }

        // Check if feedback already exists for this booking
        const existingFeedback = await pool.query('SELECT * FROM feedback WHERE booking_id = $1', [booking_id]);
        if (existingFeedback.rows.length > 0) {
            return res.status(400).json({ message: "Feedback already submitted for this booking" });
        }

        // Insert feedback
        const newFeedback = await pool.query(
            'INSERT INTO feedback (booking_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [booking_id, userId, rating, comment]
        );

        res.status(201).json({ message: "Feedback submitted successfully", feedback: newFeedback.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// GET /api/feedback/booking/:bookingId - Check if feedback exists for a booking
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.id;

        const feedback = await pool.query('SELECT * FROM feedback WHERE booking_id = $1 AND user_id = $2', [bookingId, userId]);

        if (feedback.rows.length > 0) {
            res.json({ exists: true, feedback: feedback.rows[0] });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
