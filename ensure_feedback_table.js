const { pool } = require('./db');

const ensureFeedbackTable = async () => {
    try {
        console.log("Checking feedback table...");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id),
                user_id INTEGER REFERENCES users(id),
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Feedback table checked/created.");
        process.exit(0);
    } catch (error) {
        console.error("Error creating feedback table:", error);
        process.exit(1);
    }
};

ensureFeedbackTable();
