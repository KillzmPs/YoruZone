const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");

dotenv.config();

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

const lobbies = {};

io.on("connection", (socket) => {

  socket.on("createLobby", ({ nick }) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    lobbies[code] = {
      host: socket.id,
      players: [{ nick, id: socket.id }],
      hps: { [socket.id]: 100 },
    };
    socket.join(code);
    socket.emit("lobbyCreated", { code });
  });

  socket.on("joinLobby", ({ code, nick }) => {
    const lobby = lobbies[code];
    if (!lobby) return socket.emit("errorLobby", "Lobby não existe");
    if (lobby.players.length >= 2) return socket.emit("errorLobby", "Lobby cheio");

    lobby.players.push({ nick, id: socket.id });
    lobby.hps[socket.id] = 100;
    socket.join(code);
    io.to(code).emit("playerJoined", lobby.players);
  });

  socket.on("startGame", ({ code }) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    if (lobby.host !== socket.id) return socket.emit("errorLobby", "Só o host pode iniciar");
    if (lobby.players.length < 2) return socket.emit("errorLobby", "Precisas de 2 jogadores");
    
    io.to(code).emit("gameStarting", { players: lobby.players, code });
  });

  socket.on("move", ({ code, x, y, z, yaw, pitch, moving }) => {
    socket.to(code).emit("enemyMove", { x, y, z, yaw, pitch, moving });
  });

  socket.on("playerHit", ({ code, damage, shooter }) => {
    const lobby = lobbies[code];
    if (!lobby) return;

    const victim = lobby.players.find(p => p.nick !== shooter);
    if (!victim) return;

    const victimSocket = io.sockets.sockets.get(victim.id);
    if (victimSocket) victimSocket.emit("youWereHit", { damage });

    lobby.hps[victim.id] = Math.max(0, (lobby.hps[victim.id] ?? 100) - damage);
    socket.emit("enemyHpUpdate", { hp: lobby.hps[victim.id] });
  });

  socket.on("disconnect", () => {
    console.log("User desconectado:", socket.id);
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        lobby.players.splice(idx, 1);
        if (lobby.players.length === 0) {
          delete lobbies[code];
        } else {
          io.to(code).emit("playerJoined", lobby.players);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => console.log(`Socket.io server na porta ${PORT}`));
