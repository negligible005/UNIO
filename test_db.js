const { pool } = require('./db.js');
const fs = require('fs');

async function test() {
    const listings = await pool.query('SELECT id, provider_id, type, price_per_unit, base_cost FROM listings ORDER BY id DESC LIMIT 5');
    const bookings = await pool.query('SELECT * FROM bookings ORDER BY id DESC LIMIT 5');

    fs.writeFileSync('db_out.json', JSON.stringify({
        listings: listings.rows,
        bookings: bookings.rows
    }, null, 2));
    process.exit(0);
}
test();
