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
            ORDER BY b.created_at DESC
        `);
        res.json(result.rows);
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

module.exports = router;
