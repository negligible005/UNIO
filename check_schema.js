const { pool } = require('./db');

async function checkSchema() {
    try {
        console.log("Checking listings columns...");
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'listings';
        `);
        console.log(`Found ${res.rowCount} columns.`);
        if (res.rowCount > 0) {
            console.log(JSON.stringify(res.rows, null, 2));
        } else {
            console.log("No columns found (table might not exist).");
        }
    } catch (err) {
        console.error("Error checking schema:", err);
    } finally {
        process.exit();
    }
}

checkSchema();
