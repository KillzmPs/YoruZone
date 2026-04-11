const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

dotenv.config();
const connectDB = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ─── NOTA: Socket.io NÃO funciona no Vercel (serverless).
// Mantém o servidor Socket.io no Railway ou Render separadamente. ───────────

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// ── LOGIN ────────────────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await connectDB();

    const [rows] = await pool.query(
      `SELECT Id, Nick, PasswordHash FROM Utilizador WHERE Email = ?`,
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "Utilizador não encontrado" });
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);

    if (!validPassword) {
      return res.status(401).json({ message: "Password incorreta" });
    }

    res.json({ nick: user.Nick, id: user.Id });

  } catch (err) {
    console.error("Erro login:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// ── CRIAR CONTA ──────────────────────────────────────────────────────────────
app.post("/api/criar-conta", async (req, res) => {
  const { nick, email } = req.body;

  if (!nick || !email) {
    return res.status(400).json({ message: "Nick e Email são obrigatórios" });
  }

  try {
    const pool = await connectDB();

    const [existing] = await pool.query(
      `SELECT Id FROM Utilizador WHERE Email = ?`,
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email já registado" });
    }

    const randomPassword = crypto.randomBytes(6).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    await pool.query(
      `INSERT INTO Utilizador (Nick, Email, PasswordHash) VALUES (?, ?, ?)`,
      [nick, email, hashedPassword]
    );

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Conta criada!",
      text: `Olá ${nick}\n\nA tua conta foi criada com sucesso!\n\nPassword: ${randomPassword}\n\nObrigado por te inscrever na YoruZone!`,
    });

    res.json({ message: "Conta criada! Verifica o email." });

  } catch (err) {
    console.error("Erro criar conta:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

// ── HISTÓRICO ────────────────────────────────────────────────────────────────
app.post("/api/historico", async (req, res) => {
  const { Id } = req.body;

  try {
    const pool = await connectDB();

    const [rows] = await pool.query(
      `SELECT
        J.Id,
        J.Data,
        U_Adversario.Nick AS adversario,
        E.Nome_Estado AS estado
      FROM Detalhes_Jogo DJ1
      JOIN Jogo J ON DJ1.Id_Jogo = J.Id
      JOIN Detalhes_Jogo DJ2 ON DJ1.Id_Jogo = DJ2.Id_Jogo AND DJ1.Id_Jogador <> DJ2.Id_Jogador
      JOIN Utilizador U_Adversario ON DJ2.Id_Jogador = U_Adversario.Id
      JOIN Estado_Jogo E ON DJ1.Id_Estado = E.Id
      WHERE DJ1.Id_Jogador = ?
      ORDER BY J.Data DESC`,
      [Id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar histórico" });
  }
});

// ── EXPORT para Vercel ───────────────────────────────────────────────────────
module.exports = app;