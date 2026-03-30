const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * POST /api/feedback/
 * Submits a rating and written review for a completed booking.
 * Validates booking ownership and ensures a 1:1 ratio between bookings and feedback.
 * @requires authenticateToken
 */
router.post('/', authenticateToken, async (req, res) => {
    const { booking_id, rating, comment } = req.body;
    const userId = req.user.id;

    // Validate request body for mandatory fields
    if (!booking_id || !rating) {
        return res.status(400).json({ message: "Booking ID and Rating are required" });
    }

    // Limit ratings to a 1 - 5 point scale
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    try {
        // Verification: Ensure the targeted booking exists and was actually created by this user
        const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [booking_id, userId]);
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ message: "Booking not found or unauthorized" });
        }

        // Integrity check: Prevent duplicate submissions for the same transaction
        const existingFeedback = await pool.query('SELECT * FROM feedback WHERE booking_id = $1', [booking_id]);
        if (existingFeedback.rows.length > 0) {
            return res.status(400).json({ message: "Feedback already submitted for this booking" });
        }

        // Insert new audit record with rating and optional comments
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

/**
 * GET /api/feedback/booking/:bookingId
 * Verification endpoint used by the frontend to toggle the visibility of the feedback modal.
 * @requires authenticateToken
 */
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.id;

        // Query feedback table to check for existing record associated with the user and booking
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

/**
 * POST /api/feedback/inquiry
 * PUBLIC: Processes general contact form submissions from the landing page.
 * Stores inquiries for administrative review.
 */
router.post('/inquiry', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        // Ensure all required fields are present before storage
        if (!name || !email || !message) {
            return res.status(400).json({ message: "Name, Email, and Message are required" });
        }

        // Log the inquiry into the site_inquiries table
        const result = await pool.query(
            'INSERT INTO site_inquiries (name, email, subject, message) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, subject, message]
        );

        res.status(201).json({ 
            message: "Your inquiry has been sent successfully. We will get back to you soon!",
            inquiry: result.rows[0] 
        });
    } catch (err) {
        console.error("Inquiry Error:", err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
