const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

// Check if connecting to localhost (Ubuntu VPS default)
const isLocalhost = connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'));

const connectionConfig = {
  connectionString: connectionString,
  // Disable SSL if on localhost, even in production
  ssl: isProduction && !isLocalhost ? { rejectUnauthorized: false } : false
};

// Fallback for local development if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  connectionConfig.user = process.env.DB_USER || 'postgres';
  connectionConfig.host = process.env.DB_HOST || 'localhost';
  connectionConfig.database = process.env.DB_NAME || 'farmxpert_db';
  connectionConfig.password = process.env.DB_PASSWORD || 'password';
  connectionConfig.port = process.env.DB_PORT || 5432;
  delete connectionConfig.connectionString;
}

const pool = new Pool(connectionConfig);

const query = (text, params) => pool.query(text, params);

module.exports = {
  query,
  pool
};