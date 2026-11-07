const http = require('http');
const env = require('./config/env');
const logger = require('./lib/logger');
const { pool } = require('./config/db');
const app = require('./app');

const server = http.createServer(app); // Socket.IO attaches to this server later

server.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));

function shutdown(signal) {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
