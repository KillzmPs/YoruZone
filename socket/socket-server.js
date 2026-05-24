const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
dotenv.config();

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

const BUY_DURATION          = 15_000;
const ROUND_DURATION        = 90_000;
const BETWEEN_ROUND_DELAY   = 4_000;
const PREGAME_DELAY         = 1_500;
const WIN_CREDITS            = 3_000;
const LOSE_CREDITS           = 1_900;
const KILL_CREDITS           = 200;
const MAX_CREDITS            = 9_000;
const STARTING_CREDITS       = 800;
const WINS_TO_WIN            = 3;

const lobbies = {};

function startRound(code) {
  const lobby = lobbies[code];
  if (!lobby || lobby.phase === "ended") return;

  lobby.phase = "buy";
  const round = lobby.round;

  lobby.players.forEach(p => { lobby.hps[p.id] = 100; lobby.shields[p.id] = 0; });

  lobby.players.forEach(p => {
    const opp = lobby.players.find(q => q.id !== p.id);
    io.to(p.id).emit("roundStart", {
      round,
      credits:        lobby.credits[p.id] ?? STARTING_CREDITS,
      myRoundsWon:    lobby.roundsWon[p.id]       ?? 0,
      enemyRoundsWon: lobby.roundsWon[opp?.id]    ?? 0,
    });
  });

  lobby.buyTimer = setTimeout(() => {
    if (!lobbies[code] || lobby.phase !== "buy") return;
    lobby.phase = "game";
    io.to(code).emit("playPhase", { round });

    lobby.roundTimer = setTimeout(() => {
      if (!lobbies[code] || lobby.phase !== "game") return;

      let maxHp = -1, winnerNick = null;
      lobby.players.forEach(p => {
        const hp = lobby.hps[p.id] ?? 0;
        if (hp > maxHp) { maxHp = hp; winnerNick = p.nick; }
      });
      endRound(code, winnerNick);
    }, ROUND_DURATION);
  }, BUY_DURATION);
}

function endRound(code, winnerNick) {
  const lobby = lobbies[code];
  if (!lobby) return;

  clearTimeout(lobby.buyTimer);
  clearTimeout(lobby.roundTimer);
  clearTimeout(lobby.betweenTimer);
  lobby.phase = "round_over";

  const winner = lobby.players.find(p => p.nick === winnerNick);
  if (winner) lobby.roundsWon[winner.id] = (lobby.roundsWon[winner.id] ?? 0) + 1;

  lobby.players.forEach(p => {
    const gained = p.nick === winnerNick ? WIN_CREDITS : LOSE_CREDITS;
    lobby.credits[p.id] = Math.min(MAX_CREDITS, (lobby.credits[p.id] ?? STARTING_CREDITS) + gained);
  });

  const maxWins = Object.values(lobby.roundsWon).length
    ? Math.max(...Object.values(lobby.roundsWon))
    : 0;
  if (maxWins >= WINS_TO_WIN) {
    const champion = lobby.players.find(p => (lobby.roundsWon[p.id] ?? 0) >= WINS_TO_WIN)
      ?? lobby.players.find(p => p.nick === winnerNick);
    if (!champion) return;
    const scoresByNick = {};
    lobby.players.forEach(p => { scoresByNick[p.nick] = lobby.roundsWon[p.id] ?? 0; });
    io.to(code).emit("matchOver", { winnerNick: champion.nick, scores: scoresByNick });
    lobby.phase = "ended";
    return;
  }

  lobby.players.forEach(p => {
    const opp = lobby.players.find(q => q.id !== p.id);
    io.to(p.id).emit("roundOver", {
      winnerNick,
      myRoundsWon:    lobby.roundsWon[p.id]    ?? 0,
      enemyRoundsWon: lobby.roundsWon[opp?.id] ?? 0,
      creditsGained:  p.nick === winnerNick ? WIN_CREDITS : LOSE_CREDITS,
      newCredits:     lobby.credits[p.id],
    });
  });

  lobby.round++;
  lobby.betweenTimer = setTimeout(() => startRound(code), BETWEEN_ROUND_DELAY);
}

