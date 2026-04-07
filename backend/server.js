const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
dotenv.config();
const connectDB = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT;

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input('email', email)
      .query(`SELECT *
              FROM vw_Perfil
              WHERE Email = @email;`);
      
    const user = result.recordset[0];

    if(!user) {
      return res.status(404).json({ message: 'Utilizador não encontrado' });
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Password incorreta' });
    }

    res.json({
      id: user.Id,
      nome: user.Nome,
      email: user.Email,
      data_nasc: user.Data_Nasc,
      tipo_pessoa: user.Nome_Tipo,
      imagem: user.Img_Path,
      sexo: user.Nome_Sexo,
      pais: user.Nome_Pais,
      departamento: user.Nome_Departamento,
      abreviacao_departamento: user.Abreviacao,
      gabinete: user.Gabinete
    });
    
  } catch (err) {
    console.error('Erro ao processar login:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});
 
async function startServer() {
  try {
    await connectDB(); 
    app.listen(PORT, () => {
      console.log(`Servidor na porta ${PORT}`);
    });
  } catch (err) {
    console.error('Não foi possível iniciar o servidor:', err);
    process.exit(1);
  }
}

startServer();