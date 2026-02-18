const { pool } = require('./db');

async function testFeedback() {
    try {
        console.log("Testing Feedback Table...");
        // 1. Check if table exists
        const tableCheck = await pool.query("SELECT to_regclass('public.feedback')");
        if (!tableCheck.rows[0].to_regclass) {
            console.error("❌ Feedback table does NOT exist.");
            return;
        }
        console.log("✅ Feedback table exists.");

        // 2. Insert dummy feedback
        // Need a user and booking first.
        const userRes = await pool.query("SELECT id FROM users LIMIT 1");
        const bookingRes = await pool.query("SELECT id FROM bookings LIMIT 1");

        if (userRes.rows.length === 0 || bookingRes.rows.length === 0) {
            console.log("⚠️ Cannot test insertion: No users or bookings found.");
            return;
        }

        const userId = userRes.rows[0].id;
        const bookingId = bookingRes.rows[0].id;

        // Check if feedback already exists for this booking to avoid unique violation if we enforced it (logic in route does)
        const check = await pool.query("SELECT * FROM feedback WHERE booking_id = $1", [bookingId]);
        if (check.rows.length > 0) {
            console.log("ℹ️ Feedback already exists for this booking. Skipping insertion test.");
        } else {
            await pool.query("INSERT INTO feedback (user_id, booking_id, rating, comment) VALUES ($1, $2, 5, 'Test feedback') RETURNING *", [userId, bookingId]);
            console.log("✅ Feedback inserted successfully.");
        }

        // 3. Read feedback
        const rows = await pool.query("SELECT * FROM feedback");
        console.log(`✅ Current Feedback Count: ${rows.rowCount}`);
        console.log(rows.rows);

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        process.exit();
    }
}

testFeedback();
