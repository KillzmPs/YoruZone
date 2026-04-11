import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import * as THREE from "three";

const PLAYER_SPEED  = 0.13;
const PLAYER_HEIGHT = 1.7;
const GRAVITY       = -0.018;
const JUMP_FORCE    = 0.32;
const MAP_SIZE      = 200;

function Jogo() {
  const mountRef  = useRef(null);
  const gameRef   = useRef({});
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useUser();
  const socket    = useSocket();

  const players   = location.state?.players || [user?.nick, "Adversário"];
  const myNick    = user?.nick;
  const enemyNick = players.find(p => p !== myNick) || "Adversário";
  const isHost    = players[0] === myNick;
  const lobbyCode = location.state?.lobbyCode || location.state?.code || "";

  const [hp, setHp]           = useState(100);
  const [enemyHp, setEnemyHp] = useState(100);
  const [ammo, setAmmo]       = useState(30);
  const [hitFlash, setHitFlash]         = useState(false);
  const [crosshairRed, setCrosshairRed] = useState(false);
  const [phase, setPhase]     = useState("game");
  const notifRef = useRef(null);

  const notify = (msg, dur = 2000) => {
    if (notifRef.current) notifRef.current.textContent = msg;
    setTimeout(() => { if (notifRef.current) notifRef.current.textContent = ""; }, dur);
  };

  useEffect(() => {
    if (!socket) return;

    socket.on("enemyMove", ({ x, y, z, yaw, pitch, moving }) => {
      const g = gameRef.current;
      if (!g.enemy) return;
      g.enemy.position.set(x, y, z);
      g.enemy.rotation.y = yaw + Math.PI;
      if (g.enemyHead) g.enemyHead.rotation.x = pitch * 0.6;
      g.enemyMoving = moving;
    });

    socket.on("youWereHit", ({ damage }) => {
      const g = gameRef.current;
      g.hp = Math.max(0, (g.hp ?? 100) - damage);
      setHp(g.hp);
      setHitFlash(true);
      setTimeout(() => setHitFlash(false), 180);
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
    g.scene = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    g.renderer = renderer;

    renderer.domElement.requestPointerLock();

    const camera = new THREE.PerspectiveCamera(80, el.clientWidth / el.clientHeight, 0.05, 600);
    const spawn = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
    g.pos   = { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z };
    g.vel   = { y: 0 };
    g.yaw   = 0;
    g.pitch = 0;
    g.onGround = true;
    g.ammo  = 30;
    g.hp    = 100;
    g.lastShot = 0;
    camera.position.set(g.pos.x, g.pos.y, g.pos.z);
    g.camera = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(30, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 200;
    sun.shadow.camera.left   = -60;
    sun.shadow.camera.right  =  60;
    sun.shadow.camera.top    =  60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);

    g.collidables = buildArena(scene);

    const enemyColor = isHost ? 0xee4444 : 0x4488ff;
    const enemy = new THREE.Group();

    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.35),
        new THREE.MeshLambertMaterial({ color: enemyColor })
    );
    torso.position.y = 1.1;
    torso.castShadow = true;
    enemy.add(torso);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.45, 0.45),
        new THREE.MeshLambertMaterial({ color: 0xffccaa })
    );
    head.position.y = 1.72;
    head.castShadow = true;
    enemy.add(head);

    const armGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
    const armMat = new THREE.MeshLambertMaterial({ color: enemyColor });
    const lArm = new THREE.Group(), rArm = new THREE.Group();
    [lArm, rArm].forEach((a, i) => {
      const m = new THREE.Mesh(armGeo, armMat);
      m.position.y = -0.27;
      a.add(m);
      a.position.set(i === 0 ? -0.4 : 0.4, 1.45, 0);
      enemy.add(a);
    });

    const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x222244 });
    const lLeg = new THREE.Group(), rLeg = new THREE.Group();
    [lLeg, rLeg].forEach((l, i) => {
      const m = new THREE.Mesh(legGeo, legMat);
      m.position.y = -0.32;
      l.add(m);
      l.position.set(i === 0 ? -0.17 : 0.17, 0.68, 0);
      enemy.add(l);
    });

    const enemySpawn = isHost ? { x: 80, z: 80 } : { x: -80, z: -80 };
    enemy.position.set(enemySpawn.x, 0, enemySpawn.z);
    scene.add(enemy);

    g.enemy     = enemy;
    g.enemyHead = head;
    g.lArm = lArm; g.rArm = rArm;
    g.lLeg = lLeg; g.rLeg = rLeg;
    g.enemyMoving = false;
    g.animT = 0;

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
    sprite.position.y = 2.4;
    enemy.add(sprite);

    const keys = {};
    const onKD = e => { keys[e.code] = true; };
    const onKU = e => { keys[e.code] = false; };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);

    const onCanvasClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    renderer.domElement.addEventListener("click", onCanvasClick);

    const onMM = e => {
      if (document.pointerLockElement !== renderer.domElement) return;
      g.yaw   -= e.movementX * 0.002;
      g.pitch -= e.movementY * 0.002;
      g.pitch  = Math.max(-1.3, Math.min(1.3, g.pitch));
    };
    window.addEventListener("mousemove", onMM);

    const onMD = e => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== renderer.domElement) return;
      shoot();
    };
    window.addEventListener("mousedown", onMD);

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const shoot = () => {
      const now = Date.now();
      if (now - g.lastShot < 300) return;
      if (g.ammo <= 0) { notify("Sem munição!"); return; }
      g.lastShot = now;
      g.ammo--;
      setAmmo(g.ammo);

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObject(g.enemy, true);

      if (hits.length > 0 && hits[0].distance < 80) {
        setCrosshairRed(true);
        setTimeout(() => setCrosshairRed(false), 120);
        socket?.emit("playerHit", {
          code: lobbyCode,
          damage: 25,
          shooter: myNick,
        });
      }

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const end = hits[0]?.point || camera.position.clone().addScaledVector(dir, 80);
      const geo = new THREE.BufferGeometry().setFromPoints([camera.position.clone(), end]);
      const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.75 })
      );
      scene.add(line);
      setTimeout(() => scene.remove(line), 60);
    };

    let animId;
    const loop = () => {
      animId = requestAnimationFrame(loop);

      const fwd   = new THREE.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
      const right = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      let moving = false;

      const prevX = g.pos.x;
      const prevZ = g.pos.z;

      if (keys["KeyW"] || keys["ArrowUp"])    { g.pos.x += fwd.x * PLAYER_SPEED;   g.pos.z += fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyS"] || keys["ArrowDown"])  { g.pos.x -= fwd.x * PLAYER_SPEED;   g.pos.z -= fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyA"] || keys["ArrowLeft"])  { g.pos.x -= right.x * PLAYER_SPEED; g.pos.z -= right.z * PLAYER_SPEED; moving = true; }
      if (keys["KeyD"] || keys["ArrowRight"]) { g.pos.x += right.x * PLAYER_SPEED; g.pos.z += right.z * PLAYER_SPEED; moving = true; }

      if (keys["Space"] && g.onGround) {
        g.vel.y = JUMP_FORCE;
        g.onGround = false;
      }

      g.vel.y += GRAVITY;
      g.pos.y += g.vel.y;
      if (g.pos.y <= PLAYER_HEIGHT) {
        g.pos.y = PLAYER_HEIGHT;
        g.vel.y = 0;
        g.onGround = true;
      }

      const PR = 0.4;
      const playerBottom = g.pos.y - PLAYER_HEIGHT;
      const playerTop    = g.pos.y + PLAYER_HEIGHT * 0.4;

      for (const b of (g.collidables || [])) {
        if (playerTop < b.minY || playerBottom > b.maxY) continue;

        const overlapNow =
            g.pos.x + PR > b.minX && g.pos.x - PR < b.maxX &&
            g.pos.z + PR > b.minZ && g.pos.z - PR < b.maxZ;

        if (!overlapNow) continue;

        const okRevertX =
            !(prevX + PR > b.minX && prevX - PR < b.maxX &&
                g.pos.z + PR > b.minZ && g.pos.z - PR < b.maxZ);

        const okRevertZ =
            !(g.pos.x + PR > b.minX && g.pos.x - PR < b.maxX &&
                prevZ + PR > b.minZ && prevZ - PR < b.maxZ);

        if (okRevertX) {
          g.pos.x = prevX;
        } else if (okRevertZ) {
          g.pos.z = prevZ;
        } else {
          g.pos.x = prevX;
          g.pos.z = prevZ;
        }
      }

      const h = MAP_SIZE / 2 - 1;
      g.pos.x = Math.max(-h, Math.min(h, g.pos.x));
      g.pos.z = Math.max(-h, Math.min(h, g.pos.z));

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

      if (g.enemyMoving) {
        g.animT += 0.14;
        const s = Math.sin(g.animT) * 0.55;
        g.lArm.rotation.x =  s; g.rArm.rotation.x = -s;
        g.lLeg.rotation.x = -s; g.rLeg.rotation.x =  s;
      } else {
        g.lArm.rotation.x *= 0.8; g.rArm.rotation.x *= 0.8;
        g.lLeg.rotation.x *= 0.8; g.rLeg.rotation.x *= 0.8;
      }

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mousedown", onMD);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      document.exitPointerLock();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [phase]);

  if (phase === "win")  return <EndScreen title="VITÓRIA"  onExit={() => navigate("/perfil")} />;
  if (phase === "lose") return <EndScreen title="ELIMINADO" onExit={() => navigate("/perfil")} />;

  return (
      <div className="relative w-screen h-screen overflow-hidden bg-black">
        <div ref={mountRef} className="w-full h-full" />

        {hitFlash && (
            <div className="absolute inset-0 pointer-events-none z-40"
                 style={{ boxShadow: "inset 0 0 80px 40px rgba(255,0,0,0.65)" }} />
        )}

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
    [MAP_SIZE + 2, WALL_H, 2,        0,          WALL_H / 2, -half],
    [MAP_SIZE + 2, WALL_H, 2,        0,          WALL_H / 2,  half],
    [2,        WALL_H, MAP_SIZE + 2, -half,      WALL_H / 2,  0   ],
    [2,        WALL_H, MAP_SIZE + 2,  half,      WALL_H / 2,  0   ],
  ].forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    scene.add(m);
  });

  const palette = [0x8b5e3c, 0x6b4423, 0xb07a40, 0x5a3e28, 0xa06030, 0x7a4d2a, 0x556677, 0x445566];
  const rnd = (a, b) => a + Math.random() * (b - a);

  const collidables = [];

  const box = (x, y, z, w, h, d) => {
    const mat = new THREE.MeshLambertMaterial({ color: palette[Math.floor(Math.random() * palette.length)] });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    collidables.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  };


  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      if (Math.abs(gx) + Math.abs(gz) < 2) continue;
      if (Math.abs(gx) >= 4 && Math.abs(gz) >= 4) continue;

      const x = gx * 22 + rnd(-4, 4);
      const z = gz * 22 + rnd(-4, 4);
      if (Math.abs(x) > half - 8 || Math.abs(z) > half - 8) continue;

      const r = Math.random();

      if (r < 0.25) {
        const w = rnd(5, 10);
        const h = rnd(3.5, 7);
        const d = rnd(5, 10);
        box(x, h / 2, z, w, h, d);

      } else if (r < 0.45) {
        const s = rnd(4, 7);
        const h = rnd(3, 6);
        box(x,       h / 2, z,       s * 2, h, s);
        box(x + s,   h / 2, z + s,   s,     h, s);

      } else if (r < 0.62) {
        const h = rnd(4, 9);
        const len = rnd(8, 18);
        const horiz = Math.random() > 0.5;
        box(x, h / 2, z, horiz ? len : 3, h, horiz ? 3 : len);

      } else if (r < 0.78) {
        const s = rnd(4, 7);
        const h1 = rnd(3, 5);
        const h2 = rnd(2.5, 4);
        box(x,         h1 / 2,           z,         s * 2, h1, s * 2);
        box(x,         h1 + h2 / 2,      z,         s,     h2, s    );

      } else if (r < 0.90) {
        const s = rnd(3.5, 6);
        const h = rnd(3.5, 6);
        box(x,         h / 2, z,         s * 2, h, s);
        box(x - s,     h / 2, z + s,     s,     h, s);
        box(x + s,     h / 2, z + s,     s,     h, s);

      } else {
        const s = rnd(2.5, 4.5);
        const h = rnd(2.5, 5);
        box(x,         h / 2, z,         s, h, s);
        box(x + s + 1, h / 2, z,         s, h * 0.7, s);
        box(x,         h / 2, z + s + 1, s, h * 0.8, s);
      }
    }
  }

  for (let i = 0; i < 18; i++) {
    const x = rnd(-half + 10, half - 10);
    const z = rnd(-half + 10, half - 10);
    if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
    const w = rnd(3, 6);
    const h = rnd(5, 12);
    box(x, h / 2, z, w, h, w);
  }

  return collidables;
}

function EndScreen({ title, onExit }) {
  return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-8">
        <div className="text-5xl font-bold text-white font-mono">{title}</div>
        <button onClick={onExit}
                className="px-10 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-lg font-mono transition-all hover:scale-105">
          Voltar
        </button>
      </div>
  );
}

export default Jogo;