try {
    console.log("Starting server via debug wrapper...");
    require('./server.js');
} catch (err) {
    console.error("CRITICAL STARTUP ERROR:");
    console.error(err);
    const fs = require('fs');
    fs.writeFileSync('server_crash.log', err.stack);
}

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    const fs = require('fs');
    fs.appendFileSync('server_crash.log', 'Unhandled Rejection: ' + reason + '\n' + (reason.stack || ''));
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    const fs = require('fs');
    fs.appendFileSync('server_crash.log', 'Uncaught Exception: ' + err.message + '\n' + err.stack);
});
