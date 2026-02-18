const { pool } = require('./db');

const updateSchema = async () => {
    try {
        console.log("Updating Database Schema for Admin Dashboard...");

        // 1. Add 'role' to users table
        // We use a DO block or just try/catch to avoid error if column exists, 
        // but simpler here is to just run ALTER and catch error if it exists.
        // Or check information_schema. 
        // Let's just try to add it.
        try {
            await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'consumer'`);
            console.log("✅ Added 'role' column to users table.");
        } catch (e) {
            if (e.code === '42701') { // duplicate_column
                console.log("ℹ️ 'role' column already exists in users table.");
            } else {
                throw e;
            }
        }

        // 2. Add 'approved' to listings table
        try {
            await pool.query(`ALTER TABLE listings ADD COLUMN approved BOOLEAN DEFAULT FALSE`);
            // Update existing listings to be approved so we don't break current view
            await pool.query(`UPDATE listings SET approved = TRUE WHERE approved IS FALSE`);
            // Note: After this script runs once, all current are approved. 
            // New listings created via API will use Default FALSE (or logic in route).
            console.log("✅ Added 'approved' column to listings table and approved existing listings.");
        } catch (e) {
            if (e.code === '42701') {
                console.log("ℹ️ 'approved' column already exists in listings table.");
            } else {
                throw e;
            }
        }

        console.log("Schema update complete.");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error updating schema:", error);
        process.exit(1);
    }
};

updateSchema();
