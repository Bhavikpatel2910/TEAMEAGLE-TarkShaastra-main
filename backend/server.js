require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = Number(process.env.PORT) || 5001;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
  logger.error('Server failed to start', error);
});

module.exports = server;
