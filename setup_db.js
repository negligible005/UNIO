const { pool } = require('./db');

const setupDb = async () => {
  try {
    console.log("Resetting database schema...");

    // Drop existing tables to ensure clean state for new schema
    await pool.query('DROP TABLE IF EXISTS feedback CASCADE');
    await pool.query('DROP TABLE IF EXISTS bookings CASCADE');
    await pool.query('DROP TABLE IF EXISTS listings CASCADE');

    // Users Table (Keep existing if possible, but for now we might keep it)
    // We didn't drop users, so that's fine.

    // Listings Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL, -- 'cargo_split', 'cold_storage', 'warehouse'
        capacity VARCHAR(50) NOT NULL, -- e.g. "500kg", "12 slots"
        price_per_unit DECIMAL(10, 2) NOT NULL,
        base_cost DECIMAL(10, 2) DEFAULT 0.00,
        location TEXT, -- e.g. "Bangalore -> Cochin" or "Ernakulam North"
        date TEXT, -- e.g. "Jan 20th" or "Available Now"
        details JSONB, -- Flexible additional info
        approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Bookings Table (New Schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        listing_id INTEGER REFERENCES listings(id),
        status VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(50) DEFAULT 'unpaid', -- 'unpaid', 'paid'
        quantity INTEGER DEFAULT 1,
        total_price DECIMAL(10, 2),
        is_priority BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Feedback Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tracking Updates Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_updates (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
        location_name VARCHAR(255) NOT NULL,
        lat DECIMAL(10, 6) NOT NULL,
        lng DECIMAL(10, 6) NOT NULL,
        is_confirmed BOOLEAN DEFAULT FALSE,
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Database schema updated successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
  }
};

setupDb();
