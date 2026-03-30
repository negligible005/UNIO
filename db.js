/* ==========================================================
   DB.JS - DATABASE CONFIGURATION AND INITIALIZATION
   This file manages the connection to the PostgreSQL database
   and defines the initial schema and migrations for all tables.
   ========================================================== */

// Import the Pool class from the pg (node-postgres) library
const { Pool } = require('pg');
// Load environment variables from the .env file into process.env
require('dotenv').config();

// Create a new database connection pool instance for persistent management
const pool = new Pool({
  // Read database authorized user from environment settings
  user: process.env.DB_USER,
  // Read the database server host address (e.g., localhost or AWS RDS)
  host: process.env.DB_HOST,
  // Read the targeted database name from environment variables
  database: process.env.DB_NAME,
  // Read the secure password required for database access
  password: process.env.DB_PASSWORD,
  // Read the communication port for the DB service (default 5432)
  port: process.env.DB_PORT,
});

// Define an asynchronous function to initialize the database schema
const initDb = async () => {
  try {
    /* --- USERS TABLE SCHEMA ---
       Stores core user account data and roles. */

    // Execute a query to create the users table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        -- Auto-incrementing primary key for unique user identification
        id SERIAL PRIMARY KEY,
        -- Full name of the user (mandatory)
        name VARCHAR(255) NOT NULL,
        -- Unique email address used for login (mandatory)
        email VARCHAR(255) UNIQUE NOT NULL,
        -- Hashed password string for account security (mandatory)
        password VARCHAR(255) NOT NULL,
        -- User role (defaulting to 'consumer')
        role VARCHAR(50) DEFAULT 'consumer',
        -- Flag to indicate if the user is suspended (default False)
        is_banned BOOLEAN DEFAULT FALSE,
        -- Timestamp of when the account was created
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add the 'is_banned' column to the users table if it's missing
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;`);
    // Migration: Add the 'status' column to the listings table if it's missing
    await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';`);

    /* --- LISTINGS TABLE SCHEMA ---
       Stores service or product offerings provided by users. */

    // Execute a query to create the listings table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        -- Auto-incrementing primary key for unique listing identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the ID of the user who owns the listing
        provider_id INTEGER REFERENCES users(id),
        -- Type of service or product offered
        type VARCHAR(50) NOT NULL,
        -- Capacity or volume of the offering (mandatory)
        capacity VARCHAR(50) NOT NULL,
        -- Price per individual unit of the offering (mandatory)
        price_per_unit DECIMAL(10, 2) NOT NULL,
        -- Physical or descriptive location of the listing
        location TEXT,
        -- Date or duration availability of the listing
        date TEXT,
        -- Additional flexible metadata stored in JSONB format
        details JSONB,
        -- Approval flag for admin moderation (default False)
        approved BOOLEAN DEFAULT FALSE,
        -- Timestamp of when the listing was posted
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add the 'base_cost' column to listings for standard pricing
    await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS base_cost DECIMAL(10, 2) DEFAULT 0.00;`);
    // Migration: Ensure the 'approved' column exists in the listings table
    await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;`);

    /* --- BOOKINGS TABLE SCHEMA ---
       Tracks reservations and orders made by users for listings. */

    // Execute a query to create the bookings table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        -- Auto-incrementing primary key for unique booking identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the ID of the user who made the booking
        user_id INTEGER REFERENCES users(id),
        -- Foreign key referencing the ID of the listing being booked
        listing_id INTEGER REFERENCES listings(id),
        -- Current status of the booking (default 'pending')
        status VARCHAR(50) DEFAULT 'pending',
        -- Current payment state of the booking (default 'unpaid')
        payment_status VARCHAR(50) DEFAULT 'unpaid',
        -- Number of units reserved in this booking (default 1)
        quantity INTEGER DEFAULT 1,
        -- Calculated total price for the entire booking
        total_price DECIMAL(10, 2),
        -- Flag to indicate if the user requested priority handling
        is_priority BOOLEAN DEFAULT FALSE,
        -- Tracking field for the state of a cancellation request
        cancellation_status VARCHAR(50),
        -- Explanation provided by the user for canceling
        cancellation_reason TEXT,
        -- Timestamp of when the booking was initiated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add missing cancellation status column to the bookings table
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_status VARCHAR(50);`);
    // Migration: Add explanation field for booking cancellations
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;`);
    // Migration: Add user-requested priority status column
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;`);
    // Migration: Add estimated time of arrival field for tracking
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS eta VARCHAR(255);`);
    // Migration: Add flexible metadata storage for specific booking details
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS details JSONB;`);
    // Migration: Add timestamp for when the booking record was last updated
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    /* --- FEEDBACK TABLE SCHEMA ---
       Stores user reviews and ratings for specific bookings. */

    // Execute a query to create the feedback table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        -- Auto-incrementing primary key for unique feedback identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the specific booking being reviewed
        booking_id INTEGER REFERENCES bookings(id),
        -- Foreign key referencing the user who submitted the review
        user_id INTEGER REFERENCES users(id),
        -- Numerical rating from 1 to 5 stars (with constraint)
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        -- Written text feedback provided by the user
        comment TEXT,
        -- Timestamp of when the review was submitted
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- TRACKING UPDATES TABLE SCHEMA ---
       Logs real-time location and status updates for logistics shipments. */

    // Execute query to create the tracking_updates table for shipment visualization
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_updates (
        -- Primary key with auto-increment for unique entry tracking
        id SERIAL PRIMARY KEY,
        -- Foreign key to the listing; ON DELETE CASCADE ensures logs are cleaned up
        listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
        -- Descriptive name of the geographical checkpoint or city
        location_name VARCHAR(255) NOT NULL,
        -- Decimal latitude coordinate for precise map placement
        lat DECIMAL(10, 6) NOT NULL,
        -- Decimal longitude coordinate for precise map placement
        lng DECIMAL(10, 6) NOT NULL,
        -- Flag indicating if the admin has confirmed the source of the update
        is_confirmed BOOLEAN DEFAULT FALSE,
        -- Automatic timestamp showing when the location was recorded
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- MARKETPLACE ITEMS TABLE SCHEMA ---
       Stores items for sale or auction in the community marketplace. */

    // Execute a query to create the marketplace items table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_items (
        -- Auto-incrementing primary key for unique item identification
        id SERIAL PRIMARY KEY,
        -- Foreign key to the seller, deletions cascade to their items
        seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Broad classification of the marketplace offering
        type VARCHAR(50) NOT NULL,
        -- Sub-category for easier filtering and search
        category VARCHAR(100),
        -- Short, descriptive heading for the item
        title VARCHAR(255) NOT NULL,
        -- Detailed textual explanation of the item's condition and features
        description TEXT,
        -- Direct purchase price for fixed-price items
        price DECIMAL(10, 2),
        -- Initial required bid for auction-style items
        starting_bid DECIMAL(10, 2),
        -- The highest amount currently bid on this item
        current_highest_bid DECIMAL(10, 2),
        -- Foreign key referencing the current leader in an auction
        highest_bidder_id INTEGER REFERENCES users(id),
        -- Deadline timestamp after which bids are no longer accepted
        auction_end TIMESTAMP,
        -- Array of image URLs or paths stored in JSONB format
        images JSONB DEFAULT '[]',
        -- Current availability of the item (e.g., active, sold)
        status VARCHAR(50) DEFAULT 'active',
        -- Timestamp of when the item was listed
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- BIDS TABLE SCHEMA ---
       Records individual bids placed on marketplace items. */

    // Execute a query to create the bids table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bids (
        -- Auto-incrementing primary key for unique bid identification
        id SERIAL PRIMARY KEY,
        -- Foreign key to the marketplace item being bid on
        item_id INTEGER REFERENCES marketplace_items(id) ON DELETE CASCADE,
        -- Foreign key to the user placing the bid
        bidder_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Numerical amount of the specific bid
        amount DECIMAL(10, 2) NOT NULL,
        -- Timestamp of when the bid was placed
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- MARKETPLACE CHATS TABLE SCHEMA ---
       Groups messages between specific buyers and sellers regarding an item. */

    // Execute a query to create the marketplace chats table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_chats (
        -- Auto-incrementing primary key for unique chat identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the marketplace item in question
        item_id INTEGER REFERENCES marketplace_items(id) ON DELETE CASCADE,
        -- Foreign key referencing the potential buyer
        buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Foreign key referencing the item's seller
        seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Timestamp of when the conversation started
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ensure only one chat exists per buyer-item combination
        UNIQUE(item_id, buyer_id)
      );
    `);

    /* --- MARKETPLACE MESSAGES TABLE SCHEMA ---
       Stores the individual messages within a marketplace chat. */

    // Execute a query to create the marketplace messages table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_messages (
        -- Auto-incrementing primary key for unique message identification
        id SERIAL PRIMARY KEY,
        -- Foreign key linking the message to its parent chat
        chat_id INTEGER REFERENCES marketplace_chats(id) ON DELETE CASCADE,
        -- Foreign key referencing the user who sent the message
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- The actual text content of the message
        content TEXT NOT NULL,
        -- Timestamp of when the message was sent
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- TRUST SCORES TABLE SCHEMA ---
       Maintains a peer-review system between users within the platform. */

    // Execute a query to create the trust scores table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trust_scores (
        -- Auto-incrementing primary key for unique rating identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the user giving the rating
        rater_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Foreign key referencing the user receiving the rating
        ratee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Numerical trust score value between 1 and 5
        score INTEGER CHECK (score >= 1 AND score <= 5),
        -- Optional written justification for the score
        comment TEXT DEFAULT '',
        -- Timestamp of the most recent update to this specific rating
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Timestamp of when the rating was first created
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ensure a rater can only give one rating per individual user
        UNIQUE(rater_id, ratee_id)
      );
    `);

    // Migration: ensure the 'updated_at' column exists for tracking score changes
    await pool.query(`
      ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Migration: ensure the 'comment' column exists for descriptive ratings
    await pool.query(`
      ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT '';
    `);

    /* --- TRUST SCORES CONSTRAINT MIGRATION ---
       Ensures the uniqueness of rater/ratee pairs for data integrity. */

    // Execute a dynamic PL/pgSQL block to add a unique constraint if missing
    await pool.query(`
      DO $$ BEGIN
        -- Check if the unique constraint already exists on the table
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'trust_scores_rater_id_ratee_id_key'
            AND conrelid = 'trust_scores'::regclass
        ) THEN
          -- Add the unique constraint to facilitate UPSERT operations
          ALTER TABLE trust_scores ADD CONSTRAINT trust_scores_rater_id_ratee_id_key UNIQUE (rater_id, ratee_id);
        END IF;
      -- End of the conditional logic block
      END $$;
    `);

    /* --- FRIENDS TABLE SCHEMA ---
       Manages social connections and friendship requests between users. */

    // Execute a query to create the friends table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friends (
        -- Auto-incrementing primary key for unique friendship identification
        id SERIAL PRIMARY KEY,
        -- Foreign key for the first user in the friendship pair
        user_id1 INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Foreign key for the second user in the friendship pair
        user_id2 INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Current state of the connection (e.g., pending, accepted)
        status VARCHAR(50) DEFAULT 'pending',
        -- Timestamp of when the connection request was initiated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ensure only one friendship record exists for any given user pair
        UNIQUE(user_id1, user_id2)
      );
    `);

    /* --- FRIEND CHATS TABLE SCHEMA ---
       Groups messages between two users who are friends. */

    // Execute a query to create the friend chats table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_chats (
        -- Auto-incrementing primary key for unique chat identification
        id SERIAL PRIMARY KEY,
        -- Foreign key for the first user in the chat session
        user_id1 INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Foreign key for the second user in the chat session
        user_id2 INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Timestamp of when the conversation was first initiated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ensure only one chat record exists between any two users
        UNIQUE(user_id1, user_id2)
      );
    `);

    /* --- FRIEND MESSAGES TABLE SCHEMA ---
       Stores individual messages sent between friends in a chat. */

    // Execute a query to create the friend messages table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_messages (
        -- Auto-incrementing primary key for unique message identification
        id SERIAL PRIMARY KEY,
        -- Foreign key linking the message to the appropriate friend chat
        chat_id INTEGER REFERENCES friend_chats(id) ON DELETE CASCADE,
        -- Foreign key referencing the user who sent this message
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- The textual content of the message body
        content TEXT NOT NULL,
        -- Status flag to track if the recipient has seen the message
        is_read BOOLEAN DEFAULT FALSE,
        -- Timestamp of when the message was sent to the server
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- NOTIFICATIONS TABLE SCHEMA ---
       Alerts users about system events, messages, or updates. */

    // Execute a query to create the notifications table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        -- Auto-incrementing primary key for unique notification identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the user who should receive the alert
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Classification of the notification (e.g., 'booking_update', 'chat')
        type VARCHAR(100) NOT NULL,
        -- The actual message content to be displayed to the user
        content TEXT NOT NULL,
        -- Status flag to track if the user has dismissed the alert
        is_read BOOLEAN DEFAULT FALSE,
        -- Timestamp of when the notification was generated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- SPLIT REQUESTS TABLE SCHEMA ---
       Handles cost-sharing requests between multiple users. */

    // Execute a query to create the split requests table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS split_requests (
        -- Auto-incrementing primary key for unique split identification
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the marketplace item being split
        item_id INTEGER REFERENCES marketplace_items(id) ON DELETE CASCADE,
        -- Foreign key referencing the user who initiated the split
        creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Total number of participants required for the split (default 2)
        total_slots INTEGER NOT NULL DEFAULT 2,
        -- Number of participants who have already joined the split
        filled_slots INTEGER DEFAULT 1,
        -- The cost each person is expected to pay
        price_per_person DECIMAL(10,2),
        -- Text field for the creator's specific conditions or rules
        creator_terms TEXT,
        -- Current state of the split (e.g., 'open', 'completed')
        status VARCHAR(50) DEFAULT 'open',
        -- Flag to indicate if upfront payment is mandatory to join
        payment_required BOOLEAN DEFAULT FALSE,
        -- Timestamp of when the split request was posted
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: ensure the 'payment_required' column exists in split requests
    await pool.query(`
      ALTER TABLE split_requests ADD COLUMN IF NOT EXISTS payment_required BOOLEAN DEFAULT FALSE;
    `);

    /* --- SPLIT MEMBERS TABLE SCHEMA ---
       Tracks individual participants who have joined a cost split. */

    // Execute a query to create the split members table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS split_members (
        -- Auto-incrementing primary key for unique member-split record
        id SERIAL PRIMARY KEY,
        -- Foreign key referencing the parent split request
        split_id INTEGER REFERENCES split_requests(id) ON DELETE CASCADE,
        -- Foreign key referencing the user participating in the split
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- Text field for any specific terms the member agreed to
        terms TEXT,
        -- Timestamp of when the user joined this specific split
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ensure a user can only occupy one slot in a given split
        UNIQUE(split_id, user_id)
      );
    `);

    /* --- DUMMY PAYMENTS TABLE SCHEMA ---
       Simulates a payment processing system for different transaction types. */

    // Execute a query to create the dummy payments table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dummy_payments (
        -- Auto-incrementing primary key for unique transaction identification
        id SERIAL PRIMARY KEY,
        -- Foreign key linking to a cost split (optional)
        split_id INTEGER REFERENCES split_requests(id) ON DELETE CASCADE,
        -- Foreign key linking to a standard booking (optional)
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        -- Foreign key linking to a marketplace item (optional)
        item_id INTEGER REFERENCES marketplace_items(id) ON DELETE CASCADE,
        -- Foreign key referencing the user making the payment
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        -- The total monetary amount involved in the transaction
        payment_amount DECIMAL(10,2) NOT NULL,
        -- The method used for the simulated payment (e.g., 'card')
        payment_method VARCHAR(50) NOT NULL,
        -- A unique string provided as proof of transaction
        confirmation_id VARCHAR(255) UNIQUE NOT NULL,
        -- Data required to generate a payment verification QR code
        qr_code_data TEXT,
        -- Current logical state of the payment (e.g., 'pending')
        status VARCHAR(50) DEFAULT 'pending',
        -- Timestamp of when the payment record was first created
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Timestamp of when the payment was officially verified/completed
        confirmed_at TIMESTAMP
      );
    `);

    // Migration: ensure the 'item_id' column exists to support item payments
    await pool.query(`
      ALTER TABLE dummy_payments ADD COLUMN IF NOT EXISTS item_id INTEGER REFERENCES marketplace_items(id) ON DELETE CASCADE;
    `);

    /* --- PAYMENT HISTORY TABLE SCHEMA ---
       Maintains a permanent audit trail of all payment-related actions. */

    // Execute a query to create the payment history table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_history (
        -- Auto-incrementing primary key for unique audit record
        id SERIAL PRIMARY KEY,
        -- Foreign key linking back to the specific payment being audited
        payment_id INTEGER REFERENCES dummy_payments(id) ON DELETE CASCADE,
        -- Short description of the event (e.g., 'created', 'verified')
        action VARCHAR(50) NOT NULL,
        -- Additional context stored in a flexible JSONB format
        details JSONB,
        -- Foreign key referencing the user who performed the action
        actor_id INTEGER REFERENCES users(id),
        -- Timestamp of when the audit entry was recorded
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    /* --- SITE INQUIRIES TABLE SCHEMA ---
       Captures contact form submissions from the platform website. */

    // Execute a query to create the site inquiries table if it does not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_inquiries (
        -- Auto-incrementing primary key for unique inquiry identification
        id SERIAL PRIMARY KEY,
        -- Full name provided by the person submitting the form
        name VARCHAR(255) NOT NULL,
        -- Contact email address for following up on the inquiry
        email VARCHAR(255) NOT NULL,
        -- Brief summary of the inquiry's purpose or topic
        subject VARCHAR(255),
        -- The full message or question sent by the visitor
        message TEXT NOT NULL,
        -- Timestamp of when the contact form was submitted
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Log a success message once all operations are completed
    console.log("Database tables checked/created successfully.");
  // Catch and handle any errors during the initialization process
  } catch (error) {
    // Log the error details for debugging purposes
    console.error("Error initializing database:", error);
  }
// End of the initDb function definition
};

// Export the database pool and initialization function for app-wide use
module.exports = { pool, initDb };
