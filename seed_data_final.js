const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

const seedMore = async () => {
    console.log("Seeding comprehensive data...");
    try {
        const usersRes = await pool.query('SELECT id, email, role FROM users');
        const users = usersRes.rows;
        const providers = users.filter(u => u.role === 'provider');
        const consumers = users.filter(u => u.role === 'consumer');

        if (providers.length < 2 || consumers.length < 2) {
            console.error("Not enough users. Please run rebuild_and_seed.js first.");
            process.exit(1);
        }

        const data = [
            { type: 'cargo_split', cap: '2000kg', price: 40, loc: 'Delhi -> Bangalore', date: '2026-03-05', approved: true },
            { type: 'cold_storage', cap: '100 units', price: 150, loc: 'Hyderabad', date: 'Immediate', approved: true },
            { type: 'warehouse', cap: '5000 sqft', price: 5, loc: 'Gurgaon', date: '2026-04-01', approved: true },
            { type: 'cargo_split', cap: '500kg', price: 60, loc: 'Pune -> Mumbai', date: '2026-03-02', approved: false },
            { type: 'cold_storage', cap: '5 units', price: 300, loc: 'Chennai', date: '2026-03-10', approved: true },
        ];

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const p = providers[i % providers.length];
            const res = await pool.query(
                `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved, base_cost) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [p.id, d.type, d.cap, d.price, d.loc, d.date, JSON.stringify({ note: 'Sample data' }), d.approved, 100 * (i + 1)]
            );

            const listingId = res.rows[0].id;

            if (d.approved && i < 3) {
                const c = consumers[i % consumers.length];
                const bRes = await pool.query(
                    `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price, is_priority) 
                     VALUES ($1, $2, 'confirmed', 'paid', 2, $3, $4) RETURNING id`,
                    [c.id, listingId, d.price * 2, i % 2 === 0]
                );

                await pool.query(
                    `INSERT INTO feedback (booking_id, user_id, rating, comment) VALUES ($1, $2, 5, 'Great experience!')`,
                    [bRes.rows[0].id, c.id]
                );

                if (d.type === 'cargo_split') {
                    await pool.query(
                        `INSERT INTO tracking_updates (listing_id, location_name, lat, lng, is_confirmed) VALUES ($1, 'Checkpoint ' + $2, 12.34, 56.78, true)`,
                        [listingId, i + 1]
                    );
                }
            }
        }

        console.log("Seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding Error:", err.message);
        process.exit(1);
    }
};

seedMore();
