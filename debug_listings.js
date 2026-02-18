const { pool } = require('./db');

async function debugListings() {
    try {
        console.log("--- Debugging Listings ---");

        // Count listings
        const countRes = await pool.query('SELECT count(*) FROM listings');
        console.log(`Total Listings: ${countRes.rows[0].count}`);

        // Show all listing details
        const res = await pool.query('SELECT id, provider_id, type, approved, created_at FROM listings ORDER BY created_at DESC');
        console.table(res.rows);

        // Check Users to match provider_id
        console.log("\n--- Users ---");
        const userRes = await pool.query('SELECT id, name, role FROM users');
        console.table(userRes.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

debugListings();
