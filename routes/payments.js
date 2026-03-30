const express = require('express');
const router = express.Router();
const os = require('os');
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * generateConfirmationId: Utility to create a unique alphanumeric identifier for every transaction.
 * @returns {string} e.g. "PAY-L3K2...-M9N1..."
 */
const generateConfirmationId = () => {
    // Generate a Base36 representation of the current system time
    const timestamp = Date.now().toString(36).toUpperCase();
    // Generate a random string fragment for added collision resistance
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PAY-${timestamp}-${random}`;
};

const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
};

// Generate dummy QR code data (URL that can be scanned and accessed)
const generateQRCodeData = (paymentId, confirmationId) => {
    const hostIp = getLocalIpAddress();
    const port = process.env.PORT || 3000;
    // QR code contains a full HTTP URL with local IP so phones can scan it
    return `http://${hostIp}:${port}/api/payments/scan/${paymentId}/${confirmationId}`;
};

/**
 * POST /api/payments/initiate
 * Initializes a new payment record and generates a unique QR code for the transaction.
 * @requires authenticateToken
 */
router.post('/initiate', authenticateToken, async (req, res) => {
    try {
        const { split_id, booking_id, item_id, amount, method } = req.body;
        const user_id = req.user.id;

        // Validate input
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid payment amount" });
        }

        const confirmationId = generateConfirmationId();

        // We'll generate the QR code URL after inserting to get the payment ID
        let qrCodeData = null;

        // Insert payment record
        const paymentRes = await pool.query(
            `INSERT INTO dummy_payments (
        split_id, booking_id, item_id, user_id, payment_amount, 
        payment_method, confirmation_id, qr_code_data, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
            [split_id || null, booking_id || null, item_id || null, user_id, amount, method || 'qr', confirmationId, '', 'pending']
        );

        const payment = paymentRes.rows[0];

        // Generate QR code URL with payment ID
        qrCodeData = generateQRCodeData(payment.id, confirmationId);

        // Update the payment record with the correct QR code URL
        await pool.query(
            'UPDATE dummy_payments SET qr_code_data = $1 WHERE id = $2',
            [qrCodeData, payment.id]
        );

        // Log payment initiation
        await pool.query(
            `INSERT INTO payment_history (payment_id, action, details, actor_id)
       VALUES ($1, $2, $3, $4)`,
            [payment.id, 'initiated', JSON.stringify({ method, amount }), user_id]
        );

        res.json({
            success: true,
            paymentId: payment.id,
            confirmationId: payment.confirmation_id,
            qrCodeData: qrCodeData, // send the URL we just generated
            amount: payment.payment_amount,
            message: "Payment QR code generated. Scan to confirm."
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Error initiating payment" });
    }
});

// Get all payments for the logged-in user
router.get('/user/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT 
                dp.*,
                COALESCE(l.type, mi.type) as item_title
            FROM dummy_payments dp
            LEFT JOIN bookings b ON dp.booking_id = b.id
            LEFT JOIN listings l ON b.listing_id = l.id
            LEFT JOIN split_requests sr ON dp.split_id = sr.id
            LEFT JOIN marketplace_items mi ON sr.item_id = mi.id
            WHERE dp.user_id = $1
            ORDER BY dp.created_at DESC
        `, [userId]);
        res.json({ payments: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * POST /api/payments/confirm
 * Finalizes a payment after the user confirms completion of the transfer.
 * Updates associated bookings or split statuses to 'paid'/'completed'.
 * @requires authenticateToken
 */
router.post('/confirm', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { paymentId, confirmationId } = req.body;
        const user_id = req.user.id;

        await client.query('BEGIN');

        // Get payment record
        const paymentRes = await client.query(
            'SELECT * FROM dummy_payments WHERE id = $1 FOR UPDATE',
            [paymentId]
        );

        if (paymentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Payment not found" });
        }

        const payment = paymentRes.rows[0];

        // Verify confirmation ID matches
        if (payment.confirmation_id !== confirmationId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Invalid confirmation ID" });
        }

        // Verify user is the one who initiated payment
        if (payment.user_id !== user_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "Unauthorized payment confirmation" });
        }

        if (payment.status === 'completed') {
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                payment: payment,
                message: "Payment successfully processed via another device"
            });
        }

        if (payment.status !== 'scanned') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Please scan the QR code with your phone first before confirming" });
        }

        // Update payment status to completed
        const updatedPaymentRes = await client.query(
            `UPDATE dummy_payments 
       SET status = $1, confirmed_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
            ['completed', paymentId]
        );

        // Log payment confirmation
        await client.query(
            `INSERT INTO payment_history (payment_id, action, details, actor_id)
       VALUES ($1, $2, $3, $4)`,
            [paymentId, 'confirmed', JSON.stringify({ confirmationId }), user_id]
        );

        // Update booking payment status if booking_id exists
        if (payment.booking_id) {
            await client.query(
                'UPDATE bookings SET payment_status = $1 WHERE id = $2',
                ['paid', payment.booking_id]
            );
        }

        // Send notifications to admin and split creator if applicable
        if (payment.split_id) {
            const splitRes = await client.query(
                `SELECT sr.creator_id, mi.title as item_title 
                 FROM split_requests sr
                 JOIN marketplace_items mi ON sr.item_id = mi.id
                 WHERE sr.id = $1`,
                [payment.split_id]
            );

            if (splitRes.rows.length > 0) {
                const { creator_id, item_title } = splitRes.rows[0];
                const payerRes = await client.query('SELECT name FROM users WHERE id = $1', [user_id]);
                const payer_name = payerRes.rows[0]?.name || 'Unknown User';

                // Notify split creator
                await client.query(
                    `INSERT INTO notifications (user_id, type, content)
                     VALUES ($1, $2, $3)`,
                    [creator_id, 'payment_received', `Payment of ₹${payment.payment_amount} received from ${payer_name} for split: ${item_title}. Payment ID: ${paymentId}, Confirmation ID: ${confirmationId}`]
                );

                // Notify admin
                const adminRes = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
                if (adminRes.rows.length > 0) {
                    await client.query(
                        `INSERT INTO notifications (user_id, type, content)
                         VALUES ($1, $2, $3)`,
                        [adminRes.rows[0].id, 'payment_alert', `Split payment confirmed: ${payer_name} paid ₹${payment.payment_amount} for ${item_title}. Payment ID: ${paymentId}, ID: ${confirmationId}`]
                    );
                }
            }
        } else if (payment.booking_id) {
            // For cargo/logistics bookings
            const bookingRes = await client.query(
                `SELECT b.id, l.type || ' at ' || l.location as title, l.provider_id 
                 FROM bookings b
                 JOIN listings l ON b.listing_id = l.id
                 WHERE b.id = $1`,
                [payment.booking_id]
            );

            if (bookingRes.rows.length > 0) {
                const { title, provider_id } = bookingRes.rows[0];
                const payerRes = await client.query('SELECT name FROM users WHERE id = $1', [user_id]);
                const payer_name = payerRes.rows[0]?.name || 'Unknown User';

                // Notify provider
                await client.query(
                    `INSERT INTO notifications (user_id, type, content)
                     VALUES ($1, $2, $3)`,
                    [provider_id, 'booking_payment', `Payment received for booking of ${title}. Amount: ₹${payment.payment_amount}. Payment ID: ${paymentId}, Confirmation ID: ${confirmationId}`]
                );

                // Notify admin
                const adminRes = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
                if (adminRes.rows.length > 0) {
                    await client.query(
                        `INSERT INTO notifications (user_id, type, content)
                         VALUES ($1, $2, $3)`,
                        [adminRes.rows[0].id, 'payment_alert', `Cargo booking payment: ${payer_name} paid ₹${payment.payment_amount} for ${title}. Payment ID: ${paymentId}, ID: ${confirmationId}`]
                    );
                }
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            payment: updatedPaymentRes.rows[0],
            message: "Payment confirmed successfully!"
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).json({ message: "Error confirming payment" });
    } finally {
        client.release();
    }
});

// Poll payment status (for frontend to detect QR scan)
router.get('/status/:paymentId', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const result = await pool.query(
            'SELECT id, status, confirmation_id FROM dummy_payments WHERE id = $1 AND user_id = $2',
            [paymentId, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json({ status: result.rows[0].status });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/payments/scan/:paymentId/:confirmationId
 * Public endpoint accessed when a phone scans the transaction QR code.
 * Marks the payment as 'scanned' in the database to enable the desktop confirmation button.
 */
router.get('/scan/:paymentId/:confirmationId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { paymentId, confirmationId } = req.params;

        await client.query('BEGIN');

        // Get payment record
        const paymentRes = await client.query(
            'SELECT * FROM dummy_payments WHERE id = $1 FOR UPDATE',
            [paymentId]
        );

        if (paymentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Payment - Not Found</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-red-50 dark:bg-red-900/20">
            <div class="flex items-center justify-center min-h-screen">
              <div class="text-center">
                <h1 class="text-3xl font-bold text-red-600">❌ Payment Not Found</h1>
                <p class="text-red-600 mt-2">This payment link is invalid or has expired.</p>
              </div>
            </div>
          </body>
        </html>
      `);
        }

        const payment = paymentRes.rows[0];

        // Verify confirmation ID matches
        if (payment.confirmation_id !== confirmationId) {
            await client.query('ROLLBACK');
            return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Payment - Invalid</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-red-50 dark:bg-red-900/20">
            <div class="flex items-center justify-center min-h-screen">
              <div class="text-center">
                <h1 class="text-3xl font-bold text-red-600">❌ Invalid Confirmation</h1>
                <p class="text-red-600 mt-2">The confirmation ID doesn't match. Please try again.</p>
              </div>
            </div>
          </body>
        </html>
      `);
        }

        if (payment.status === 'completed') {
            await client.query('ROLLBACK');
            return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Payment - Already Confirmed</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-amber-50 dark:bg-amber-900/20">
            <div class="flex items-center justify-center min-h-screen">
              <div class="text-center">
                <h1 class="text-3xl font-bold text-amber-600">⏳ Already Confirmed</h1>
                <p class="text-amber-600 mt-2">This payment has already been confirmed. No action needed.</p>
              </div>
            </div>
          </body>
        </html>
      `);
        }

        // Mark payment as scanned (not completed yet - user must confirm on desktop)
        const updatedPaymentRes = await client.query(
            'UPDATE dummy_payments SET status = $1 WHERE id = $2 RETURNING *',
            ['scanned', paymentId]
        );

        // Log the scan confirmation
        await client.query(
            `INSERT INTO payment_history (payment_id, action, details, actor_id)
       VALUES ($1, $2, $3, $4)`,
            [paymentId, 'qr_scanned', JSON.stringify({ ip: req.ip, userAgent: req.get('user-agent') }), payment.user_id]
        );

        // Send notifications (same as manual confirm)
        if (payment.split_id) {
            const splitRes = await client.query(
                `SELECT creator_id FROM split_requests WHERE id = $1`,
                [payment.split_id]
            );

            if (splitRes.rows.length > 0) {
                const creatorId = splitRes.rows[0].creator_id;

                // Notify provider
                const payerRes = await client.query(
                    'SELECT name, email FROM users WHERE id = $1',
                    [payment.user_id]
                );
                const payerName = payerRes.rows[0]?.name || 'User';

                if (creatorId !== payment.user_id) {
                    await client.query(
                        `INSERT INTO notifications (user_id, type, content)
             VALUES ($1, $2, $3)`,
                        [
                            creatorId,
                            'payment_confirmation',
                            `Payment confirmed via QR scan: ${payerName} paid ₹${payment.payment_amount}. Payment ID: ${paymentId}, Confirmation ID: ${confirmationId}`
                        ]
                    );
                }

                // Notify admin
                const adminRes = await client.query(
                    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
                );

                if (adminRes.rows.length > 0) {
                    await client.query(
                        `INSERT INTO notifications (user_id, type, content)
             VALUES ($1, $2, $3)`,
                        [
                            adminRes.rows[0].id,
                            'payment_confirmation',
                            `Payment confirmed via QR scan: ${payerName} paid ₹${payment.payment_amount}. Payment ID: ${paymentId}, Confirmation ID: ${confirmationId}`
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');

        // Return success page
        return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>QR Scanned Successfully</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <div class="flex items-center justify-center min-h-screen">
            <div class="text-center max-w-md px-6">
              <div class="text-6xl mb-4 animate-bounce">✅</div>
              <h1 class="text-4xl font-bold text-emerald-600 mb-2">QR Scanned!</h1>
              <p class="text-emerald-600/80 text-lg mb-6">Now go back to your desktop and click "I've Completed Payment" to finish.</p>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 mb-6 border border-emerald-200 dark:border-emerald-800">
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">Amount</p>
                <p class="font-mono font-bold text-emerald-600">₹${payment.payment_amount}</p>
              </div>
              <p class="text-sm text-slate-500">You can close this tab now.</p>
            </div>
          </div>
        </body>
      </html>
    `);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Payment Error</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-red-50 dark:bg-red-900/20">
          <div class="flex items-center justify-center min-h-screen">
            <div class="text-center">
              <h1 class="text-3xl font-bold text-red-600">❌ Error Processing Payment</h1>
              <p class="text-red-600 mt-2">Please try again or contact support.</p>
            </div>
          </div>
        </body>
      </html>
    `);
    } finally {
        client.release();
    }
});

// Get payment details
router.get('/:paymentId', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const user_id = req.user.id;

        const paymentRes = await pool.query(
            `SELECT 
        dp.*,
        u.name as user_name,
        u.email as user_email,
        (SELECT name FROM users WHERE id = (SELECT creator_id FROM split_requests WHERE id = dp.split_id)) as split_creator_name
       FROM dummy_payments dp
       JOIN users u ON dp.user_id = u.id
       WHERE dp.id = $1`,
            [paymentId]
        );

        if (paymentRes.rows.length === 0) {
            return res.status(404).json({ message: "Payment not found" });
        }

        const payment = paymentRes.rows[0];

        // Check if user has access to this payment
        if (payment.user_id !== user_id && payment.split_id) {
            // Check if user is split creator (admin/provider)
            const splitRes = await pool.query(
                'SELECT creator_id FROM split_requests WHERE id = $1',
                [payment.split_id]
            );
            if (splitRes.rows.length === 0 || splitRes.rows[0].creator_id !== user_id) {
                return res.status(403).json({ message: "Access denied" });
            }
        }

        // Get payment history
        const historyRes = await pool.query(
            `SELECT ph.*, u.name as actor_name
       FROM payment_history ph
       LEFT JOIN users u ON ph.actor_id = u.id
       WHERE ph.payment_id = $1
       ORDER BY ph.created_at DESC`,
            [paymentId]
        );

        res.json({
            payment,
            history: historyRes.rows
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Error fetching payment details" });
    }
});

// Get all payments for a split (for creator/admin to view)
router.get('/split/:splitId/all', authenticateToken, async (req, res) => {
    try {
        const { splitId } = req.params;
        const user_id = req.user.id;

        // Verify user is split creator
        const splitRes = await pool.query(
            'SELECT creator_id FROM split_requests WHERE id = $1',
            [splitId]
        );

        if (splitRes.rows.length === 0) {
            return res.status(404).json({ message: "Split not found" });
        }

        if (splitRes.rows[0].creator_id !== user_id) {
            return res.status(403).json({ message: "Only split creator can view all payments" });
        }

        const paymentsRes = await pool.query(
            `SELECT 
        dp.*,
        u.name as user_name,
        u.email as user_email
       FROM dummy_payments dp
       JOIN users u ON dp.user_id = u.id
       WHERE dp.split_id = $1
       ORDER BY dp.created_at DESC`,
            [splitId]
        );

        res.json({
            payments: paymentsRes.rows,
            total_count: paymentsRes.rows.length,
            completed_count: paymentsRes.rows.filter(p => p.status === 'completed').length
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Error fetching payments" });
    }
});

// Get all payments for current user
router.get('/user/history', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        const paymentsRes = await pool.query(
            `SELECT 
        dp.*,
        sr.id as split_id,
        (SELECT title FROM marketplace_items WHERE id = sr.item_id) as item_title
       FROM dummy_payments dp
       LEFT JOIN split_requests sr ON dp.split_id = sr.id
       WHERE dp.user_id = $1
       ORDER BY dp.created_at DESC`,
            [user_id]
        );

        res.json({
            payments: paymentsRes.rows,
            total_count: paymentsRes.rows.length
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Error fetching payment history" });
    }
});

// Get payment statistics (for admin dashboard)
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        // Check if user is admin
        const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0 || userRes.rows[0].role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }

        const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_payments,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_payments,
        SUM(CASE WHEN status = 'completed' THEN payment_amount ELSE 0 END) as total_amount_processed,
        COUNT(DISTINCT user_id) as unique_users
      FROM dummy_payments
    `);

        res.json(statsRes.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Error fetching payment stats" });
    }
});

module.exports = router;
