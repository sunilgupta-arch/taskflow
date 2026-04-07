const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taskflow_db',
  timezone: '+00:00',  // Driver-level offset (session tz is set below via SET time_zone)
  dateStrings: ['DATE', 'TIMESTAMP'],  // Return as strings to avoid JS Date timezone shifting
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Set Eastern timezone on every pool connection so TIMESTAMP values are
// returned as America/New_York regardless of the MySQL server's system timezone.
pool.on('connection', function (connection) {
  connection.query("SET time_zone = 'America/New_York'");
});

pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