io.on("connection", (socket) => {

  socket.on("createLobby", ({ nick }) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    lobbies[code] = {
      host:         socket.id,
      players:      [{ nick, id: socket.id }],
      hps:          { [socket.id]: 100 },
      shields:      { [socket.id]: 0 },
      roundsWon:    { [socket.id]: 0 },
      credits:      { [socket.id]: STARTING_CREDITS },
      round:        1,
      phase:        "waiting",
      ready:        {},
      buyTimer:     null,
      roundTimer:   null,
      betweenTimer: null,
    };
    socket.join(code);
    socket.emit("lobbyCreated", { code });
  });

  socket.on("joinLobby", ({ code, nick }) => {
    const lobby = lobbies[code];
    if (!lobby)                    return socket.emit("errorLobby", "Lobby não existe");
    if (lobby.players.length >= 2) return socket.emit("errorLobby", "Lobby cheio");

    lobby.players.push({ nick, id: socket.id });
    lobby.hps[socket.id]       = 100;
    lobby.shields[socket.id]   = 0;
    lobby.roundsWon[socket.id] = 0;
    lobby.credits[socket.id]   = STARTING_CREDITS;
    socket.join(code);
    io.to(code).emit("playerJoined", lobby.players);
  });

  socket.on("startGame", ({ code }) => {
    const lobby = lobbies[code];
    if (!lobby)                         return;
    if (lobby.host !== socket.id)       return socket.emit("errorLobby", "Só o host pode iniciar");
    if (lobby.players.length < 2)       return socket.emit("errorLobby", "Precisas de 2 jogadores");

    lobby.ready = {};
    io.to(code).emit("gameStarting", { players: lobby.players, code });
  });

  socket.on("playerReady", ({ code }) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.phase !== "waiting") return;
    lobby.ready[socket.id] = true;
    if (Object.keys(lobby.ready).length >= 2) {
      lobby.phase = "starting";
      setTimeout(() => startRound(code), PREGAME_DELAY);
    }
  });

  socket.on("move", ({ code, x, y, z, yaw, pitch, moving }) => {
    socket.to(code).emit("enemyMove", { x, y, z, yaw, pitch, moving });
  });

  socket.on("buyShield", ({ code, amount }) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.phase !== "buy") return;
    const current = lobby.shields[socket.id] ?? 0;
    if (current >= amount) return;
    lobby.shields[socket.id] = amount;
    io.to(socket.id).emit("shieldUpdate", { shield: amount });
  });

  socket.on("sellShield", ({ code }) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.phase !== "buy") return;
    lobby.shields[socket.id] = 0;
    io.to(socket.id).emit("shieldUpdate", { shield: 0 });
  });

  socket.on("playerHit", ({ code, damage, shooter, zone }) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.phase !== "game") return;

    const victim = lobby.players.find(p => p.nick !== shooter);
    if (!victim) return;

    const currentShield = lobby.shields[victim.id] ?? 0;
    let newShield = currentShield;
    let hpDamage = damage;
    if (currentShield > 0) {
      const shieldPortion = Math.round(damage * 0.33);
      const absorbed = Math.min(currentShield, shieldPortion);
      newShield = currentShield - absorbed;
      hpDamage  = damage - absorbed;
      lobby.shields[victim.id] = newShield;
    }
    lobby.hps[victim.id] = Math.max(0, (lobby.hps[victim.id] ?? 100) - hpDamage);

    const victimSocket = io.sockets.sockets.get(victim.id);
    if (victimSocket) victimSocket.emit("youWereHit", {
      damage, zone: zone ?? "body",
      remainingHp: lobby.hps[victim.id], remainingShield: newShield,
    });

    socket.emit("enemyHpUpdate", { hp: lobby.hps[victim.id], shield: newShield });

    const shooterPlayer = lobby.players.find(p => p.nick === shooter);
    if (shooterPlayer) {
      lobby.credits[shooterPlayer.id] = Math.min(
        MAX_CREDITS,
        (lobby.credits[shooterPlayer.id] ?? STARTING_CREDITS) + KILL_CREDITS
      );
      io.to(shooterPlayer.id).emit("killCredits", {
        gained: KILL_CREDITS,
        total:  lobby.credits[shooterPlayer.id],
      });
    }

    if (lobby.hps[victim.id] <= 0) endRound(code, shooter);
  });

  socket.on("weaponChange", ({ code, weaponId }) => socket.to(code).emit("enemyWeaponChange", { weaponId }));

  socket.on("abilityFlash",         ({ code, pos, targetPos }) => socket.to(code).emit("enemyFlash",      { pos, targetPos }));
  socket.on("abilityTeleportPlace", ({ code, pos })          => socket.to(code).emit("enemyTeleportPlace", { pos }));
  socket.on("abilityTeleportGo",    ({ code, newPos })       => socket.to(code).emit("enemyTeleportGo",    { newPos }));
  socket.on("abilityClone",         ({ code, pos, dir })     => socket.to(code).emit("enemyClone",         { pos, dir }));
  socket.on("abilityInvisible",     ({ code })               => socket.to(code).emit("enemyInvisible"));
  socket.on("abilityVisibleAgain",  ({ code })               => socket.to(code).emit("enemyVisibleAgain"));
  socket.on("abilityUltEnd",        ({ code, pos })          => socket.to(code).emit("enemyUltEnd",         { pos }));

  socket.on("disconnect", () => {
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      lobby.players.splice(idx, 1);
      clearTimeout(lobby.buyTimer);
      clearTimeout(lobby.roundTimer);
      clearTimeout(lobby.betweenTimer);

      if (lobby.players.length === 0) {
        delete lobbies[code];
      } else {
        io.to(code).emit("playerJoined", lobby.players);
        if (["buy", "game"].includes(lobby.phase)) {
          io.to(code).emit("matchOver", {
            winnerNick: lobby.players[0].nick,
            reason:     "opponent_disconnected",
          });
          lobby.phase = "ended";
        }
      }
      break;
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => console.log(`Socket.io na porta ${PORT}`));
