import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import * as THREE from "three";
import confetti from "canvas-confetti";
import { useNotification } from "../context/NotificationContext.jsx";

const PLAYER_SPEED  = 0.15;
const PLAYER_HEIGHT = 1.7;
const GRAVITY       = -0.015;
const JUMP_FORCE    = 0.35;
const MAP_SIZE      = 200;
const BOX_W         = 8;
const BOX_H         = 5;
const BOX_D         = 8;

function Jogo() {
  const mountRef  = useRef(null);
  const gameRef   = useRef({});
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useUser();
  const { notifyError } = useNotification();
  const socket    = useSocket();

  const players   = location.state?.players || [user?.nick, "Adversário"];
  const myNick    = user?.nick;
  const enemyNick = players.find(p => p !== myNick) || "Adversário";
  const isHost    = players[0] === myNick;
  const lobbyCode = location.state?.lobbyCode || location.state?.code || "";

  const [hp, setHp]                     = useState(100);
  const [enemyHp, setEnemyHp]           = useState(100);
  const [ammo, setAmmo]                 = useState(30);
  const [crosshairRed, setCrosshairRed] = useState(false);
  const [phase, setPhase]               = useState("game");


  useEffect(() => {
    if(!user) {
      notifyError("Estás numa página onde não deverias estar");
      navigate("/");
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("enemyMove", ({ x, y, z, yaw }) => {
      const g = gameRef.current;
      if (!g.enemy) return;
      g.enemy.position.set(x, y, z);
      g.enemy.rotation.y = yaw + Math.PI;
    });

    socket.on("youWereHit", ({ damage }) => {
      const g = gameRef.current;
      g.hp = Math.max(0, (g.hp ?? 100) - damage);
      setHp(g.hp);
      if (g.hp <= 0) setPhase("lose");
    });

    socket.on("enemyHpUpdate", ({ hp }) => {
      setEnemyHp(hp);
      if (hp <= 0) setPhase("win");
    });

    return () => {
      socket.off("enemyMove");
      socket.off("youWereHit");
      socket.off("enemyHpUpdate");
    };
  }, [socket]);

  useEffect(() => {
    if (phase !== "game") return;
    const el = mountRef.current;
    if (!el) return;
    const g = gameRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.007);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    renderer.domElement.requestPointerLock();

    const camera = new THREE.PerspectiveCamera(80, el.clientWidth / el.clientHeight, 0.05, 600);
    const spawn = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
    g.pos      = { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z };
    g.vel      = { y: 0 };
    g.yaw      = 0;
    g.pitch    = 0;
    g.onGround = true;
    g.ammo     = 30;
    g.hp       = 100;
    g.lastShot = 0;
    camera.position.set(g.pos.x, g.pos.y, g.pos.z);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(40, 80, 40);
    sun.castShadow = true;
    scene.add(sun);

    g.collidables = buildArena(scene);

    const enemyColor = isHost ? 0xee4444 : 0x4488ff;
    const enemy = new THREE.Group();

    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.9, 0.35),
        new THREE.MeshLambertMaterial({ color: enemyColor })
    );
    torso.position.y = 1.05;
    enemy.add(torso);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.45, 0.45),
        new THREE.MeshLambertMaterial({ color: 0xffccaa })
    );
    head.position.y = 1.72;
    enemy.add(head);

    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x222244 });
    [-0.17, 0.17].forEach(ox => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, 0.35, 0);
      enemy.add(leg);
    });

    const enemySpawn = isHost ? { x: 80, z: 80 } : { x: -80, z: -80 };
    enemy.position.set(enemySpawn.x, 0, enemySpawn.z);
    scene.add(enemy);
    g.enemy     = enemy;
    g.enemyHead = head;

    const nc = document.createElement("canvas");
    nc.width = 256; nc.height = 56;
    const nctx = nc.getContext("2d");
    nctx.fillStyle = "rgba(0,0,0,0.75)";
    nctx.fillRect(0, 0, 256, 56);
    nctx.font = "bold 26px sans-serif";
    nctx.fillStyle = "#fff";
    nctx.textAlign = "center";
    nctx.fillText(enemyNick, 128, 38);
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), transparent: true })
    );
    sprite.scale.set(1.8, 0.45, 1);
    sprite.position.y = 2.5;
    enemy.add(sprite);

    const keys = {};
    window.addEventListener("keydown", e => { keys[e.code] = true; });
    window.addEventListener("keyup",   e => { keys[e.code] = false; });

    renderer.domElement.addEventListener("click", () => {
      if (document.pointerLockElement !== renderer.domElement)
        renderer.domElement.requestPointerLock();
    });

    window.addEventListener("mousemove", e => {
      if (document.pointerLockElement !== renderer.domElement) return;
      g.yaw   -= e.movementX * 0.002;
      g.pitch -= e.movementY * 0.002;
      g.pitch  = Math.max(-1.3, Math.min(1.3, g.pitch));
    });

    window.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== renderer.domElement) return;
      shoot();
    });

    window.addEventListener("resize", () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });

    const shoot = () => {
      const now = Date.now();
      if (now - g.lastShot < 300) return;
      if (g.ammo <= 0)  return;
      g.lastShot = now;
      g.ammo--;
      setAmmo(g.ammo);

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObject(g.enemy, true);

      if (hits.length > 0 && hits[0].distance < 150) {
        setCrosshairRed(true);
        setTimeout(() => setCrosshairRed(false), 120);
        socket?.emit("playerHit", { code: lobbyCode, damage: 25, shooter: myNick });
      }

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const end = hits[0]?.point || camera.position.clone().addScaledVector(dir, 150);
      const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([camera.position.clone(), end]),
          new THREE.LineBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.75 })
      );
      scene.add(line);
      setTimeout(() => scene.remove(line), 60);
    };

    const resolveCollision = (px, pz, prevX, prevZ) => {
      const PR = 0.4;
      const playerBottom = g.pos.y - PLAYER_HEIGHT;
      const playerTop    = g.pos.y + PLAYER_HEIGHT * 0.5;

      for (const b of g.collidables) {
        if (playerTop < b.minY || playerBottom > b.maxY) continue;

        const inside =
            px + PR > b.minX && px - PR < b.maxX &&
            pz + PR > b.minZ && pz - PR < b.maxZ;

        if (!inside) continue;

        const solveX =
            !(prevX + PR > b.minX && prevX - PR < b.maxX &&
                pz + PR > b.minZ &&   pz - PR < b.maxZ);

        const solveZ =
            !(px + PR > b.minX && px - PR < b.maxX &&
                prevZ + PR > b.minZ && prevZ - PR < b.maxZ);

        if (solveX)       { px = prevX; }
        else if (solveZ)  { pz = prevZ; }
        else              { px = prevX; pz = prevZ; }
      }
      return { px, pz };
    };

    let animId;
    const loop = () => {
      animId = requestAnimationFrame(loop);

      const fwd   = new THREE.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
      const right = new THREE.Vector3( Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      let moving = false;

      const prevX = g.pos.x, prevZ = g.pos.z;
      let nx = g.pos.x, nz = g.pos.z;

      if (keys["KeyW"] || keys["ArrowUp"])    { nx += fwd.x * PLAYER_SPEED;   nz += fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyS"] || keys["ArrowDown"])  { nx -= fwd.x * PLAYER_SPEED;   nz -= fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyA"] || keys["ArrowLeft"])  { nx -= right.x * PLAYER_SPEED; nz -= right.z * PLAYER_SPEED; moving = true; }
      if (keys["KeyD"] || keys["ArrowRight"]) { nx += right.x * PLAYER_SPEED; nz += right.z * PLAYER_SPEED; moving = true; }

      if (keys["Space"] && g.onGround) { g.vel.y = JUMP_FORCE; g.onGround = false; }
      g.vel.y += GRAVITY;
      g.pos.y += g.vel.y;
      if (g.pos.y <= PLAYER_HEIGHT) { g.pos.y = PLAYER_HEIGHT; g.vel.y = 0; g.onGround = true; }

      const { px, pz } = resolveCollision(nx, nz, prevX, prevZ);
      g.pos.x = px;
      g.pos.z = pz;

      const half = MAP_SIZE / 2 - 1;
      g.pos.x = Math.max(-half, Math.min(half, g.pos.x));
      g.pos.z = Math.max(-half, Math.min(half, g.pos.z));

      camera.position.set(g.pos.x, g.pos.y, g.pos.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = g.yaw;
      camera.rotation.x = g.pitch;

      socket?.emit("move", {
        code: lobbyCode,
        x: g.pos.x,
        y: g.pos.y - PLAYER_HEIGHT,
        z: g.pos.z,
        yaw:   g.yaw,
        pitch: g.pitch,
        moving,
      });

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(animId);
      document.exitPointerLock();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [phase]);

  if (phase === "win")  return <EndScreen win={true}  onExit={() => navigate("/perfil")} />;
  if (phase === "lose") return <EndScreen win={false} onExit={() => navigate("/perfil")} />;

  return (
      <div className="relative w-screen h-screen overflow-hidden bg-black">
        <div ref={mountRef} className="w-full h-full" />


        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <line x1="12" y1="2"  x2="12" y2="10" stroke={crosshairRed ? "#f44" : "white"} strokeWidth="2" />
            <line x1="12" y1="14" x2="12" y2="22" stroke={crosshairRed ? "#f44" : "white"} strokeWidth="2" />
            <line x1="2"  y1="12" x2="10" y2="12" stroke={crosshairRed ? "#f44" : "white"} strokeWidth="2" />
            <line x1="14" y1="12" x2="22" y2="12" stroke={crosshairRed ? "#f44" : "white"} strokeWidth="2" />
          </svg>
        </div>

        <div className="absolute top-3 left-3 z-30 font-mono text-white text-sm">
          <div className="bg-black/60 px-3 py-2 rounded-lg">
            <div className="text-gray-400 text-xs mb-1">{myNick}</div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">❤ {hp}</span>
              <div className="w-20 h-1.5 bg-gray-700 rounded-full">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${hp}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute top-3 right-3 z-30 font-mono text-white text-sm">
          <div className="bg-black/60 px-3 py-2 rounded-lg">
            <div className="text-gray-400 text-xs mb-1">{enemyNick}</div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">❤ {enemyHp}</span>
              <div className="w-20 h-1.5 bg-gray-700 rounded-full">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${enemyHp}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
          <div className="bg-black/60 px-5 py-2 rounded-xl font-mono text-white text-center">
            <div className="text-gray-400 text-xs">PISTOLA</div>
            <div className="text-xl font-bold">{ammo} <span className="text-sm text-gray-500">/ 30</span></div>
          </div>
        </div>


      </div>
  );
}

