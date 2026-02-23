const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const logFile = 'diagnostic_trace.log';
fs.writeFileSync(logFile, 'Starting diagnostic trace\n');

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

async function run() {
    log('Attempting to connect to DB: ' + process.env.DB_NAME);
    try {
        const res = await pool.query('SELECT NOW()');
        log('Connection success: ' + res.rows[0].now);

        const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        log('Tables found: ' + tablesRes.rows.map(r => r.table_name).join(', '));

        const counts = {};
        const tables = ['users', 'listings', 'bookings', 'tracking_updates', 'feedback'];
        for (const table of tables) {
            try {
                const countRes = await pool.query(`SELECT COUNT(*) FROM ${table}`);
                counts[table] = countRes.rows[0].count;
                log(`Count for ${table}: ${counts[table]}`);
            } catch (err) {
                log(`Error counting ${table}: ${err.message}`);
            }
        }

        if (counts.listings == 0) {
            log('No listings found. Manual re-seeding required.');
        } else {
            log('Listings found. Displaying first listing:');
            const listRes = await pool.query('SELECT * FROM listings LIMIT 1');
            log(JSON.stringify(listRes.rows[0], null, 2));
        }

    } catch (err) {
        log('FATAL ERROR: ' + err.message);
        log(err.stack);
    } finally {
        await pool.end();
        log('Diagnostic trace finished');
    }
}

run();
