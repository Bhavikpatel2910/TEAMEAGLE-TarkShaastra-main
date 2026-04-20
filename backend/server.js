require('dotenv').config();

const app = require('./src/app');

const PORT = Number(process.env.PORT) || 5001;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
  console.error('Server failed to start:', error.message);
});

module.exports = server;