function buildArena(scene) {
  const half = MAP_SIZE / 2;
  const collidables = [];

  const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
      new THREE.MeshLambertMaterial({ color: 0x2a2a3a })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(MAP_SIZE, 80, 0x444466, 0x333355));

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
  const WALL_H = 18;
  [
    [MAP_SIZE + 2, WALL_H, 2,  0,    WALL_H / 2, -half],
    [MAP_SIZE + 2, WALL_H, 2,  0,    WALL_H / 2,  half],
    [2, WALL_H, MAP_SIZE + 2, -half, WALL_H / 2,  0   ],
    [2, WALL_H, MAP_SIZE + 2,  half, WALL_H / 2,  0   ],
  ].forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    scene.add(m);
    collidables.push({ minX: x-w/2, maxX: x+w/2, minY: y-h/2, maxY: y+h/2, minZ: z-d/2, maxZ: z+d/2 });
  });

  const boxMat = new THREE.MeshLambertMaterial({ color: 0x7a4d2a });
  const boxGeo = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);

  const positions = [];
  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      if (Math.abs(gx) + Math.abs(gz) < 2) continue;
      if (Math.abs(gx) >= 4 && Math.abs(gz) >= 4) continue;
      const x = gx * 22 + (Math.random() * 8 - 4);
      const z = gz * 22 + (Math.random() * 8 - 4);
      if (Math.abs(x) > half - 10 || Math.abs(z) > half - 10) continue;
      positions.push({ x, z });
    }
  }

  positions.forEach(({ x, z }) => {
    const y = BOX_H / 2;
    const m = new THREE.Mesh(boxGeo, boxMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    collidables.push({
      minX: x - BOX_W / 2, maxX: x + BOX_W / 2,
      minY: 0,              maxY: BOX_H,
      minZ: z - BOX_D / 2, maxZ: z + BOX_D / 2,
    });
  });

  return collidables;
}

