const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             process.env.DB_PORT     || 3306,
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'yoruzone',
  waitForConnections: true,
  connectionLimit:  10,
  enableKeepAlive:  true,
  keepAliveInitialDelay: 10000,
});

// sem este listener, um erro de ligação perdida crasha o processo
pool.on('error', (err) => {
  console.error('Erro no pool MySQL:', err.message);
});

async function connectDB() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    return pool;
  } catch (err) {
    console.error('Erro ao ligar à base de dados:', err.message);
    throw err;
  }
}

module.exports = connectDB;
