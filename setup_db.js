// Import the database connection pool from the db.js module
const { pool } = require('./db');

/**
 * Asynchronous function to reset and re-initialize the database schema.
 * WARNING: This script drops existing core tables and should only be used in development.
 */
const setupDb = async () => {
  try {
    // Log the start of the database reset process
    console.log("Resetting database schema...");

    // Execute SQL command to safely remove the feedback table if it exists
    // CASCADE ensures that dependent objects are also removed
    await pool.query('DROP TABLE IF EXISTS feedback CASCADE');
    // Execute SQL command to safely remove the bookings table if it exists
    await pool.query('DROP TABLE IF EXISTS bookings CASCADE');
    // Execute SQL command to safely remove the listings table if it exists
    await pool.query('DROP TABLE IF EXISTS listings CASCADE');

    /* --- RECREATING THE CORE SCHEMA --- */

    /**
     * Re-create the Listings Table
     * This table stores all shared resources (trucks, warehouses, digital splits).
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        -- Primary key with auto-incrementing unique integer ID
        id SERIAL PRIMARY KEY,
        -- Foreign key linking the listing to a specific user in the 'users' table
        provider_id INTEGER REFERENCES users(id),
        -- The category of the service (e.g., 'cargo_split', 'cold_storage')
        type VARCHAR(50) NOT NULL,
        -- The physical or logical capacity offered (e.g., "500kg", "12 slots")
        capacity VARCHAR(50) NOT NULL,
        -- The monetary cost per single unit of the capacity defined above
        price_per_unit DECIMAL(10, 2) NOT NULL,
        -- The base operational cost added to any booking of this listing
        base_cost DECIMAL(10, 2) DEFAULT 0.00,
        -- Descriptive location (e.g., specific route or warehouse address)
        location TEXT,
        -- Human-readable availability timeframe
        date TEXT,
        -- Flexible JSON container for additional service-specific metadata
        details JSONB,
        -- Administrative approval flag (default False until moderated)
        approved BOOLEAN DEFAULT FALSE,
        -- Automatic timestamp of the listing creation
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /**
     * Re-create the Bookings Table
     * This table tracks all reservations made by consumers against available listings.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        -- Primary key for unique booking identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the consumer user who made the reservation
        user_id INTEGER REFERENCES users(id),
        -- Foreign key referencing the specific listing that was booked
        listing_id INTEGER REFERENCES listings(id),
        -- Current logical state of the reservation (e.g., 'pending', 'confirmed')
        status VARCHAR(50) DEFAULT 'pending',
        -- Tracks the financial state of the reservation ('unpaid' or 'paid')
        payment_status VARCHAR(50) DEFAULT 'unpaid',
        -- The number of units of capacity reserved by this user
        quantity INTEGER DEFAULT 1,
        -- The total calculated price for this specific booking instance
        total_price DECIMAL(10, 2),
        -- Flag to indicate if the user requested priority processing (SLA)
        is_priority BOOLEAN DEFAULT FALSE,
        -- Automatic timestamp of when the booking was initiated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /**
     * Re-create the Feedback Table
     * Stores user-submitted ratings and comments for completed bookings.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        -- Primary key for unique feedback entry identification
        id SERIAL PRIMARY KEY,
        -- Foreign key to the booking; ON DELETE CASCADE removes feedback if booking is deleted
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        -- Foreign key referencing the user who authored the feedback
        user_id INTEGER REFERENCES users(id),
        -- Numerical rating restricted between 1 and 5 stars
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        -- Optional textual review provided by the user
        comment TEXT,
        -- Automatic timestamp of when the feedback was submitted
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /**
     * Re-create the Tracking Updates Table
     * Provides a log of real-time movements or status changes for active logistics.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_updates (
        -- Primary key for unique update log identification
        id SERIAL PRIMARY KEY,
        -- Foreign key to the listing; removes logs if listing is deleted
        listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
        -- Human-readable name of the current location or checkpoint
        location_name VARCHAR(255) NOT NULL,
        -- Geographical latitude coordinate for map visualization
        lat DECIMAL(10, 6) NOT NULL,
        -- Geographical longitude coordinate for map visualization
        lng DECIMAL(10, 6) NOT NULL,
        -- Verification flag (set to True when admin confirms the location)
        is_confirmed BOOLEAN DEFAULT FALSE,
        -- Automatic timestamp of when the location update was logged
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Log success message to console
    console.log("Database schema updated successfully.");
    // Exit the process with success code
    process.exit(0);
  } catch (error) {
    // Log the error details if initialization fails
    console.error("Error setting up database:", error);
    // Exit the process with failure code
    process.exit(1);
  }
};

// Execute the async setup function
setupDb();

