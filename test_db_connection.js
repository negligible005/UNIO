const { pool } = require('./db');

async function testConnection() {
    try {
        console.log("Testing Database Connection...");
        const res = await pool.query('SELECT NOW()');
        console.log("✅ Database Connected at:", res.rows[0].now);

        console.log("\nChecking Schema...");

        // Check Listings Table Columns
        const columnsRes = await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_name = 'listings';
        `);

        console.log("Listings Table Columns:");
        console.table(columnsRes.rows.map(r => ({ name: r.column_name, type: r.data_type, default: r.column_default })));

        // Check for 'approved' column explicitly
        const approvedCol = columnsRes.rows.find(r => r.column_name === 'approved');
        if (approvedCol) {
            console.log("✅ 'approved' column exists in listings table.");
        } else {
            console.error("❌ 'approved' column MISSING in listings table.");
        }

        // Count rows
        const listingsCount = await pool.query('SELECT count(*) FROM listings');
        console.log(`\nTotal Listings: ${listingsCount.rows[0].count}`);

    } catch (err) {
        console.error("❌ Database Connection Failed:", err);
    } finally {
        process.exit();
    }
}

testConnection();
