# YoruZone

Jogo  (FPS) com dois jogadores, com renderização 3D via Three.js e comunicação em tempo real via Socket.IO.

### Estado

```js
const lobbies = {};
```

Um objeto que guarda todos os lobbies ativos. Cada lobby tem esta forma:

```js
lobbies["ABC123"] = {
  host: "socket-id-do-host",
  players: [{ nick, id }, { nick, id }],
  hps: { "socket-id": 100, "outro-id": 100 },
}
```

### Cliente Servidor

| Evento | Payload | Descrição |
|---|---|---|
| `createLobby` | `{ nick }` | Cria um novo lobby com código aleatório de 6 caracteres. O criador é marcado como host. |
| `joinLobby` | `{ code, nick }` | Entra num lobby existente. Falha se não existir ou estiver cheio (máx. 2 jogadores). |
| `startGame` | `{ code }` | O host inicia o jogo. Exige 2 jogadores na sala. |
| `move` | `{ code, x, y, z, yaw, pitch, moving }` | Posição e orientação do jogador. Retransmitida apenas ao outro jogador. |
| `playerHit` | `{ code, damage, shooter }` | O player comunica que acertou. O servidor identifica a vítima pelo nick e notifica-a. |

### Eventos

| Evento | Para quem | Conteúdo |
|---|---|---|
| `lobbyCreated` | Criador | `{ code }` — código do lobby |
| `playerJoined` | Ambos | Lista atualizada de jogadores |
| `gameStarting` | Ambos | `{ players, code }` — sinal de início |
| `enemyMove` | Adversário | Posição e rotação do outro jogador |
| `youWereHit` | Vítima | `{ damage }` — reduz o HP localmente |
| `enemyHpUpdate` | Jogador | `{ hp }` — HP atual do adversário |
| `errorLobby` | Solicitante | Mensagem de erro em texto |

### Fluxo de um disparo

```
Jogador A dispara
  └─► emit("playerHit", { damage: 25, shooter: "nickA" })
        └─► servidor encontra vítima (nickB)
              ├─► emit("youWereHit", { damage }) → Jogador B
              └─► emit("enemyHpUpdate", { hp }) → Jogador A
```

### Desconexão

Quando um jogador desconecta, o servidor remove-o do lobby. Se ficar vazio, o lobby é cancelado. Caso contrário, emite `playerJoined` com a lista atualizada.

### Estados locais

| Estado | Tipo | Função |
|---|---|---|
| `code` | string | Código digitado para entrar num lobby |
| `lobbyCode` | string | Código do lobby ativo |
| `players` | array | Lista de nicks na sala |
| `isHost` | bool | Se este jogador criou o lobby |
| `countdown` | number \| null | Contagem decrescente antes do jogo |
| `historico` | array | Partidas anteriores do jogador |

### Fluxo de criação de lobby

```
criarLobby()
  └─► socket.emit("createLobby", { nick })
        └─► socket.on("lobbyCreated") → guarda código, marca como host
```

### Fluxo de entrada

```
entrarLobby()
  └─► socket.emit("joinLobby", { code, nick })
        └─► socket.on("playerJoined") → atualiza lista de jogadores
```

### Início do jogo

Apenas o host vê o botão "Começar Jogo", e apenas quando há 2 jogadores. Ao clicar:

```
socket.emit("startGame", { code: lobbyCode })
  └─► socket.on("gameStarting") → startCountdown()
        └─► ao chegar a 0: navigate("/jogo", { state: { players, lobbyCode } })
```

A contagem decrescente corre em ambos os clientes em simultâneo.

---

### Constantes físicas

```js
const PLAYER_SPEED  = 0.13;  // unidades por frame
const PLAYER_HEIGHT = 1.7;   // altura dos olhos
const GRAVITY       = -0.018;
const JUMP_FORCE    = 0.32;
const MAP_SIZE      = 200;   // mapa 200×200 unidades
```


### Spawn dos jogadores

```js
const isHost = players[0] === myNick;
const spawn  = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
```

Os dois jogadores aparecem em cantos opostos do mapa.

---

**1. Movimento do jogador**
- `W/S/A/D` ou teclas de seta movem o jogador na direção da câmara.
- `Space` aplica `JUMP_FORCE` se estiver no chão.

**2. Mouse look**
- `mousemove` com Pointer Lock ajusta `g.yaw` (horizontal) e `g.pitch` (vertical).

**3. Emissão de movimento**
A cada frame, envia a posição atual ao servidor:
```js
socket.emit("move", { code, x, y, z, yaw, pitch, moving });
```

**4. Animação do adversário**
Quando `g.enemyMoving` é `true`, os braços e pernas do modelo 3D oscilam com `Math.sin`.

---

### Disparar

```js
const shoot = () => {
  // cooldown de 300ms entre tiros
  // raycasting da câmara para o centro do ecrã
  // se acertar no modelo do adversário a menos de 80 unidades:
  // socket.emit("playerHit", { damage: 25, shooter: myNick })
  // desenha um tracer amarelo por 60ms
}
```

O raycasting usa `THREE.Raycaster` apontado ao centro exato do ecrã `(0, 0)`. O dano é sempre 25 — são precisos 4 tiros para eliminar um adversário (HP = 100).

O crosshair fica vermelho durante 120ms quando o tiro acerta.

---

### Modelo do Adversário

Construído com `THREE.Group` e geometrias `BoxGeometry`:

```
Group (enemy)
  ├─ torso     (0.6 × 0.8 × 0.35)
  ├─ head      (0.45 × 0.45 × 0.45)
  ├─ lArm      (Group com Mesh)
  ├─ rArm      (Group com Mesh)
  ├─ lLeg      (Group com Mesh)
  ├─ rLeg      (Group com Mesh)
  └─ Sprite    (nameplate com canvas 2D)
```

A cor do torso e braços varia consoante quem é o host:
- Host vê o adversário a **vermelho** (`0xee4444`)
- Guest vê o adversário a **azul** (`0x4488ff`)

---

### buildArena()

A função `buildArena` coloca estruturas numa grelha 8×8 com variação aleatória de posição. Existem 6 tipos de estrutura:

| Tipo | Probabilidade | Descrição |
|---|---|---|
| Bunker sólido | 25% | Bloco grande e alto |
| Forma em L | 20% | Dois blocos em ângulo reto |
| Muro / barreira | 17% | Parede longa e estreita |
| Plataforma de dois níveis | 16% | Bloco largo com bloco mais pequeno em cima |
| Forte em U | 12% | Três blocos formando uma curva |
| Cluster de caixotes | 10% | Grupo de 3 caixotes dispersos |

Adicionalmente, 18 pilares/torres são colocados aleatoriamente pelo mapa. O centro e as zonas de spawn ficam livres de obstáculos.
---

### Fases do Jogo

```js
const [phase, setPhase] = useState("game"); // "game" | "win" | "lose"
```

- `"win"` — quando `enemyHpUpdate` chega com `hp <= 0`
- `"lose"` — quando `youWereHit` reduz o HP próprio a 0

Ambas as fases exibem o componente `<EndScreen>` com o título "VITÓRIA" ou "ELIMINADO" e um botão para voltar ao perfil.
