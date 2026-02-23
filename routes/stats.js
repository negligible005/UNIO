const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// GET /api/stats
// Calculates dynamic earnings/savings for the logged in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Find all listings created by this user
        // We calculate Total Revenue = sum of (quantity * price_per_unit) from CONFIRMED/PAID bookings 
        // For simplicity, we'll sum over 'paid' bookings, OR we can just assume all bookings generate revenue.
        // The prompt says: "consumer who created a custom split ... 5 people joined so each person is paying 40 ... he saved 200 - 40". 
        // This implies: Amount Saved = Total Revenue from others joining.
        // Provider: extra earned = Total Revenue - Base Cost (petrol).
        // To be safe, we will calculate Total Bookings Revenue and Total Base Cost.

        const statsQuery = `
            SELECT 
                l.id as listing_id,
                l.base_cost,
                COALESCE(SUM(b.quantity * l.price_per_unit), 0) as total_revenue
            FROM listings l
            LEFT JOIN bookings b ON l.id = b.listing_id 
            WHERE l.provider_id = $1
            GROUP BY l.id, l.base_cost
        `;

        const { rows } = await pool.query(statsQuery, [userId]);

        let totalRevenue = 0;
        let totalBaseCost = 0;

        rows.forEach(row => {
            totalRevenue += parseFloat(row.total_revenue || 0);
            totalBaseCost += parseFloat(row.base_cost || 0);
        });

        // Provider Amount Earned = Total Revenue - Total Base Cost (can be negative if they haven't made back the cost)
        // Consumer Amount Saved = Total Revenue (the amount others paid to cover the base cost)
        const amountEarned = totalRevenue - totalBaseCost;
        const amountSaved = totalRevenue;

        res.json({
            total_revenue: totalRevenue,
            total_base_cost: totalBaseCost,
            amount_earned: amountEarned,
            amount_saved: amountSaved,
            active_splits: rows.length
        });

    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// GET /api/stats/history
// Fetches the provider's chronological earnings history
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // We want all bookings made against any of the user's listings
        const historyQuery = `
            SELECT 
                b.id as booking_id,
                b.created_at as date,
                b.quantity,
                b.total_price as amount,
                l.type as listing_type,
                l.location as listing_location,
                u.name as consumer_name,
                u.email as consumer_email
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            JOIN users u ON b.user_id = u.id
            WHERE l.provider_id = $1 AND b.status = 'confirmed'
            ORDER BY b.created_at DESC
            LIMIT 50
        `;

        const { rows } = await pool.query(historyQuery, [userId]);

        res.json(rows);

    } catch (err) {
        console.error("Error fetching history:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
