const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/admin');

// Middleware to ensure all routes here require admin access
router.use(authenticateToken, isAdmin);

// GET /api/admin/listings/pending - Fetch all pending listings
router.get('/listings/pending', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM listings WHERE approved = FALSE ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// PUT /api/admin/listings/:id/approve - Approve a listing
router.put('/listings/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE listings SET approved = TRUE WHERE id = $1', [id]);
        res.json({ message: "Listing approved successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// DELETE /api/admin/listings/:id/reject - Reject (Delete) a listing
router.delete('/listings/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        // Optionally we could set status='rejected' but deletion is cleaner for now
        await pool.query('DELETE FROM listings WHERE id = $1', [id]);
        res.json({ message: "Listing rejected and removed" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// GET /api/admin/bookings - Fetch all bookings with details
router.get('/bookings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, u.name as user_name, u.email as user_email, l.type as listing_type 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN listings l ON b.listing_id = l.id
            ORDER BY b.is_priority DESC, b.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// PUT /api/admin/bookings/:id/prioritize - Toggle booking priority
router.put('/bookings/:id/prioritize', async (req, res) => {
    try {
        const { id } = req.params;
        // Fetch current priority
        const currentRes = await pool.query('SELECT is_priority FROM bookings WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return res.status(404).json({ message: "Booking not found" });

        const newPriority = !currentRes.rows[0].is_priority;
        await pool.query('UPDATE bookings SET is_priority = $1 WHERE id = $2', [newPriority, id]);

        res.json({ message: `Booking priority updated to ${newPriority}`, is_priority: newPriority });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// PUT /api/admin/bookings/:id/status - Update booking status
router.put('/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // e.g., 'confirmed', 'cancelled'

        await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', [status, id]);
        res.json({ message: `Booking status updated to ${status}` });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// GET /api/admin/tracking/pending - Fetch unconfirmed tracking updates
router.get('/tracking/pending', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, l.type as listing_type, l.location as route_details, u.name as provider_name
            FROM tracking_updates t
            JOIN listings l ON t.listing_id = l.id
            JOIN users u ON l.provider_id = u.id
            WHERE t.is_confirmed = FALSE
            ORDER BY t.reported_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// PUT /api/admin/tracking/:id/confirm - Confirm a tracking update
router.put('/tracking/:id/confirm', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE tracking_updates SET is_confirmed = TRUE WHERE id = $1', [id]);
        res.json({ message: "Tracking update confirmed" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// DELETE /api/admin/tracking/:id/reject - Reject (Delete) a tracking update
router.delete('/tracking/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tracking_updates WHERE id = $1', [id]);
        res.json({ message: "Tracking update rejected and removed" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
