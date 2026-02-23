const bcrypt = require('bcrypt');
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

const seedDb = async () => {
    try {
        console.log("🌱 Starting Database Seeding...");

        // 1. Array of Users to create
        const dummyUsers = [
            { name: "John Logistics", email: "john@provider.com", password: "password123", role: "provider" },
            { name: "Global Warehousing", email: "global@provider.com", password: "password123", role: "provider" },
            { name: "Alice Exporter", email: "alice@consumer.com", password: "password123", role: "consumer" },
            { name: "Bob Trader", email: "bob@consumer.com", password: "password123", role: "consumer" },
            { name: "Charlie Import", email: "charlie@consumer.com", password: "password123", role: "consumer" }
        ];

        let createdUsers = [];
        let accountText = "🔐 UNIO DUMMY ACCOUNTS\n=====================\n\n";

        // Generate Users
        for (const u of dummyUsers) {
            const hashed = await bcrypt.hash(u.password, 10);
            const res = await pool.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING *',
                [u.name, u.email, hashed, u.role]
            );

            let userRecord;
            if (res.rows.length > 0) {
                userRecord = res.rows[0];
            } else {
                // Fetch if already existed
                const existing = await pool.query('SELECT * FROM users WHERE email = $1', [u.email]);
                userRecord = existing.rows[0];
            }

            createdUsers.push(userRecord);
            accountText += `Name: ${userRecord.name}\nEmail: ${userRecord.email}\nPassword: ${u.password}\nRole: ${userRecord.role}\n---------------------\n`;
        }

        // Save accounts file
        fs.writeFileSync(path.join(__dirname, 'dummy_accounts.txt'), accountText);
        console.log("✅ Created users and saved credentials to dummy_accounts.txt");

        const providers = createdUsers.filter(u => u.role === 'provider');
        const consumers = createdUsers.filter(u => u.role === 'consumer');

        // 2. Generate Listings
        const listingsData = [
            { provider: providers[0].id, type: "cargo_split", capacity: "1500kg", price: 12.50, loc: "New York -> Chicago", dt: "Next Monday", approved: true },
            { provider: providers[0].id, type: "cold_storage", capacity: "20 pallets", price: 45.00, loc: "New York Port", dt: "Available Now", approved: true },
            { provider: providers[1].id, type: "warehouse", capacity: "5000 sqft", price: 800.00, loc: "Dallas Hub", dt: "Available Next Month", approved: false }, // Pending approval
            { provider: providers[1].id, type: "cargo_split", capacity: "300kg", price: 5.00, loc: "Miami -> Atlanta", dt: "Tomorrow", approved: true }
        ];

        let createdListings = [];
        for (const l of listingsData) {
            const res = await pool.query(
                `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, approved, details) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, '{}') RETURNING *`,
                [l.provider, l.type, l.capacity, l.price, l.loc, l.dt, l.approved]
            );
            createdListings.push(res.rows[0]);
        }
        console.log("✅ Created 4 dummy listings (3 approved, 1 pending)");

        // 3. Generate Bookings (Consumers booking listings)
        // Only book approved listings
        const approvedListings = createdListings.filter(l => l.approved);

        if (approvedListings.length > 0 && consumers.length > 0) {
            const bookingsData = [
                { user: consumers[0].id, listing: approvedListings[0].id, qty: 500, status: 'pending' },
                { user: consumers[1].id, listing: approvedListings[1].id, qty: 2, status: 'confirmed' },
                { user: consumers[2].id, listing: approvedListings[2].id, qty: 100, status: 'confirmed' }
            ];

            for (const b of bookingsData) {
                // Calculate total price based on listing price
                const listing = approvedListings.find(l => l.id === b.listing);
                const totalPrice = b.qty * parseFloat(listing.price_per_unit);

                await pool.query(
                    `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) 
                     VALUES ($1, $2, $3, 'unpaid', $4, $5)`,
                    [b.user, b.listing, b.status, b.qty, totalPrice]
                );
            }
            console.log("✅ Created 3 dummy bookings");

            // 4. Generate Tracking Updates for Maharashtra -> Kerala
            // Let's create a specific listing for this
            const mahaToKeralaRes = await pool.query(
                `INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, approved, details) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, '{}') RETURNING *`,
                [providers[0].id, 'cargo_split', '2000kg', 15.00, 'Maharashtra -> Kerala', 'Available Now', true]
            );
            const mahaToKerala = mahaToKeralaRes.rows[0];

            // Book for consumer[0]
            await pool.query(
                `INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) 
                  VALUES ($1, $2, $3, 'unpaid', $4, $5)`,
                [consumers[0].id, mahaToKerala.id, 'confirmed', 100, 1500.00]
            );

            // Create tracking points
            const trackingPoints = [
                { loc: "Mumbai Central Warehouse", lat: 19.0760, lng: 72.8777, confirmed: true },
                { loc: "Pune Hub", lat: 18.5204, lng: 73.8567, confirmed: true },
                { loc: "Belagavi Transit Point", lat: 15.8497, lng: 74.4977, confirmed: true },
                { loc: "Hubballi Distribution", lat: 15.3647, lng: 75.1240, confirmed: true },
                { loc: "Mangaluru Port Hub", lat: 12.9141, lng: 74.8560, confirmed: false },
                { loc: "Kozhikode Warehouse", lat: 11.2588, lng: 75.7804, confirmed: false },
                { loc: "Kochi Sorting Facility", lat: 9.9312, lng: 76.2673, confirmed: false }
            ];

            for (const point of trackingPoints) {
                await pool.query(
                    `INSERT INTO tracking_updates (listing_id, location_name, lat, lng, is_confirmed) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [mahaToKerala.id, point.loc, point.lat, point.lng, point.confirmed]
                );
            }
            console.log("✅ Created 1 specific Maharashtra -> Kerala listing with 7 tracking updates");
        }

        console.log("\n🎉 Seeding complete!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
};

seedDb();
