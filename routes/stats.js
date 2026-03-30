const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * GET /api/stats/global
 * Public endpoint to calculate aggregate platform-wide performance metrics.
 * Computes total transaction volume, estimated community savings, and active split counts.
 */
router.get('/global', async (req, res) => {
    try {
        // 1. Total Earned: Aggregate transaction volume from all confirmed bookings
        const earnedRes = await pool.query(`
            SELECT COALESCE(SUM(total_price), 0) as total_earned
            FROM bookings b
            WHERE b.status = 'confirmed'
        `);
        const totalEarned = parseFloat(earnedRes.rows[0].total_earned || 0);

        // 2. Total Saved: Heuristic calculation of cost reduction through peer splitting
        // Part A: Sharing Revenue - Revenue redistributed back to providers via shared listings
        const sharingRevenueRes = await pool.query(`
            SELECT COALESCE(SUM(b.total_price), 0) as sharing_revenue
            FROM listings l
            JOIN bookings b ON l.id = b.listing_id 
            WHERE b.status = 'confirmed'
        `);
        const sharingRevenue = parseFloat(sharingRevenueRes.rows[0].sharing_revenue || 0);

        // Part B: Consumer Discounts - Estimated savings based on solo vs split pricing
        const discountsRes = await pool.query(`
            SELECT 
                l.capacity, 
                l.price_per_unit, 
                b.total_price as paid_amount,
                b.quantity
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            WHERE b.status = 'confirmed'
        `);
        
        let totalDiscounts = 0;
        discountsRes.rows.forEach(row => {
            const capacity = parseInt(row.capacity) || 1;
            const price = parseFloat(row.price_per_unit);
            const paid = parseFloat(row.paid_amount);

            // Heuristic for saving: Total Full-Capacity Value - Actual Paid Amount
            const totalEstimatedValue = capacity * price;
            totalDiscounts += Math.max(0, totalEstimatedValue - paid);
        });

        // Combined metric representing the financial efficiency of the platform
        const totalSaved = sharingRevenue + totalDiscounts;

        // 3. Active Splits: Total number of administratively approved and live listings
        const activeSplitsRes = await pool.query("SELECT COUNT(*) FROM listings WHERE approved = TRUE");
        const activeSplits = parseInt(activeSplitsRes.rows[0].count);

        res.json({
            amount_earned: totalEarned,
            amount_saved: totalSaved,
            active_splits: activeSplits
        });

    } catch (err) {
        console.error("Error fetching global stats:", err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * GET /api/stats/
 * Retrieves personalized performance stats for a specific user (Savings, Earnings, Activity).
 * @requires authenticateToken
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Provided Savings: Revenue collected by the user from others joining their listings (Cost Offset)
        const providedSavingsQuery = `
            SELECT COALESCE(SUM(b.total_price), 0) as provided_savings
            FROM listings l
            JOIN bookings b ON l.id = b.listing_id 
            WHERE l.provider_id = $1 
              AND b.status = 'confirmed'
        `;
        const providedRes = await pool.query(providedSavingsQuery, [userId]);
        const providedSavings = parseFloat(providedRes.rows[0].provided_savings || 0);

        // 2. Joined Savings: Calculated discounts the user received by splitting instead of solo booking
        const joinedSavingsQuery = `
            SELECT 
                l.details->>'total_cost' as total_cost,
                l.capacity, 
                l.price_per_unit, 
                b.total_price as paid_amount
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            WHERE b.user_id = $1 
              AND b.status = 'confirmed'
              AND (b.payment_status = 'paid' OR CAST(b.total_price AS NUMERIC) = 0 OR l.details->>'payment_enabled' != 'true')
              AND l.type IN ('digital_subscriptions', 'sports', 'travel', 'other')
              AND l.details->>'payment_enabled' = 'true'
        `;
        const joinedRes = await pool.query(joinedSavingsQuery, [userId]);
        
        let joinedSavings = 0;
        joinedRes.rows.forEach(row => {
            const paid = parseFloat(row.paid_amount) || 0;
            // Fallback value is used if a total solo cost isn't explicitly defined in listing details
            const fallbackValue = (parseInt(row.capacity) || 1) * (parseFloat(row.price_per_unit) || 0);
            const totalValue = row.total_cost ? parseFloat(row.total_cost) : fallbackValue;
            const saving = Math.max(0, totalValue - paid);
            joinedSavings += saving;
        });

        // 3. Provider Earnings: Direct income from finalized logistics splits
        const amountEarnedQuery = `
            SELECT COALESCE(SUM(b.total_price), 0) as total_earned
            FROM listings l
            JOIN bookings b ON l.id = b.listing_id 
            WHERE l.provider_id = $1 
              AND b.status = 'confirmed'
              AND l.type IN ('cargo_split', 'cold_storage', 'warehouse')
        `;
        const earnedRes = await pool.query(amountEarnedQuery, [userId]);
        const amountEarned = parseFloat(earnedRes.rows[0].total_earned || 0);

        // 4. Counts of listings created by the user that were approved by admin
        const activeSplitsRes = await pool.query('SELECT COUNT(*) FROM listings WHERE provider_id = $1 AND approved = TRUE', [userId]);

        res.json({
            amount_saved: joinedSavings,
            amount_earned: amountEarned,
            provided_savings: providedSavings,
            joined_savings: joinedSavings,
            active_splits: parseInt(activeSplitsRes.rows[0].count)
        });

    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * GET /api/stats/savings-history
 * Generates time-series data of user savings for front-end charting (last 6 months).
 * @requires authenticateToken
 */
router.get('/savings-history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Identifying individual saving events from joined splits
        const joinedQuery = `
            SELECT 
                l.details->>'app' as item_name,
                l.details->>'activity' as activity_name,
                l.details->>'total_cost' as total_cost,
                l.type,
                l.capacity, 
                l.price_per_unit, 
                b.total_price as paid_amount,
                b.created_at as date
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            WHERE b.user_id = $1 
              AND b.status = 'confirmed'
              AND (b.payment_status = 'paid' OR CAST(b.total_price AS NUMERIC) = 0 OR l.details->>'payment_enabled' != 'true')
              AND l.type IN ('digital_subscriptions', 'sports', 'travel', 'other')
              AND l.details->>'payment_enabled' = 'true'
            ORDER BY b.created_at DESC
        `;
        const joinedRes = await pool.query(joinedQuery, [userId]);
        const joinedHistory = joinedRes.rows.map(row => {
            const paid = parseFloat(row.paid_amount) || 0;
            const fallbackValue = (parseInt(row.capacity) || 1) * (parseFloat(row.price_per_unit) || 0);
            const totalValue = row.total_cost ? parseFloat(row.total_cost) : fallbackValue;
            const saving = Math.max(0, totalValue - paid);
            return {
                item: row.item_name || row.activity_name || row.type.replace(/_/g, ' '),
                type: 'Split Joined',
                amount: saving,
                date: row.date
            };
        });

        // Aggregate and sort the history for display lists
        const allHistory = [...joinedHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Group findings by month to prepare graph data
        const monthlyData = {};
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        // Pre-initialize the last six months with zero values
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const mLabel = monthNames[d.getMonth()];
            monthlyData[mLabel] = 0;
        }

        allHistory.forEach(h => {
            const mIdx = new Date(h.date).getMonth();
            const mLabel = monthNames[mIdx];
            if (monthlyData.hasOwnProperty(mLabel)) {
                monthlyData[mLabel] += h.amount;
            }
        });

        // Convert the object into a structured array for charting libraries
        const graphData = Object.keys(monthlyData).map(m => ({
            month: m,
            amount: monthlyData[m]
        }));

        res.json({
            history: allHistory,
            graphData: graphData
        });

    } catch (err) {
        console.error("Error fetching savings history:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
