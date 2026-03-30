const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * GET /api/splits/item/:itemId
 * Retrieves all currently 'open' split requests for a specific marketplace item.
 * Includes nested member details (names and terms) for each split.
 */
router.get('/item/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const splits = await pool.query(
            `SELECT s.*, u.name as creator_name,
                    (SELECT json_agg(sm.*) FROM (
                        SELECT sm.user_id, sm.terms, u2.name as member_name
                        FROM split_members sm
                        JOIN users u2 ON sm.user_id = u2.id
                        WHERE sm.split_id = s.id
                    ) sm) as members
             FROM split_requests s
             JOIN users u ON s.creator_id = u.id
             WHERE s.item_id = $1 AND s.status = 'open'
             ORDER BY s.created_at DESC`,
            [itemId]
        );
        res.json(splits.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/**
 * POST /api/splits/create
 * Initiates a new digital split request for shared resource buying.
 * Automatically adds the creator as the first member and determines payment requirements.
 * @requires authenticateToken
 */
router.post('/create', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { item_id, total_slots, creator_terms, payment_enabled } = req.body;
        const creator_id = req.user.id;

        // Fetch item details to calculate per-person price and determine mandatory payment flags
        const itemRes = await pool.query(
            'SELECT price, type FROM marketplace_items WHERE id = $1',
            [item_id]
        );
        if (itemRes.rows.length === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const price = parseFloat(itemRes.rows[0].price);
        const itemType = itemRes.rows[0].type;
        const price_per_person = price / total_slots;

        // Determine payment requirement based on item type and creator preference
        let paymentRequired = false;
        const mandatoryTypes = ['cargo', 'cold_storage', 'warehouse', 'digital'];

        if (mandatoryTypes.includes(itemType)) {
            paymentRequired = true;
        } else if (itemType === 'custom' && payment_enabled === true) {
            paymentRequired = true;
        }

        // Start database transaction
        await client.query('BEGIN');

        // Create the primary split request record
        const splitRes = await client.query(
            `INSERT INTO split_requests (item_id, creator_id, total_slots, price_per_person, creator_terms, payment_required)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [item_id, creator_id, total_slots, price_per_person, creator_terms, paymentRequired]
        );
        const splitId = splitRes.rows[0].id;

        // Automatically enroll the creator as the inaugural member of the split
        await client.query(
            `INSERT INTO split_members (split_id, user_id, terms)
             VALUES ($1, $2, $3)`,
            [splitId, creator_id, creator_terms]
        );

        // Commit all changes
        await client.query('COMMIT');
        res.json(splitRes.rows[0]);
    } catch (err) {
        // Rollback on any failure
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send("Server Error");
    } finally {
        // Release client back to the connection pool
        client.release();
    }
});

/**
 * POST /api/splits/join
 * Adds the authenticated user to an existing split.
 * Handles split capacity checking, payment verification, and automatic friendship establishment.
 * @requires authenticateToken
 */
router.post('/join', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { split_id, terms, payment_id } = req.body;
        const user_id = req.user.id;

        await client.query('BEGIN');

        // Check availability and payment requirement with a row lock (FOR UPDATE)
        const splitRes = await client.query(
            'SELECT * FROM split_requests WHERE id = $1 FOR UPDATE',
            [split_id]
        );

        if (splitRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Split not found" });
        }

        const split = splitRes.rows[0];
        // Enforce split lifecycle and capacity constraints
        if (split.status !== 'open') return res.status(400).json({ message: "Split is no longer open" });
        if (split.filled_slots >= split.total_slots) return res.status(400).json({ message: "Split is already full" });

        // Enforce mandatory payment if the split requires it
        if (split.payment_required === true) {
            if (!payment_id) {
                return res.status(400).json({
                    message: "Payment is required to join this split",
                    requiresPayment: true
                });
            }

            // Verify that the provided payment ID is associated with the user and successfully completed
            const paymentRes = await client.query(
                'SELECT * FROM dummy_payments WHERE id = $1 AND user_id = $2 AND status = $3',
                [payment_id, user_id, 'completed']
            );
            if (paymentRes.rows.length === 0) {
                return res.status(400).json({ message: "Payment not completed or invalid" });
            }
        }

        // Add the new member record
        await client.query(
            `INSERT INTO split_members (split_id, user_id, terms)
             VALUES ($1, $2, $3)`,
            [split_id, user_id, terms]
        );

        // Increment the member count and potentially transition split status to 'full'
        const newFilledSlots = split.filled_slots + 1;
        const status = newFilledSlots >= split.total_slots ? 'full' : 'open';

        const updatedSplit = await client.query(
            `UPDATE split_requests SET filled_slots = $1, status = $2 WHERE id = $3 RETURNING *`,
            [newFilledSlots, status, split_id]
        );

        // --- Community Building: Establish a friendship between the member and the split creator ---
        const creator_id = split.creator_id;
        if (creator_id !== user_id) {
            // Sort IDs to maintain a unique relationship constraint pattern in the DB
            const [id1, id2] = user_id < creator_id ? [user_id, creator_id] : [creator_id, user_id];
            await client.query(
                `INSERT INTO friends (user_id1, user_id2, status) 
                 VALUES ($1, $2, 'accepted') 
                 ON CONFLICT (user_id1, user_id2) 
                 DO UPDATE SET status = 'accepted'`,
                [id1, id2]
            );
        }

        await client.query('COMMIT');
        res.json(updatedSplit.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        // Handle unique constraint violations (e.g., user trying to join the same split twice)
        if (err.code === '23505') return res.status(400).json({ message: "You are already a member of this split" });
        res.status(500).send("Server Error");
    } finally {
        client.release();
    }
});

/**
 * GET /api/splits/my-splits
 * Retrieves all splits where the authenticated user is the creator.
 * Includes calculated payment summary stats (completed count and total amount).
 * @requires authenticateToken
 */
router.get('/my-splits', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const splits = await pool.query(
            `SELECT s.*, m.title as item_title, u.name as creator_name,
                    (SELECT COUNT(*) FROM dummy_payments WHERE split_id = s.id AND status = 'completed') as completed_payments,
                    (SELECT SUM(payment_amount) FROM dummy_payments WHERE split_id = s.id AND status = 'completed') as total_payment_amount
             FROM split_requests s
             JOIN marketplace_items m ON s.item_id = m.id
             JOIN users u ON s.creator_id = u.id
             WHERE s.creator_id = $1
             ORDER BY s.created_at DESC`,
            [userId]
        );
        res.json(splits.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/**
 * GET /api/splits/:splitId/payment-history
 * Detailed view for the split creator to monitor payment status of all participants.
 * @requires authenticateToken - Role verification ensured via logic.
 */
router.get('/:splitId/payment-history', authenticateToken, async (req, res) => {
    try {
        const { splitId } = req.params;
        const userId = req.user.id;

        // Verify that the user requesting the history is the original creator
        const splitRes = await pool.query(
            'SELECT creator_id FROM split_requests WHERE id = $1',
            [splitId]
        );

        if (splitRes.rows.length === 0) {
            return res.status(404).json({ message: "Split not found" });
        }

        if (splitRes.rows[0].creator_id !== userId) {
            return res.status(403).json({ message: "Only split creator can view payment history" });
        }

        // Fetch all payment records associated with this split, including payer identity
        const paymentsRes = await pool.query(
            `SELECT dp.*, u.name as user_name, u.email as user_email
             FROM dummy_payments dp
             JOIN users u ON dp.user_id = u.id
             WHERE dp.split_id = $1
             ORDER BY dp.created_at DESC`,
            [splitId]
        );

        // Return the payments and a calculated summary object
        res.json({
            payments: paymentsRes.rows,
            summary: {
                total_count: paymentsRes.rows.length,
                completed_count: paymentsRes.rows.filter(p => p.status === 'completed').length,
                pending_count: paymentsRes.rows.filter(p => p.status === 'pending').length,
                total_amount: paymentsRes.rows
                    .filter(p => p.status === 'completed')
                    .reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0)
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/**
 * GET /api/splits/:id
 * Retrieves the core metadata for a single split by its ID.
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const splitRes = await pool.query(
            `SELECT s.*, u.name as creator_name 
             FROM split_requests s
             JOIN users u ON s.creator_id = u.id
             WHERE s.id = $1`,
            [id]
        );
        
        if (splitRes.rows.length === 0) {
            return res.status(404).json({ message: "Split not found" });
        }
        
        res.json(splitRes.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
