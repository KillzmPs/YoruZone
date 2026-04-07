const mssql = require('mssql');
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function connectDB() {
  try {
    const pool = await mssql.connect(config);
    console.log('Base conectado com sucesso!');
    return pool;
  } catch (err) {
    console.error('Erro ao conectar na base:', err);
    throw err; 
  }
}

module.exports = connectDB;