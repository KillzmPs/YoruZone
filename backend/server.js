const express = require("express");
const cors    = require("cors");
const dotenv  = require("dotenv");
const bcrypt  = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto  = require("crypto");

dotenv.config();
const connectDB = require("./db");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await connectDB();
    const [rows] = await pool.query(
      `SELECT Id, Nick, PasswordHash FROM Utilizador WHERE Email = ?`,
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "Utilizador não encontrado" });

    const valid = await bcrypt.compare(password, user.PasswordHash);
    if (!valid) return res.status(401).json({ message: "Palavra-passe incorreta" });

    res.json({ nick: user.Nick, id: user.Id });
  } catch (err) {
    console.error("Erro login:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/criar-conta", async (req, res) => {
  const { nick, email } = req.body;
  if (!nick || !email) return res.status(400).json({ message: "Nick e Email são obrigatórios" });

  try {
    const pool = await connectDB();
    const [existing] = await pool.query(`SELECT Id FROM Utilizador WHERE Email = ?`, [email]);
    if (existing.length > 0) return res.status(409).json({ message: "Email já registado" });

    const randomPassword = crypto.randomBytes(6).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    await pool.query(
      `INSERT INTO Utilizador (Nick, Email, PasswordHash) VALUES (?, ?, ?)`,
      [nick, email, hashedPassword]
    );

    try {
      await transporter.sendMail({
        from:    process.env.EMAIL_USER,
        to:      email,
        subject: "Conta criada na YoruZone!",
        text:    `Olá ${nick}\n\nA tua conta foi criada com sucesso!\n\nPalavra-passe: ${randomPassword}\n\nBom jogo!`,
      });
    } catch (mailErr) {
      console.error("Erro ao enviar email:", mailErr.message);
    }

    res.json({ message: "Conta criada! Verifica o email." });
  } catch (err) {
    console.error("Erro criar conta:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

app.post("/api/historico", async (req, res) => {
  const { Id } = req.body;
  try {
    const pool = await connectDB();
    const [rows] = await pool.query(
      `SELECT
         J.Id,
         J.Data,
         U2.Nick        AS adversario,
         E.Nome_Estado  AS estado,
         DJ1.Rondas_Ganhas,
         DJ2.Rondas_Ganhas AS rondas_adversario
       FROM Detalhes_Jogo DJ1
       JOIN Jogo         J   ON DJ1.Id_Jogo    = J.Id
       JOIN Detalhes_Jogo DJ2 ON DJ1.Id_Jogo  = DJ2.Id_Jogo
                              AND DJ1.Id_Jogador <> DJ2.Id_Jogador
       JOIN Utilizador   U2  ON DJ2.Id_Jogador = U2.Id
       JOIN Estado_Jogo  E   ON DJ1.Id_Estado  = E.Id
       WHERE DJ1.Id_Jogador = ?
       ORDER BY J.Data DESC`,
      [Id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao obter histórico" });
  }
});

app.get("/api/armas", async (req, res) => {
  try {
    const pool = await connectDB();
    const [rows] = await pool.query(`SELECT * FROM Arma ORDER BY Preco ASC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao obter armas" });
  }
});

app.post("/api/guardar-jogo", async (req, res) => {
  const { lobbyCode, player1Nick, player2Nick, winnerNick, player1Rounds, player2Rounds } = req.body;
  if (!player1Nick || !player2Nick || !winnerNick) {
    return res.status(400).json({ message: "Dados insuficientes" });
  }

  try {
    const pool = await connectDB();

    const [jogoResult] = await pool.query(
      `INSERT INTO Jogo (Data, Lobby_Code) VALUES (NOW(), ?)`,
      [lobbyCode || null]
    );
    const jogoId = jogoResult.insertId;

    const [p1Rows] = await pool.query(`SELECT Id FROM Utilizador WHERE Nick = ?`, [player1Nick]);
    const [p2Rows] = await pool.query(`SELECT Id FROM Utilizador WHERE Nick = ?`, [player2Nick]);

    if (!p1Rows.length || !p2Rows.length) {
      return res.status(404).json({ message: "Um ou ambos os jogadores não encontrados" });
    }

    const p1Id    = p1Rows[0].Id;
    const p2Id    = p2Rows[0].Id;
    const p1Won   = player1Nick === winnerNick;

    await pool.query(
      `INSERT INTO Detalhes_Jogo (Id_Jogo, Id_Jogador, Id_Estado, Rondas_Ganhas) VALUES (?, ?, ?, ?)`,
      [jogoId, p1Id, p1Won ? 1 : 2, player1Rounds ?? 0]
    );
    await pool.query(
      `INSERT INTO Detalhes_Jogo (Id_Jogo, Id_Jogador, Id_Estado, Rondas_Ganhas) VALUES (?, ?, ?, ?)`,
      [jogoId, p2Id, p1Won ? 2 : 1, player2Rounds ?? 0]
    );

    res.json({ message: "Jogo guardado com sucesso!" });
  } catch (err) {
    console.error("Erro ao guardar jogo:", err);
    res.status(500).json({ message: "Erro ao guardar jogo" });
  }
});

module.exports = app;
