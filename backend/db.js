const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_SERVER,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function connectDB() {
  try {
    const conn = await pool.getConnection();
    console.log('Base conectada com sucesso!');
    conn.release();
    return pool;
  } catch (err) {
    console.error('Erro ao conectar na base:', err);
    throw err;
  }
}

module.exports = connectDB;