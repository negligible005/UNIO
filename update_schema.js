const { pool } = require('./db');

const updateSchema = async () => {
    try {
        console.log("Updating bookings table for cancellation requests...");

        await pool.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user_id1 INTEGER REFERENCES users(id),
        user_id2 INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id1, user_id2)
      );

      CREATE TABLE IF NOT EXISTS trust_scores (
        id SERIAL PRIMARY KEY,
        rater_id INTEGER REFERENCES users(id),
        ratee_id INTEGER REFERENCES users(id),
        score INTEGER CHECK (score >= 1 AND score <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50),
        content TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log("Database schema updated successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error updating schema:", error);
        process.exit(1);
    }
};

updateSchema();
