const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

const seed = async () => {
    console.log("Seeding started...");
    try {
        const usersRes = await pool.query('SELECT id, email, role FROM users');
        const users = usersRes.rows;
        const providers = users.filter(u => u.role === 'provider');
        const consumers = users.filter(u => u.role === 'consumer');

        if (providers.length === 0 || consumers.length === 0) {
            console.error("No users found. Run seed_accounts.js first.");
            process.exit(1);
        }

        console.log("Inserting listings...");
        const listing = await pool.query(
            `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved, base_cost) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [providers[0].id, 'cargo_split', '500kg', 100, 'Mumbai -> Delhi', '2026-03-01', JSON.stringify({}), true, 50]
        );
        const listingId = listing.rows[0].id;

        await pool.query(
            `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved, base_cost) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [providers[1].id, 'cold_storage', '10 units', 200, 'Bangalore', 'Available Now', JSON.stringify({}), true, 150]
        );

        console.log("Inserting bookings...");
        const booking = await pool.query(
            `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price, is_priority) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [consumers[0].id, listingId, 'confirmed', 'paid', 2, 200, false]
        );
        const bookingId = booking.rows[0].id;

        console.log("Inserting feedback...");
        await pool.query(
            `INSERT INTO feedback (booking_id, user_id, rating, comment) 
             VALUES ($1, $2, $3, $4)`,
            [bookingId, consumers[0].id, 5, 'Perfect logistics solution!']
        );

        console.log("Inserting tracking...");
        await pool.query(
            `INSERT INTO tracking_updates (listing_id, location_name, lat, lng, is_confirmed) 
             VALUES ($1, $2, $3, $4, $5)`,
            [listingId, 'Mumbai Port', 18.9218, 72.8347, true]
        );

        console.log("Seeding finished successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Error during seeding:", err.message);
        process.exit(1);
    }
};

seed();
