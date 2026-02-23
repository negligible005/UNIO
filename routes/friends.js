const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// Send Friend Request
router.post('/request', authenticateToken, async (req, res) => {
    try {
        const { friendId } = req.body;
        const userId = req.user.id;

        if (userId === friendId) return res.status(400).json({ message: "Cannot friend yourself" });

        const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];

        await pool.query(
            "INSERT INTO friends (user_id1, user_id2, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING",
            [id1, id2]
        );

        // Create notification for the recipient
        await pool.query(
            "INSERT INTO notifications (user_id, type, content) VALUES ($1, 'friend_request', $2)",
            [friendId, `You have a new friend request from user ${userId}`]
        );

        res.json({ message: "Friend request sent" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Accept Friend Request
router.post('/accept', authenticateToken, async (req, res) => {
    try {
        const { requesterId } = req.body;
        const userId = req.user.id;
        const [id1, id2] = userId < requesterId ? [userId, requesterId] : [requesterId, userId];

        const result = await pool.query(
            "UPDATE friends SET status = 'accepted' WHERE user_id1 = $1 AND user_id2 = $2 RETURNING *",
            [id1, id2]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: "Request not found" });

        res.json({ message: "Friend request accepted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get My Friends
router.get('/my-friends', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, COALESCE(AVG(ts.score), 0) as trust_score
            FROM users u
            JOIN friends f ON (u.id = f.user_id1 OR u.id = f.user_id2)
            LEFT JOIN trust_scores ts ON u.id = ts.ratee_id
            WHERE (f.user_id1 = $1 OR f.user_id2 = $1) AND u.id != $1 AND f.status = 'accepted'
            GROUP BY u.id
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get Recommendations (Users I've split with)
router.get('/recommendations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Find users who are not friends yet but shared a listing
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.name, u.email
            FROM users u
            JOIN bookings b1 ON u.id = b1.user_id
            JOIN bookings b2 ON b1.listing_id = b2.listing_id
            WHERE b2.user_id = $1 AND u.id != $1
            AND u.id NOT IN (
                SELECT CASE WHEN user_id1 = $1 THEN user_id2 ELSE user_id1 END
                FROM friends
                WHERE user_id1 = $1 OR user_id2 = $1
            )
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
