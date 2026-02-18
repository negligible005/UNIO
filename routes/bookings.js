const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// Helper to parse capacity string (e.g. "500kg" -> { value: 500, unit: "kg" })
function parseCapacity(capString) {
    const match = capString.match(/^(\d+)(\s*[a-zA-Z]+)?$/) || capString.match(/^(\d+)/);
    if (!match) return { value: 0, unit: '' };
    return {
        value: parseInt(match[1], 10),
        unit: match[2] || ''
    };
}

// Create Booking (Transactional)
router.post('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start Transaction

        const { listing_id, quantity = 1 } = req.body;
        const userId = req.user.id;

        // 1. Fetch Listing
        const listingRes = await client.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [listing_id]);
        if (listingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Listing not found" });
        }
        const listing = listingRes.rows[0];

        // 2. Check Capacity
        const currentCap = parseCapacity(listing.capacity);
        if (currentCap.value < quantity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Insufficient capacity" });
        }

        // 3. Deduct Capacity
        const newCapValue = currentCap.value - quantity;
        const newCapString = `${newCapValue}${currentCap.unit}`;

        // If capacity hits 0, maybe mark as inactive? For now just update text.
        await client.query('UPDATE listings SET capacity = $1 WHERE id = $2', [newCapString, listing_id]);

        // 4. Calculate Price
        const totalPrice = quantity * parseFloat(listing.price_per_unit);

        // 5. Create Booking
        const newBooking = await client.query(
            `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) 
             VALUES ($1, $2, 'confirmed', 'unpaid', $3, $4) RETURNING *`,
            [userId, listing_id, quantity, totalPrice]
        );

        await client.query('COMMIT'); // Commit Transaction

        res.json({
            message: "Booking successful",
            booking: newBooking.rows[0],
            remaining_capacity: newCapString
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send("Server Error");
    } finally {
        client.release();
    }
});

// Get User's Bookings (with Listing details)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const bookings = await pool.query(`
            SELECT b.*, l.type, l.location, l.date, l.provider_id 
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            WHERE b.user_id = $1 
            ORDER BY b.created_at DESC
        `, [userId]);
        res.json(bookings.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
