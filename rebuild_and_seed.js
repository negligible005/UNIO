const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const logFile = 'rebuild_and_seed.log';
fs.writeFileSync(logFile, 'Starting complete rebuild and seed\n');

const log = (msg) => {
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
    try {
        log('Resetting schema...');
        await pool.query('DROP TABLE IF EXISTS feedback CASCADE');
        await pool.query('DROP TABLE IF EXISTS bookings CASCADE');
        await pool.query('DROP TABLE IF EXISTS listings CASCADE');
        await pool.query('DROP TABLE IF EXISTS tracking_updates CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');

        log('Creating users table...');
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'consumer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        log('Creating listings table...');
        await pool.query(`
            CREATE TABLE listings (
                id SERIAL PRIMARY KEY,
                provider_id INTEGER REFERENCES users(id),
                type VARCHAR(50) NOT NULL,
                capacity VARCHAR(50) NOT NULL,
                price_per_unit DECIMAL(10, 2) NOT NULL,
                base_cost DECIMAL(10, 2) DEFAULT 0.00,
                location TEXT,
                date TEXT,
                details JSONB,
                approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        log('Creating bookings table...');
        await pool.query(`
            CREATE TABLE bookings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                listing_id INTEGER REFERENCES listings(id),
                status VARCHAR(50) DEFAULT 'pending',
                payment_status VARCHAR(50) DEFAULT 'unpaid',
                quantity INTEGER DEFAULT 1,
                total_price DECIMAL(10, 2),
                is_priority BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        log('Creating feedback table...');
        await pool.query(`
            CREATE TABLE feedback (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id),
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        log('Creating tracking table...');
        await pool.query(`
            CREATE TABLE tracking_updates (
                id SERIAL PRIMARY KEY,
                listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
                location_name VARCHAR(255) NOT NULL,
                lat DECIMAL(10, 6) NOT NULL,
                lng DECIMAL(10, 6) NOT NULL,
                is_confirmed BOOLEAN DEFAULT FALSE,
                reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        log('Seeding initial accounts...');
        // We need hashed passwords
        const bcrypt = require('bcrypt');
        const hp = await bcrypt.hash('password123', 10);
        const ha = await bcrypt.hash('root', 10);

        const admin = await pool.query("INSERT INTO users (name, email, password, role) VALUES ('Rachel Admin', 'rachel@gmail.com', $1, 'admin') RETURNING id", [ha]);
        const p1 = await pool.query("INSERT INTO users (name, email, password, role) VALUES ('John Logistics', 'john@provider.com', $1, 'provider') RETURNING id", [hp]);
        const c1 = await pool.query("INSERT INTO users (name, email, password, role) VALUES ('Alice Exporter', 'alice@consumer.com', $1, 'consumer') RETURNING id", [hp]);

        log('Seeding listings...');
        const l1 = await pool.query(
            "INSERT INTO listings (provider_id, type, capacity, price_per_unit, location, date, details, approved) VALUES ($1, 'cargo_split', '1000kg', 50, 'Mumbai -> Delhi', '2026-03-01', '{}', true) RETURNING id",
            [p1.rows[0].id]
        );

        log('Seeding bookings...');
        await pool.query(
            "INSERT INTO bookings (user_id, listing_id, status, payment_status, quantity, total_price) VALUES ($1, $2, 'confirmed', 'paid', 2, 100)",
            [c1.rows[0].id, l1.rows[0].id]
        );

        log('Rebuild and seed successful!');
    } catch (err) {
        log('ERROR: ' + err.message);
        log(err.stack);
    } finally {
        await pool.end();
        log('Finished');
    }
}

run();
