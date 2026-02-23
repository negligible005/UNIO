const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

const seedEnhanced = async () => {
    console.log("Seeding enhanced data...");
    try {
        const usersRes = await pool.query('SELECT id, email, role FROM users');
        const users = usersRes.rows;
        const providers = users.filter(u => u.role === 'provider');
        const consumers = users.filter(u => u.role === 'consumer');

        if (providers.length < 2 || consumers.length < 2) {
            console.error("Not enough users. Please run rebuild_and_seed.js first.");
            process.exit(1);
        }

        const listings = [
            // Digital Subscriptions
            { type: 'digital_subscriptions', cap: '5 slots', price: 15, loc: 'Global', date: 'Monthly', details: { app: 'Netflix Premium', quality: '4K' }, approved: true },
            { type: 'digital_subscriptions', cap: '3 slots', price: 10, loc: 'Global', date: 'Yearly', details: { app: 'Microsoft Office 365', features: '1TB OneDrive' }, approved: true },
            { type: 'digital_subscriptions', cap: '2 slots', price: 5, loc: 'Global', date: 'Monthly', details: { app: 'Spotify Family' }, approved: true },

            // Custom Splits
            { type: 'sports', cap: '10 slots', price: 20, loc: 'Downtown Turf', date: 'This Friday 8PM', details: { activity: 'Football', duration: '2 hours' }, approved: true },
            { type: 'travel', cap: '3 seats', price: 50, loc: 'Airport Transfer (Point A -> B)', date: 'Monday 6AM', details: { vehicle: 'SUV', luggage: 'Allowed' }, approved: true },
            { type: 'other', cap: '5 slots', price: 25, loc: 'Community Hall', date: 'Next Sunday', details: { activity: 'Yoga Workshop', instructor: 'Jane' }, approved: true },
        ];

        for (let i = 0; i < listings.length; i++) {
            const d = listings[i];
            const p = providers[i % providers.length];
            const res = await pool.query(
                `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved, base_cost) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [p.id, d.type, d.cap, d.price, d.loc, d.date, JSON.stringify(d.details), d.approved, d.price * 5]
            );

            const listingId = res.rows[0].id;

            // Add some bookings for the consumer
            if (i < 3) {
                const c = consumers[0]; // Alice
                await pool.query(
                    `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) 
                     VALUES ($1, $2, 'confirmed', 'paid', 1, $3)`,
                    [c.id, listingId, d.price]
                );
            }
        }

        console.log("Enhanced seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding Error:", err.message);
        process.exit(1);
    }
};

seedEnhanced();
