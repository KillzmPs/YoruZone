# YoruZone

Jogo FPS 1v1 em tempo real com renderização 3D via Three.js e comunicação via Socket.IO. Melhor de 5 rondas, com sistema de compras, escudo e habilidades inspiradas no Valorant.

---

### Estado do servidor

```js
const lobbies = {};
```

Cada lobby tem esta estrutura:

```js
lobbies["ABC123"] = {
  host:       "socket-id-do-host",
  players:    [{ nick, id }, { nick, id }],
  hps:        { "id": 100, "id2": 100 },
  shields:    { "id": 0,   "id2": 0   },
  roundsWon:  { "id": 0,   "id2": 0   },
  credits:    { "id": 800, "id2": 800 },
  round:      1,
  phase:      "waiting", // "waiting" | "starting" | "buy" | "game" | "round_over" | "ended"
}
```

---

### Eventos Cliente → Servidor

| Evento | Payload | Descrição |
|---|---|---|
| `createLobby` | `{ nick }` | Cria lobby com código aleatório de 6 chars. Criador é marcado como host. |
| `joinLobby` | `{ code, nick }` | Entra no lobby. Falha se não existir ou estiver cheio (máx. 2). |
| `startGame` | `{ code }` | Host inicia o jogo (requer 2 jogadores). |
| `playerReady` | `{ code }` | Jogador chegou ao ecrã de jogo. Quando ambos prontos, inicia 1ª ronda. |
| `move` | `{ code, x, y, z, yaw, pitch, moving }` | Posição e orientação. Retransmitida ao adversário. |
| `playerHit` | `{ code, damage, shooter, zone }` | Reporta acerto. Servidor calcula dano com escudo e notifica vítima. |
| `buyShield` | `{ code, amount }` | Compra escudo (25 ou 50) durante fase de compra. |
| `sellShield` | `{ code }` | Vende escudo durante fase de compra. |
| `weaponChange` | `{ code, weaponId }` | Troca de arma. Retransmitida para atualizar modelo 3D do adversário. |
| `abilityFlash` | `{ code, pos, targetPos }` | Lança flash (Blindside). |
| `abilityTeleportPlace` | `{ code, pos }` | Coloca marcador de teleporte (Gatecrash). |
| `abilityTeleportGo` | `{ code, newPos }` | Usa o teleporte. |
| `abilityClone` | `{ code, pos, dir }` | Cria clone (Fakeout). |
| `abilityInvisible` | `{ code }` | Ativa invisibilidade (Dimensional Drift). |
| `abilityVisibleAgain` | `{ code }` | Termina invisibilidade. |
| `abilityUltEnd` | `{ code, pos }` | Ult terminou — emite som posicional ao adversário. |

### Eventos Servidor → Cliente

| Evento | Para quem | Conteúdo |
|---|---|---|
| `lobbyCreated` | Criador | `{ code }` |
| `playerJoined` | Ambos | Lista atualizada de jogadores |
| `gameStarting` | Ambos | `{ players, code }` |
| `roundStart` | Cada um individualmente | `{ round, credits, myRoundsWon, enemyRoundsWon }` |
| `playPhase` | Ambos | `{ round }` — fase de compra terminou, combate começa |
| `roundOver` | Cada um individualmente | `{ winnerNick, myRoundsWon, enemyRoundsWon, creditsGained, newCredits }` |
| `matchOver` | Ambos | `{ winnerNick, scores }` |
| `youWereHit` | Vítima | `{ damage, zone, remainingHp, remainingShield }` |
| `enemyHpUpdate` | Atirador | `{ hp, shield }` — estado atual do adversário |
| `shieldUpdate` | Comprador | `{ shield }` — escudo atual |
| `killCredits` | Atirador | `{ gained, total }` — bónus de 200cr por kill |
| `enemyMove` | Adversário | Posição e rotação |
| `enemyWeaponChange` | Adversário | `{ weaponId }` |
| `errorLobby` | Solicitante | Mensagem de erro |

---

### Constantes do servidor

```js
const BUY_DURATION        = 15_000;  // 15 s de fase de compra
const ROUND_DURATION      = 90_000;  // 90 s por ronda
const BETWEEN_ROUND_DELAY =  4_000;  // 4 s entre rondas
const WIN_CREDITS         =  3_000;
const LOSE_CREDITS        =  1_900;
const KILL_CREDITS        =    200;
const STARTING_CREDITS    =    800;
const MAX_CREDITS         =  9_000;
const WINS_TO_WIN         =      3;  // Melhor de 5
```

### Constantes do cliente

```js
const PLAYER_SPEED  = 0.15;   // unidades por frame
const PLAYER_HEIGHT = 1.7;    // altura dos olhos
const GRAVITY       = -0.015;
const JUMP_FORCE    = 0.35;
const MAP_SIZE      = 200;    // mapa 200×200 unidades
const BUY_TIME      = 15;     // contador UI da fase de compra
```

