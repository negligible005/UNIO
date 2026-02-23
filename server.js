const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Unique ID for this server run to force client logouts on restart
const SERVER_START_ID = Date.now().toString();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/'))); // Serve static files from current dir

// Routes (to be added)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/trust', require('./routes/trust'));

// Session endpoint
app.get('/api/sys/session', (req, res) => {
    res.json({ sessionId: SERVER_START_ID });
});

// Initialize DB and Start Server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});
