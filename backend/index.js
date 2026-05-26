process.on('uncaughtException', (err) => {
  console.error('Erro não capturado:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem handler:', reason);
});

const app = require('./server');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend na porta ${PORT}`));

module.exports = app;
