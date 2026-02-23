const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || 5432),
});

async function seedCommunity() {
    try {
        const usersRes = await pool.query('SELECT id, name FROM users LIMIT 5');
        const users = usersRes.rows;

        if (users.length < 2) {
            console.log("Not enough users to seed community data.");
            return;
        }

        const alice = users.find(u => u.name.toLowerCase().includes('alice'));
        const bob = users.find(u => u.name.toLowerCase().includes('bob'));
        const john = users.find(u => u.name.toLowerCase().includes('john'));

        if (alice && bob) {
            console.log("Seeding friendship between Alice and Bob...");
            const [id1, id2] = alice.id < bob.id ? [alice.id, bob.id] : [bob.id, alice.id];
            await pool.query("INSERT INTO friends (user_id1, user_id2, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING", [id1, id2]);

            console.log("Seeding trust scores...");
            await pool.query("INSERT INTO trust_scores (rater_id, ratee_id, score, comment) VALUES ($1, $2, 5, 'Great splitting experience!') ON CONFLICT DO NOTHING", [bob.id, alice.id]);
            await pool.query("INSERT INTO trust_scores (rater_id, ratee_id, score, comment) VALUES ($1, $2, 4, 'Very reliable.') ON CONFLICT DO NOTHING", [alice.id, bob.id]);
        }

        if (john && alice) {
            console.log("Seeding pending friend request from John to Alice...");
            const [id1, id2] = john.id < alice.id ? [john.id, alice.id] : [alice.id, john.id];
            await pool.query("INSERT INTO friends (user_id1, user_id2, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING", [id1, id2]);
            await pool.query("INSERT INTO notifications (user_id, type, content) VALUES ($1, 'friend_request', $2) ON CONFLICT DO NOTHING", [alice.id, `You have a new friend request from user ${john.id}`]);
        }

        console.log("Community seeding complete.");
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

seedCommunity();
