const { pool } = require('./db');

const promoteUser = async () => {
    try {
        console.log("Promoting user to Admin...");

        // Get the first user
        const res = await pool.query('SELECT * FROM users ORDER BY id LIMIT 1');

        if (res.rows.length === 0) {
            console.log("❌ No users found to promote. Register a user first.");
            process.exit(1);
        }

        const user = res.rows[0];
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);

        console.log(`✅ User promoted to Admin:`);
        console.log(`- ID: ${user.id}`);
        console.log(`- Name: ${user.name}`);
        console.log(`- Email: ${user.email}`);

        process.exit(0);

    } catch (error) {
        console.error("❌ Error promoting user:", error);
        process.exit(1);
    }
};

promoteUser();
