const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const logFile = 'final_seed_verify.log';
const log = (msg) => {
    const time = new Date().toISOString();
    fs.appendFileSync(logFile, `[${time}] ${msg}\n`, 'utf8');
    console.log(msg);
};

fs.writeFileSync(logFile, 'Starting Final Enhanced Seeding\n', 'utf8');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

async function run() {
    try {
        log('Connecting to database...');
        const usersRes = await pool.query('SELECT id, email, role FROM users');
        const providers = usersRes.rows.filter(u => u.role === 'provider');
        const consumers = usersRes.rows.filter(u => u.role === 'consumer');

        if (providers.length === 0 || consumers.length === 0) {
            log('ERROR: Missing users. Run seed_accounts.js first.');
            return;
        }

        log(`Found ${providers.length} providers and ${consumers.length} consumers.`);

        // Listings to add
        const newListings = [
            { type: 'digital_subscriptions', cap: '5 slots', price: 15, loc: 'Global', date: 'Monthly', details: { app: 'Netflix Premium', quality: '4K' }, approved: true },
            { type: 'digital_subscriptions', cap: '3 slots', price: 10, loc: 'Global', date: 'Yearly', details: { app: 'Microsoft Office 365', features: '1TB OneDrive' }, approved: true },
            { type: 'sports', cap: '10 slots', price: 20, loc: 'Downtown Turf', date: 'This Friday 8PM', details: { activity: 'Football', duration: '2 hours' }, approved: true },
            { type: 'travel', cap: '3 seats', price: 50, loc: 'Airport Transfer', date: 'Monday 6AM', details: { vehicle: 'SUV' }, approved: true }
        ];

        for (const data of newListings) {
            log(`Inserting ${data.type} for ${data.details.app || data.details.activity}...`);
            const res = await pool.query(
                `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved, base_cost) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [providers[0].id, data.type, data.cap, data.price, data.loc, data.date, JSON.stringify(data.details), data.approved, data.price * 5]
            );
            const listingId = res.rows[0].id;

            // Book it for the consumer
            log(`Booking listing ${listingId} for consumer ${consumers[0].email}...`);
            await pool.query(
                `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) 
                 VALUES ($1, $2, 'confirmed', 'paid', 1, $3)`,
                [consumers[0].id, listingId, data.price]
            );
        }

        log('Verification:');
        const listCount = await pool.query('SELECT COUNT(*) FROM listings');
        const bookCount = await pool.query('SELECT COUNT(*) FROM bookings');
        log(`Total Listings: ${listCount.rows[0].count}`);
        log(`Total Bookings: ${bookCount.rows[0].count}`);

        log('SUCCESS: Enhanced seeding completed.');
    } catch (err) {
        log('FATAL ERROR: ' + err.message);
        log(err.stack);
    } finally {
        await pool.end();
    }
}

run();