function EndScreen({ win, onExit }) {
  useEffect(() => {
    const audio = new Audio(win ? "/Vitoria.mp3" : "/Derrota.mp3");
    audio.volume = 0.7;
    audio.play();
    if (win) {
      const end = Date.now() + 3000;
      const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"];
      const frame = () => {
        confetti({ particleCount: 6, angle: 60,  spread: 55,origin: { x: Math.random(), y: 0 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    } else {
      const end = Date.now() + 3000;
      const frame = () => {
        confetti({
          particleCount: 8,
          angle: 90,
          spread: 120,
          origin: { x: Math.random(), y: 0 },
          colors: ["#555", "#777", "#999", "#333"],
          gravity: 0.4,
          scalar: 1.4,
          drift: 0,
          shapes: ["square"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
    return () => {
      audio.pause();
      audio.currentTime = 0;
      confetti.reset();
    }
  }, []);

  return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-8 ${win ? "bg-black" : "bg-gray-950"}`}>
        <div className={`text-6xl font-bold font-mono ${win ? "text-yellow-400" : "text-gray-400"}`}>
          {win ? "VITÓRIA" : "ELIMINADO"}
        </div>
        <button onClick={onExit}
                className="px-10 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-lg font-mono transition-all hover:scale-105">
          Voltar
        </button>
      </div>
  );
}

export default Jogo;