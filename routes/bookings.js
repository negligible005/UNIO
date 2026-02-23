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

// Cancel a Booking (Consumer)
router.delete('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start Transaction

        const { id } = req.params;
        const userId = req.user.id;

        // 1. Fetch booking to verify ownership and get quantity/listing_id
        const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Booking not found or not authorized" });
        }
        const booking = bookingRes.rows[0];

        // 2. Fetch the associated listing to return capacity
        const listingRes = await client.query('SELECT capacity FROM listings WHERE id = $1 FOR UPDATE', [booking.listing_id]);
        if (listingRes.rows.length > 0) {
            const currentCap = parseCapacity(listingRes.rows[0].capacity);
            const returnedQuantity = parseInt(booking.quantity, 10);
            const newCapValue = currentCap.value + returnedQuantity;
            const newCapString = `${newCapValue}${currentCap.unit}`;

            // Restore the capacity on the listing
            await client.query('UPDATE listings SET capacity = $1 WHERE id = $2', [newCapString, booking.listing_id]);
        }

        // 3. Delete the booking
        await client.query('DELETE FROM bookings WHERE id = $1', [id]);

        await client.query('COMMIT'); // Commit Transaction

        res.json({ message: "Booking successfully cancelled" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send("Server Error");
    } finally {
        client.release();
    }
});

// Request Cancellation (Consumer)
router.post('/:id/cancel-request', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const result = await pool.query(
            "UPDATE bookings SET cancellation_status = 'requested', cancellation_reason = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
            [reason, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Booking not found or not authorized" });
        }

        res.json({ message: "Cancellation request sent", booking: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Handle Cancellation Request (Provider/Admin)
router.put('/:id/cancel-handle', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved' or 'denied'
        const userId = req.user.id;
        const userRole = req.user.role;

        await client.query('BEGIN');

        // 1. Fetch booking and check if authorized
        const bookingRes = await client.query(`
            SELECT b.*, l.provider_id 
            FROM bookings b 
            JOIN listings l ON b.listing_id = l.id 
            WHERE b.id = $1
        `, [id]);

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Booking not found" });
        }

        const booking = bookingRes.rows[0];
        if (userRole !== 'admin' && booking.provider_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "Not authorized to handle this cancellation" });
        }

        // 2. Update status
        await client.query("UPDATE bookings SET cancellation_status = $1 WHERE id = $2", [status, id]);

        // 3. If approved, update booking status and restore capacity
        if (status === 'approved') {
            await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id]);

            // Restore capacity
            const listingRes = await client.query('SELECT capacity FROM listings WHERE id = $1 FOR UPDATE', [booking.listing_id]);
            if (listingRes.rows.length > 0) {
                const match = listingRes.rows[0].capacity.match(/^(\d+)([a-zA-Z]+)?$/);
                if (match) {
                    const currentVal = parseInt(match[1]);
                    const unit = match[2] || '';
                    const newVal = currentVal + parseInt(booking.quantity);
                    await client.query('UPDATE listings SET capacity = $1 WHERE id = $2', [`${newVal}${unit}`, booking.listing_id]);
                }
            }
        } else {
            // If denied, maybe reset status to none or keep it as denied
            await client.query("UPDATE bookings SET cancellation_status = 'denied' WHERE id = $1", [id]);
        }

        await client.query('COMMIT');
        res.json({ message: `Cancellation request ${status}` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send("Server Error");
    } finally {
        client.release();
    }
});

// Get Cancellation Requests for Provider's Listings
router.get('/my-listings-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT b.*, u.name as user_name, l.type, l.location
            FROM bookings b
            JOIN listings l ON b.listing_id = l.id
            JOIN users u ON b.user_id = u.id
            WHERE l.provider_id = $1 AND b.cancellation_status = 'requested'
            ORDER BY b.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
