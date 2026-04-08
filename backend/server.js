const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();
const connectDB = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const lobbies = {};

io.on("connection", (socket) => {
  console.log("User conectado:", socket.id);

  socket.on("createLobby", ({ nick }) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    lobbies[code] = {
      host: socket.id,
      players: [{ nick, id: socket.id }],
    };

    socket.join(code);
    socket.emit("lobbyCreated", { code });
  });

  socket.on("joinLobby", ({ code, nick }) => {
    const lobby = lobbies[code];

    if (!lobby) {
      return socket.emit("errorLobby", "Lobby não existe");
    }

    if (lobby.players.length >= 2) {
      return socket.emit("errorLobby", "Lobby cheio");
    }

    lobby.players.push({ nick, id: socket.id });
    socket.join(code);

    io.to(code).emit("playerJoined", lobby.players);
  });

  socket.on("startGame", ({ code }) => {
    const lobby = lobbies[code];

    if (!lobby) return;

    if (lobby.host !== socket.id) {
      return socket.emit("errorLobby", "Só o host pode iniciar o jogo");
    }

    if (lobby.players.length < 2) {
      return socket.emit("errorLobby", "Precisas de 2 jogadores");
    }

    io.to(code).emit("gameStarting", {
      players: lobby.players,
    });
  });

  socket.on("disconnect", () => {
    console.log("User desconectado:", socket.id);

    for (const code in lobbies) {
      const lobby = lobbies[code];
      const index = lobby.players.findIndex((p) => p.id === socket.id);

      if (index !== -1) {
        lobby.players.splice(index, 1);

        if (lobby.players.length === 0) {
          delete lobbies[code];
        } else {
          io.to(code).emit("playerJoined", lobby.players);
        }
      }
    }
  });
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const PORT = process.env.PORT || 3000;

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

async function startServer() {
  try {
    await connectDB();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor na porta ${PORT}`);
    });

  } catch (err) {
    console.error("Erro ao iniciar:", err);
    process.exit(1);
  }
}

startServer();