---

### Fases do jogo

```
"waiting"     → lobby aberto, à espera de 2 jogadores
"starting"    → ambos prontos, delay de 1.5 s antes da 1ª ronda
"buy"         → 15 s para comprar arma e escudo (loja abre automaticamente)
"game"        → combate ativo, 90 s máximo
"round_over"  → ronda terminou, 4 s antes da próxima
"ended"       → partida terminada (alguém ganhou 3 rondas)
```

---

### Armas disponíveis

| ID | Nome | Dano | Carregador | Preço | Auto |
|---|---|---|---|---|---|
| `classic` | Classic | 26 | 12 | Grátis | Não |
| `frenzy` | Frenzy | 20 | 13 | 450 cr | Sim |
| `ghost` | Ghost | 30 | 15 | 500 cr | Não |
| `sheriff` | Sheriff | 55 | 6 | 800 cr | Não |
| `vandal` | Vandal | 40 | 25 | 2900 cr | Sim |
| `phantom` | Phantom | 35 | 30 | 2900 cr | Sim |
| `operator` | Operator | 150 | 5 | 4700 cr | Não |

Dano por zona: **Cabeça** = dano × 2.5 · **Corpo** = dano · **Perna** = dano × 0.75

---

### Sistema de escudo

O escudo absorve 33% de cada bala. O restante vai sempre para o HP.

```
damage_absorbido = min(escudo_atual, round(damage * 0.33))
novo_escudo      = escudo_atual - damage_absorbido
hp_damage        = damage - damage_absorbido
```

| Escudo | Preço |
|---|---|
| Escudo Leve (+25) | 400 cr |
| Escudo Pesado (+50) | 1000 cr |

---

### Habilidades de Yoru

| Tecla | Nome | Descrição |
|---|---|---|
| `Q` | Blindside | Lança uma flash orb que explode ao atingir superfície. Cega quem estiver no campo de visão sem obstáculos. 2 cargas. |
| `E` | Gatecrash | Coloca marcador de teleporte com raycast. Segunda ativação teleporta para lá. Cooldown de 35 s. |
| `C` | Fakeout | Lança um clone que caminha em frente durante 3 s. 2 cargas. |
| `X` | Dimensional Drift | Ult — Yoru torna-se invisível por 10 s. Acumula 7 pontos (1 por kill). |

---

### Fluxo de um disparo

```
Jogador A clica (ou segura para armas auto)
  └─► raycast da câmara para o centro do ecrã
        └─► acerta no modelo do adversário a < 80 unidades
              └─► socket.emit("playerHit", { damage, shooter, zone })
                    └─► servidor aplica escudo e reduz HP
                          ├─► emit("youWereHit", {...}) → Jogador B
                          ├─► emit("enemyHpUpdate", {...}) → Jogador A
                          └─► emit("killCredits", {...}) → Jogador A  (se kill)
```

---

### Modelo do adversário

```
Group (enemy)
  ├─ torso     BoxGeometry(0.6 × 0.9 × 0.35)
  ├─ head      BoxGeometry(0.45 × 0.45 × 0.45)
  ├─ armL      Group → Mesh
  ├─ armR      Group → Mesh  ← arma 3ª pessoa anexada aqui
  ├─ legL      Group → Mesh
  ├─ legR      Group → Mesh
  └─ Sprite    Nameplate (canvas 2D)
```

- Host vê adversário a **vermelho** (`0xee4444`)
- Guest vê adversário a **azul** (`0x4488ff`)

---

### Modelos de armas

`makeWeaponMesh(weaponId)` constrói cada arma com `BoxGeometry` e `CylinderGeometry`. Cada arma tem peças distintas: corpo, cano, guarda-mão, punho, coronha, mira dianteira, mira traseira, e detalhes específicos (supressor, gas tube, bipé, luneta, etc.).

**Arma 1ª pessoa** — filho da câmara com `depthTest=false, renderOrder=999` → sempre visível sobre a geometria do mundo.  
**Arma 3ª pessoa** — anexada ao `armR` do modelo do adversário com `scale=0.80`.

A animação de recarga (`getReloadOffsets`) é única por arma:
- **Pistolas** — inclinação para baixo + ligeiro roll
- **Sheriff** — inclinação acentuada + abertura lateral (estilo revólver)
- **Vandal** — inclina + rotação de charging handle no meio da animação
- **Phantom** — inclina + charging handle mais suave
- **Operator** — inclina muito + puxão de bolt lento

---

### Spawns

```js
const isHost = players[0] === myNick;
const spawn       = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
const enemySpawn  = isHost ? { x: 80,  z: 80  } : { x: -80, z: -80 };
```

Os dois jogadores aparecem em cantos opostos do mapa 200×200.

---

### Desconexão

Quando um jogador desconecta durante uma partida, o outro vence automaticamente via `matchOver`. Se o lobby ficar vazio, é removido. Todos os timers (buy, round, betweenRound) são limpos.
