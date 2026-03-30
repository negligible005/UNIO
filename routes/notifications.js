const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * GET /api/notifications/
 * Retrieves all unread alerts and notifications for the authenticated user.
 * Sorted by most recent to ensure immediate visibility of new events.
 * @requires authenticateToken
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch only records marked as is_read = FALSE
        const result = await pool.query(
            "SELECT * FROM notifications WHERE user_id = $1 AND is_read = FALSE ORDER BY created_at DESC",
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/**
 * PUT /api/notifications/:id/read
 * Marks a specific notification as 'read' to clear it from the user's active inbox.
 * @requires authenticateToken - Individual ownership check included.
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Ensure the notification being updated belongs to the logged-in user
        await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [id, userId]);
        res.json({ message: "Notification marked as read" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
