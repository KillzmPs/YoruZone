import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import * as THREE from "three";
import confetti from "canvas-confetti";
import { useNotification } from "../context/NotificationContext.jsx";

const WEAPONS = {
  classic:  { name: "Classic",  damage: 26,  fireRate: 400,  maxAmmo: 12, reload: 1500, recoil: 0.018, price: 0,    color: "#aaaaaa", auto: false, desc: "Pistola base"              },
  frenzy:   { name: "Frenzy",   damage: 20,  fireRate: 105,  maxAmmo: 13, reload: 1400, recoil: 0.042, price: 450,  color: "#ff8844", auto: true,  desc: "Pistola totalmente auto"   },
  ghost:    { name: "Ghost",    damage: 30,  fireRate: 350,  maxAmmo: 15, reload: 1200, recoil: 0.022, price: 500,  color: "#88aacc", auto: false, desc: "Pistola silenciosa"         },
  sheriff:  { name: "Sheriff",  damage: 55,  fireRate: 750,  maxAmmo: 6,  reload: 2200, recoil: 0.055, price: 800,  color: "#ffcc44", auto: false, desc: "Pistola semi-auto potente"  },
  vandal:   { name: "Vandal",   damage: 40,  fireRate: 250,  maxAmmo: 25, reload: 2500, recoil: 0.065, price: 2900, color: "#dd4422", auto: true,  desc: "Rifle automático"           },
  phantom:  { name: "Phantom",  damage: 35,  fireRate: 200,  maxAmmo: 30, reload: 2300, recoil: 0.048, price: 2900, color: "#4488dd", auto: true,  desc: "Rifle silencioso"           },
  operator: { name: "Operator", damage: 150, fireRate: 1500, maxAmmo: 5,  reload: 3500, recoil: 0.008, price: 4700, color: "#ffcc44", auto: false, desc: "Sniper (1-shot kill)"       },
};

const PLAYER_SPEED  = 0.15;
const PLAYER_HEIGHT = 1.7;
const GRAVITY       = -0.015;
const JUMP_FORCE    = 0.35;
const MAP_SIZE      = 200;
const BOX_W = 8, BOX_H = 5, BOX_D = 8;
const MAX_CREDITS   = 9_000;
const BUY_TIME      = 15;
const API_URL       = "https://yoru-zone-ivbq.vercel.app";

function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playGunshot(ctx, weaponId) {
  if (!ctx || ctx.state === "suspended") return;
  const cfg = {
    classic:  { freq: 900,  decay: 35, vol: 0.28, dur: 0.12 },
    frenzy:   { freq: 1100, decay: 42, vol: 0.20, dur: 0.08 },
    ghost:    { freq: 600,  decay: 40, vol: 0.16, dur: 0.10 },
    sheriff:  { freq: 650,  decay: 18, vol: 0.42, dur: 0.18 },
    vandal:   { freq: 1200, decay: 30, vol: 0.32, dur: 0.11 },
    phantom:  { freq: 500,  decay: 45, vol: 0.14, dur: 0.09 },
    operator: { freq: 160,  decay: 10, vol: 0.50, dur: 0.30 },
  }[weaponId] || { freq: 900, decay: 35, vol: 0.28, dur: 0.12 };

  const bufLen = Math.ceil(ctx.sampleRate * cfg.dur);
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * cfg.decay);
  }

  const src    = ctx.createBufferSource(); src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass"; filter.frequency.value = cfg.freq; filter.Q.value = 0.7;
  const gain = ctx.createGain(); gain.gain.value = cfg.vol;

  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start();
}

function playFootstep(ctx, exPos, listenerPos) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const dx   = exPos.x - listenerPos.x;
  const dz   = exPos.z - listenerPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 120) return;

  const bufLen = Math.ceil(ctx.sampleRate * 0.065);
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 110) * 0.55;
  }

  const src    = ctx.createBufferSource(); src.buffer = buf;
  const panner = ctx.createPanner();
  panner.panningModel  = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance   = 4;
  panner.maxDistance   = 120;
  panner.rolloffFactor = 1.2;
  panner.positionX.value = exPos.x;
  panner.positionY.value = exPos.y ?? 1.0;
  panner.positionZ.value = exPos.z;

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = Math.max(200, 2200 - dist * 16);

  src.connect(lpf); lpf.connect(panner); panner.connect(ctx.destination);
  src.start();
}

function isInFlashCone(camera, explosionPos, halfAngleDeg = 90) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const toFlash = new THREE.Vector3()
    .subVectors(explosionPos, camera.position)
    .normalize();
  const dot = camDir.dot(toFlash);
  return dot > Math.cos((halfAngleDeg * Math.PI) / 180);
}

function playOwnFootstep(ctx) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const bufLen = Math.ceil(ctx.sampleRate * 0.05);
  const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 130) * 0.38;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 280;
  const g = ctx.createGain(); g.gain.value = 0.18;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start();
}

function playUltEndSound(ctx, positional, pos) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const sampleRate = ctx.sampleRate;

  const boomLen = Math.ceil(sampleRate * 0.55);
  const boomBuf = ctx.createBuffer(1, boomLen, sampleRate);
  const boomData = boomBuf.getChannelData(0);
  for (let i = 0; i < boomLen; i++) {
    const t = i / sampleRate;
    boomData[i] = ((Math.random() * 2 - 1) * 0.65 + Math.sin(t * 2 * Math.PI * 58) * 0.35) * Math.exp(-t * 8);
  }
  const boomSrc = ctx.createBufferSource(); boomSrc.buffer = boomBuf;
  const boomLpf = ctx.createBiquadFilter(); boomLpf.type = "lowpass"; boomLpf.frequency.value = 260;
  const boomGain = ctx.createGain(); boomGain.gain.value = positional ? 3.2 : 2.0;

  const crackLen = Math.ceil(sampleRate * 0.09);
  const crackBuf = ctx.createBuffer(1, crackLen, sampleRate);
  const crackData = crackBuf.getChannelData(0);
  for (let i = 0; i < crackLen; i++) {
    const t = i / sampleRate;
    crackData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 90);
  }
  const crackSrc = ctx.createBufferSource(); crackSrc.buffer = crackBuf;
  const crackBpf = ctx.createBiquadFilter(); crackBpf.type = "bandpass"; crackBpf.frequency.value = 3800; crackBpf.Q.value = 0.35;
  const crackGain = ctx.createGain(); crackGain.gain.value = positional ? 2.8 : 1.6;

  if (positional && pos) {
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "inverse";
    panner.refDistance = 5; panner.maxDistance = 260; panner.rolloffFactor = 0.55;
    panner.positionX.value = pos.x; panner.positionY.value = pos.y ?? 1.7; panner.positionZ.value = pos.z;
    boomSrc.connect(boomLpf);  boomLpf.connect(boomGain);  boomGain.connect(panner);
    crackSrc.connect(crackBpf); crackBpf.connect(crackGain); crackGain.connect(panner);
    panner.connect(ctx.destination);
  } else {
    boomSrc.connect(boomLpf);  boomLpf.connect(boomGain);  boomGain.connect(ctx.destination);
    crackSrc.connect(crackBpf); crackBpf.connect(crackGain); crackGain.connect(ctx.destination);
  }
  boomSrc.start(); crackSrc.start();
}

function playReloadSound(ctx) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  [0, 0.13, 0.38].forEach(delay => {
    const bufLen = Math.ceil(ctx.sampleRate * 0.045);
    const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 220) * 0.38;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  });
}

function spawnFlashBurst(scene, pos) {
  const light = new THREE.PointLight(0xffffff, 10, 22);
  light.position.copy(pos);
  scene.add(light);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  sphere.position.copy(pos);
  scene.add(sphere);
  setTimeout(() => { scene.remove(light); scene.remove(sphere); }, 140);
}

function makePlayerMesh(color) {
  const root = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.9, 0.35),
    new THREE.MeshLambertMaterial({ color })
  );
  torso.position.y = 1.05;
  root.add(torso);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.45),
    new THREE.MeshLambertMaterial({ color: 0xffccaa })
  );
  head.position.y = 1.72;
  root.add(head);

  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x222244 });
  torso.userData.zone = "body";
  head.userData.zone  = "head";

  const legL = new THREE.Group(); legL.position.set(-0.17, 0.7, 0); root.add(legL);
  const legLm = new THREE.Mesh(legGeo, legMat); legLm.position.y = -0.35; legLm.userData.zone = "leg"; legL.add(legLm);
  const legR = new THREE.Group(); legR.position.set( 0.17, 0.7, 0); root.add(legR);
  const legRm = new THREE.Mesh(legGeo, legMat); legRm.position.y = -0.35; legRm.userData.zone = "leg"; legR.add(legRm);

  const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
  const armMat = new THREE.MeshLambertMaterial({ color });
  const armL = new THREE.Group(); armL.position.set(-0.42, 1.4, 0); root.add(armL);
  const armLm = new THREE.Mesh(armGeo, armMat); armLm.position.y = -0.325; armLm.userData.zone = "body"; armL.add(armLm);
  const armR = new THREE.Group(); armR.position.set( 0.42, 1.4, 0); root.add(armR);
  const armRm = new THREE.Mesh(armGeo, armMat); armRm.position.y = -0.325; armRm.userData.zone = "body"; armR.add(armRm);

  root.userData.parts = { torso, head, legL, legR, armL, armR };
  root.userData.anim  = { walkCycle: 0, isMoving: false, isJumping: false };
  return root;
}

function animatePlayerMesh(mesh, isMoving, isJumping) {
  const { parts, anim } = mesh.userData;
  if (!parts || !anim) return;

  if (isJumping) {
    anim.walkCycle = 0;
    parts.legL.rotation.x += (-0.55 - parts.legL.rotation.x) * 0.18;
    parts.legR.rotation.x += (-0.55 - parts.legR.rotation.x) * 0.18;
    parts.armL.rotation.x += ( 0.50 - parts.armL.rotation.x) * 0.18;
    parts.armR.rotation.x += ( 0.50 - parts.armR.rotation.x) * 0.18;
    parts.torso.position.y += (1.10 - parts.torso.position.y) * 0.18;
    parts.head.position.y  += (1.80 - parts.head.position.y)  * 0.18;
  } else if (isMoving) {
    anim.walkCycle = (anim.walkCycle + 0.13) % (Math.PI * 2);
    const swing = Math.sin(anim.walkCycle) * 0.48;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.55;
    parts.armR.rotation.x =  swing * 0.55;
    const bob = Math.abs(Math.sin(anim.walkCycle)) * 0.045;
    parts.torso.position.y = 1.05 + bob;
    parts.head.position.y  = 1.72 + bob;
  } else {
    parts.legL.rotation.x *= 0.82;
    parts.legR.rotation.x *= 0.82;
    parts.armL.rotation.x *= 0.82;
    parts.armR.rotation.x *= 0.82;
    parts.torso.position.y += (1.05 - parts.torso.position.y) * 0.15;
    parts.head.position.y  += (1.72 - parts.head.position.y)  * 0.15;
    anim.walkCycle *= 0.9;
  }
  anim.isMoving  = isMoving;
  anim.isJumping = isJumping;
}

function getReloadOffsets(weaponId, p) {
  switch (weaponId) {
    case 'classic':
      return { rx: Math.sin(p * Math.PI) * 0.68, rz: -Math.sin(p * Math.PI) * 0.14, py: -Math.sin(p * Math.PI) * 0.036 };
    case 'frenzy': {
      const frantic = Math.sin(p * Math.PI * 4) * 0.18;
      return { rx: Math.sin(p * Math.PI) * 0.52, rz: frantic, py: 0 };
    }
    case 'ghost':
      return { rx: Math.sin(p * Math.PI) * 0.58, rz: Math.sin(p * Math.PI) * 0.10, py: -Math.sin(p * Math.PI) * 0.030 };
    case 'sheriff': {
      const flip = p > 0.28 && p < 0.72 ? Math.sin((p - 0.28) / 0.44 * Math.PI) * 0.68 : 0;
      return { rx: Math.sin(p * Math.PI) * 0.92, rz: flip, py: -Math.sin(p * Math.PI) * 0.042 };
    }
    case 'vandal': {
      const bolt = p > 0.35 && p < 0.65 ? Math.sin((p - 0.35) / 0.30 * Math.PI) * 0.34 : 0;
      return { rx: Math.sin(p * Math.PI) * 0.74, rz: bolt, py: -Math.sin(p * Math.PI) * 0.052 };
    }
    case 'phantom': {
      const ch = p > 0.40 && p < 0.70 ? Math.sin((p - 0.40) / 0.30 * Math.PI) * 0.26 : 0;
      return { rx: Math.sin(p * Math.PI) * 0.66, rz: ch, py: -Math.sin(p * Math.PI) * 0.046 };
    }
    case 'operator': {
      const boltPull = p > 0.22 && p < 0.60 ? Math.sin((p - 0.22) / 0.38 * Math.PI) * 0.65 : 0;
      return { rx: Math.sin(p * Math.PI) * 1.18, rz: boltPull, py: -Math.sin(p * Math.PI) * 0.072 };
    }
    default:
      return { rx: Math.sin(p * Math.PI) * 0.55, rz: Math.sin(p * Math.PI * 2) * 0.22, py: 0 };
  }
}

function makeWeaponMesh(weaponId) {
  const w = WEAPONS[weaponId] || WEAPONS.classic;
  const root = new THREE.Group();
  const ac = parseInt(w.color.replace('#', ''), 16);

  const bM  = new THREE.MeshLambertMaterial({ color: ac });
  const dkM = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const blM = new THREE.MeshLambertMaterial({ color: 0x080808 });
  const mtM = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const skM = new THREE.MeshLambertMaterial({ color: 0x2d2d2d });

  const bx = (ww, hh, dd, x, y, z, m = dkM) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), m);
    mesh.position.set(x, y, z); root.add(mesh);
  };
  const cy = (r, len, x, y, z, m = mtM) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); root.add(mesh);
  };

  switch (weaponId) {
    case 'classic':
      bx(0.058, 0.056, 0.26,  0,  0.012,  0,      bM);
      bx(0.052, 0.040, 0.20,  0, -0.020,  0.020,  dkM);
      bx(0.048, 0.145, 0.068, 0, -0.110,  0.082,  dkM);
      bx(0.036, 0.100, 0.046, 0, -0.125,  0.082,  blM);
      bx(0.010, 0.038, 0.062, 0, -0.060,  0.006,  blM);
      cy(0.013, 0.060,        0,  0.012, -0.158);

      bx(0.006, 0.022, 0.010, 0,  0.044, -0.125,  mtM);
      bx(0.044, 0.010, 0.012, 0,  0.038,  0.106,  mtM);
      bx(0.006, 0.018, 0.012,-0.018, 0.046, 0.106, mtM);
      bx(0.006, 0.018, 0.012, 0.018, 0.046, 0.106, mtM);

      bx(0.007, 0.030, 0.010, 0, -0.062,  0.014,  blM);
      bx(0.020, 0.016, 0.050, 0.030, 0.008, -0.020, blM);
      [-0.068,-0.082,-0.096].forEach(z => bx(0.060, 0.004, 0.007, 0, 0.038, z + 0.130, mtM));

      bx(0.022, 0.022, 0.008, 0, 0.012, -0.190, mtM);
      break;

    case 'frenzy':
      bx(0.064, 0.066, 0.17,  0,  0.006,  0,      bM);
      bx(0.056, 0.048, 0.12,  0, -0.024,  0.015,  dkM);
      bx(0.050, 0.130, 0.058, 0, -0.100,  0.048,  skM);
      bx(0.040, 0.110, 0.046, 0, -0.110,  0.048,  blM);
      bx(0.010, 0.034, 0.058, 0, -0.052,  0,      blM);
      cy(0.015, 0.040,        0,  0.006, -0.105);
      bx(0.032, 0.032, 0.048, 0,  0.006, -0.127,  blM);
      bx(0.034, 0.010, 0.012, 0,  0.028, -0.127,  mtM);
      bx(0.007, 0.026, 0.010, 0, -0.054,  0.002,  blM);
      bx(0.006, 0.020, 0.010, 0,  0.040, -0.090,  mtM);
      bx(0.014, 0.020, 0.012,-0.012, 0.042, 0.065, mtM);
      bx(0.014, 0.020, 0.012, 0.012, 0.042, 0.065, mtM);
      [-0.044,-0.058,-0.072,-0.086].forEach(z => bx(0.066, 0.004, 0.006, 0, 0.038, z+0.095, mtM));
      break;

    case 'ghost':
      bx(0.055, 0.054, 0.30,  0,  0.012,  0,      bM);
      bx(0.050, 0.038, 0.22,  0, -0.020,  0.020,  dkM);
      bx(0.048, 0.145, 0.068, 0, -0.112,  0.080,  dkM);
      bx(0.036, 0.100, 0.048, 0, -0.126,  0.080,  blM);
      bx(0.010, 0.038, 0.064, 0, -0.060,  0.006,  blM);
      cy(0.019, 0.135,        0,  0.012, -0.215);
      bx(0.042, 0.042, 0.138, 0,  0.012, -0.215,  blM);

      [-0.155,-0.182,-0.210,-0.238,-0.265].forEach(z => bx(0.044, 0.044, 0.004, 0, 0.012, z, mtM));
      bx(0.044, 0.044, 0.010, 0,  0.012, -0.282,  mtM);
      bx(0.007, 0.028, 0.010, 0, -0.060,  0.014,  blM);
      bx(0.006, 0.022, 0.010, 0,  0.050, -0.268,  mtM);
      bx(0.044, 0.010, 0.012, 0,  0.038,  0.106,  mtM);
      bx(0.006, 0.016, 0.012,-0.017, 0.046, 0.106, mtM);
      bx(0.006, 0.016, 0.012, 0.017, 0.046, 0.106, mtM);
      [-0.068,-0.082,-0.096].forEach(z => bx(0.057, 0.004, 0.007, 0, 0.037, z + 0.130, mtM));
      break;

    case 'sheriff':
      bx(0.062, 0.068, 0.34,  0,  0.014,  0,      bM);
      bx(0.055, 0.044, 0.25,  0, -0.024,  0.025,  dkM);
      bx(0.052, 0.155, 0.074, 0, -0.118,  0.085,  skM);
      bx(0.040, 0.110, 0.050, 0, -0.132,  0.085,  blM);
      bx(0.011, 0.042, 0.070, 0, -0.064,  0.006,  blM);
      bx(0.022, 0.018, 0.30,  0,  0.050,  0,      mtM);
      cy(0.014, 0.065,        0,  0.014, -0.205);
      bx(0.022, 0.022, 0.010, 0,  0.014, -0.240,  mtM);
      bx(0.008, 0.034, 0.012, 0, -0.064,  0.012,  blM);

      bx(0.012, 0.030, 0.014, 0,  0.060, -0.162,  mtM);
      bx(0.048, 0.012, 0.014, 0,  0.056,  0.124,  mtM);
      bx(0.008, 0.022, 0.014,-0.020, 0.066, 0.124, mtM);
      bx(0.008, 0.022, 0.014, 0.020, 0.066, 0.124, mtM);

      bx(0.014, 0.022, 0.018, 0, 0.054, 0.148, dkM);
      bx(0.014, 0.010, 0.024, 0, 0.044, 0.154, dkM);

      bx(0.052, 0.052, 0.062, 0, 0.012, 0.024, blM);
      bx(0.056, 0.014, 0.064, 0, 0.012, 0.024, mtM);
      break;

    case 'vandal':
      bx(0.063, 0.068, 0.46,  0,  0,     -0.040, dkM);
      bx(0.057, 0.052, 0.22,  0, -0.012, -0.270, bM);
      cy(0.016, 0.300,        0,  0.010, -0.370);
      bx(0.025, 0.018, 0.40,  0,  0.047, -0.080, mtM);
      bx(0.043, 0.135, 0.058, 0, -0.118,  0.100, skM);
      bx(0.050, 0.185, 0.055, 0, -0.152,  0.020, blM);
      bx(0.055, 0.058, 0.20,  0, -0.008,  0.250, dkM);
      bx(0.030, 0.030, 0.058, 0,  0.010, -0.540, mtM);

      cy(0.007, 0.270, 0, 0.038, -0.320);
      bx(0.018, 0.020, 0.028, 0.034, 0.008, -0.040, mtM);
      bx(0.010, 0.024, 0.014, 0, 0.048, 0.082, mtM);
      bx(0.012, 0.030, 0.012, 0, 0.028, -0.530, mtM);
      bx(0.028, 0.028, 0.022, 0, 0.028, -0.508, mtM);

      [-0.522,-0.538,-0.554].forEach(z => bx(0.032, 0.012, 0.008, 0, 0.012, z, blM));

      bx(0.058, 0.062, 0.008, 0, -0.008, 0.346, mtM);

      bx(0.055, 0.008, 0.240, 0, 0.036, -0.040, blM);
      break;

    case 'phantom':
      bx(0.060, 0.065, 0.50,  0,  0,     -0.020, dkM);
      cy(0.019, 0.365,        0,  0.008, -0.360);
      bx(0.040, 0.040, 0.368, 0,  0.008, -0.360, blM);
      [-0.308,-0.346,-0.385,-0.424,-0.463,-0.500].forEach(z => bx(0.042, 0.042, 0.004, 0, 0.008, z, mtM));
      bx(0.042, 0.042, 0.010, 0,  0.008, -0.540, mtM);
      bx(0.025, 0.017, 0.42,  0,  0.046, -0.040, mtM);
      bx(0.056, 0.048, 0.18,  0, -0.010, -0.240, bM);
      bx(0.043, 0.130, 0.055, 0, -0.116,  0.080, skM);
      bx(0.048, 0.185, 0.055, 0, -0.150,  0.040, blM);
      bx(0.055, 0.060, 0.18,  0, -0.008,  0.270, bM);

      cy(0.007, 0.210, 0, 0.038, -0.260);
      bx(0.018, 0.018, 0.026, 0.030, 0.010, -0.022, mtM);
      bx(0.010, 0.020, 0.012, 0, 0.047, 0.082, mtM);
      bx(0.058, 0.062, 0.008, 0, -0.008, 0.358, mtM);
      bx(0.055, 0.008, 0.220, 0, 0.036, -0.020, blM);

      bx(0.064, 0.020, 0.014, 0, 0.010, -0.132, mtM);
      break;

    case 'operator':
      bx(0.056, 0.062, 0.68,  0,  0,      0,     dkM);
      cy(0.014, 0.425,        0,  0.006, -0.555);
      bx(0.022, 0.022, 0.010, 0,  0.006, -0.770, mtM);
      bx(0.042, 0.046, 0.26,  0,  0.062, -0.040, blM);
      bx(0.028, 0.028, 0.064, 0,  0.062, -0.172, mtM);
      bx(0.028, 0.028, 0.042, 0,  0.062,  0.090, mtM);
      bx(0.040, 0.130, 0.055, 0, -0.110,  0.100, skM);
      bx(0.046, 0.175, 0.052, 0, -0.140,  0.050, blM);
      bx(0.050, 0.058, 0.26,  0,  0,      0.380, bM);
      bx(0.040, 0.058, 0.14,  0,  0.028,  0.320, bM);
      bx(0.054, 0.062, 0.010, 0,  0,      0.506, mtM);
      bx(0.008, 0.095, 0.008,-0.042, -0.085, -0.460, mtM);
      bx(0.008, 0.095, 0.008, 0.042, -0.085, -0.460, mtM);
      bx(0.026, 0.008, 0.008,-0.042, -0.130, -0.460, mtM);
      bx(0.026, 0.008, 0.008, 0.042, -0.130, -0.460, mtM);

      bx(0.052, 0.020, 0.022, 0, 0.028, -0.080, mtM);
      bx(0.050, 0.018, 0.022, 0, 0.062, -0.080, dkM);
      bx(0.052, 0.020, 0.022, 0, 0.028,  0.022, mtM);
      bx(0.050, 0.018, 0.022, 0, 0.062,  0.022, dkM);

      bx(0.018, 0.020, 0.020, 0, 0.094, -0.018, mtM);
      bx(0.022, 0.020, 0.018, 0.052, 0.062, -0.018, mtM);
      break;

    default:
      bx(0.06, 0.06, 0.30, 0, 0, 0, bM);
  }
  return root;
}

function Jogo() {
  const mountRef = useRef(null);
  const gameRef  = useRef({
    phase: "loading",
    pos: { x: 0, y: PLAYER_HEIGHT, z: 0 },
    vel: { y: 0 },
    yaw: 0, pitch: 0, recoilPitch: 0,
    onGround: true,
    ammo: 12, hp: 100,
    lastShot: 0, isReloading: false,
    currentWeapon: "classic",
    credits: 800,
    myRoundsWon: 0, enemyRoundsWon: 0,
    isInvisible: false,
    enemyInvisible: false,
    teleportMarkerPos: null,
    teleportMarkerMesh: null,
    enemyTeleportMarker: null,
    clones: [],
    flashCharges: 2, cloneCharges: 2,
    flashCooldownUntil: 0, teleportCooldownUntil: 0,
    cloneCooldownUntil: 0, ultPoints: 0,
    ultActive: false, ultEndTime: 0,
    shield: 0, enemyShield: 0,
    scene: null, camera: null, collidables: [], enemy: null,
    buyInterval: null,
    audioCtx: null,
    activeOrbs: [],
    mouseHeld: false,
    lastEnemyStep: 0,
    lastOwnStep: 0,
    sceneMeshes: [],
    camBobCycle: 0,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const { notifyError } = useNotification();
  const socket   = useSocket();

  const players   = location.state?.players || [user?.nick, "Adversário"];
  const myNick    = user?.nick;
  const enemyNick = players.find(p => p !== myNick) || "Adversário";
  const isHost    = players[0] === myNick;
  const lobbyCode = location.state?.lobbyCode || location.state?.code || "";

  const [hp,            setHp]            = useState(100);
  const [enemyHp,       setEnemyHp]       = useState(100);
  const [ammo,          setAmmo]          = useState(12);
  const [credits,       setCredits]       = useState(800);
  const [currentWeapon, setCurrentWeapon] = useState("classic");
  const [round,         setRound]         = useState(1);
  const [myRounds,      setMyRounds]      = useState(0);
  const [enemyRounds,   setEnemyRounds]   = useState(0);
  const [phase,         setPhase]         = useState("loading");
  const [buyTimer,      setBuyTimer]      = useState(BUY_TIME);
  const [crosshairRed,  setCrosshairRed]  = useState(false);
  const [isBlinded,     setIsBlinded]     = useState(false);
  const [isReloading,   setIsReloading]   = useState(false);
  const [hasTpMarker,   setHasTpMarker]   = useState(false);
  const [cooldownUI,    setCooldownUI]    = useState({ flash: 0, teleport: 0, clone: 0 });
  const [flashChargesUI,  setFlashChargesUI]  = useState(2);
  const [cloneChargesUI,  setCloneChargesUI]  = useState(2);
  const [ultPointsUI,     setUltPointsUI]     = useState(0);
  const [ultActiveUI,     setUltActiveUI]     = useState(false);
  const [ultTimeLeft,     setUltTimeLeft]     = useState(0);
  const [shield,        setShield]        = useState(0);
  const [enemyShield,   setEnemyShield]   = useState(0);
  const [roundResult,   setRoundResult]   = useState(null);
  const [matchResult,   setMatchResult]   = useState(null);
  const [hitIndicator,  setHitIndicator]  = useState(null);
  const hitIndicatorTimer = useRef(null);
  const ultCountdownRef   = useRef(null);
  const ultEndRef         = useRef(null);

  useEffect(() => { gameRef.current.phase = phase; }, [phase]);

  useEffect(() => {
    if (!user) { notifyError("Estás numa página onde não deverias estar"); navigate("/"); }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const g = gameRef.current;

    socket.on("roundStart", ({ round: r, credits: cr, myRoundsWon: mw, enemyRoundsWon: ew }) => {
      if (g.phase === "match_over") return;

      g.hp = 100; setHp(100);
      g.shield = 0; setShield(0);
      setEnemyHp(100); setEnemyShield(0); g.enemyShield = 0;
      g.recoilPitch = 0;
      g.isInvisible = false; setUltActiveUI(false);
      g.ultActive = false;

      g.flashCharges = 2; setFlashChargesUI(2);
      g.cloneCharges = 2; setCloneChargesUI(2);
      g.flashCooldownUntil = 0; g.teleportCooldownUntil = 0; g.cloneCooldownUntil = 0;
      setCooldownUI({ flash: 0, teleport: 0, clone: 0 });

      const w = WEAPONS[g.currentWeapon];
      g.ammo = w.maxAmmo; setAmmo(g.ammo);
      g.isReloading = false; setIsReloading(false);

      const spawn      = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
      const enemySpawn = isHost ? { x: 80,  z: 80  } : { x: -80, z: -80 };
      g.pos = { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z };
      g.vel = { y: 0 }; g.onGround = true;
      if (g.enemy) g.enemy.position.set(enemySpawn.x, 0, enemySpawn.z);

      if (g.teleportMarkerMesh && g.scene) { g.scene.remove(g.teleportMarkerMesh); g.teleportMarkerMesh = null; }
      g.teleportMarkerPos = null; setHasTpMarker(false);
      if (g.enemyTeleportMarker && g.scene) { g.scene.remove(g.enemyTeleportMarker); g.enemyTeleportMarker = null; }
      g.clones.forEach(c => g.scene?.remove(c.mesh)); g.clones = [];
      g.activeOrbs.forEach(o => g.scene?.remove(o)); g.activeOrbs = [];

      setRound(r);
      setMyRounds(mw ?? 0);     g.myRoundsWon   = mw ?? 0;
      setEnemyRounds(ew ?? 0);  g.enemyRoundsWon = ew ?? 0;
      setCredits(cr ?? 800);    g.credits = cr ?? 800;
      setRoundResult(null);

      clearInterval(g.buyInterval);
      setBuyTimer(BUY_TIME);
      let t = BUY_TIME;
      g.buyInterval = setInterval(() => {
        t--; setBuyTimer(t);
        if (t <= 0) clearInterval(g.buyInterval);
      }, 1000);

      setPhase("buy");
    });

    socket.on("playPhase", () => {
      clearInterval(gameRef.current.buyInterval);
      setPhase("game");
    });

    socket.on("roundOver", ({ winnerNick, myRoundsWon: mw, enemyRoundsWon: ew, newCredits }) => {
      clearInterval(gameRef.current.buyInterval);
      const g = gameRef.current;
      const newMw = mw ?? g.myRoundsWon;
      const newEw = ew ?? g.enemyRoundsWon;
      g.myRoundsWon   = newMw;
      g.enemyRoundsWon = newEw;
      setMyRounds(newMw);
      setEnemyRounds(newEw);
      if (newCredits !== undefined) { g.credits = newCredits; setCredits(newCredits); }

      if (newMw >= 3 || newEw >= 3) {
        const isWin = newMw >= 3;
        setMatchResult(isWin ? "win" : "lose");
        setPhase("match_over");
        return;
      }

      setRoundResult(winnerNick === myNick ? "win" : "lose");
      setPhase("round_over");
    });

    socket.on("matchOver", ({ winnerNick, scores }) => {
      clearInterval(gameRef.current.buyInterval);
      const g = gameRef.current;
      const isWin = winnerNick === myNick;
      setMatchResult(isWin ? "win" : "lose");
      setPhase("match_over");

      fetch(`${API_URL}/api/guardar-jogo`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobbyCode,
          player1Nick:   myNick,
          player2Nick:   enemyNick,
          winnerNick,
          player1Rounds: scores?.[myNick]    ?? g.myRoundsWon,
          player2Rounds: scores?.[enemyNick] ?? g.enemyRoundsWon,
        }),
      }).catch(console.error);
    });

    socket.on("killCredits", ({ total }) => {
      gameRef.current.credits = total;
      setCredits(total);

      const g = gameRef.current;
      if (g.ultPoints < 7) { g.ultPoints++; setUltPointsUI(g.ultPoints); }
    });

    socket.on("enemyMove", ({ x, y, z, yaw, moving }) => {
      const g = gameRef.current;
      if (!g.enemy || g.enemyInvisible) return;
      g.enemy.position.set(x, y, z);
      g.enemy.rotation.y = yaw + Math.PI;

      if (g.enemy.userData.anim) {
        g.enemy.userData.anim.isMoving  = !!moving;
        g.enemy.userData.anim.isJumping = y > 0.12;
      }

      if (moving && g.phase === "game" && g.audioCtx && g.camera) {
        const now = Date.now();
        if (now - g.lastEnemyStep > 420) {
          g.lastEnemyStep = now;
          playFootstep(g.audioCtx, { x, y: 1.0, z }, g.camera.position);
        }
      }
    });

    socket.on("youWereHit", ({ damage, zone, remainingHp, remainingShield }) => {
      const g = gameRef.current;
      if (g.isInvisible) return;
      g.hp = remainingHp !== undefined ? remainingHp : Math.max(0, (g.hp ?? 100) - damage);
      g.shield = remainingShield ?? 0;
      setHp(g.hp); setShield(g.shield);
    });

    socket.on("enemyHpUpdate", ({ hp: ehp, shield: esh }) => {
      setEnemyHp(ehp);
      if (esh !== undefined) { gameRef.current.enemyShield = esh; setEnemyShield(esh); }
    });

    socket.on("enemyFlash", ({ pos, targetPos: tp }) => {
      const g = gameRef.current;
      if (!g.scene || !g.camera) return;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      orb.position.set(pos.x, pos.y, pos.z);
      g.scene.add(orb);
      g.activeOrbs.push(orb);
      const startVec   = new THREE.Vector3(pos.x, pos.y, pos.z);
      const endVec     = new THREE.Vector3(tp.x, tp.y, tp.z);
      const dir3       = new THREE.Vector3().subVectors(endVec, startVec).normalize();
      const totalSteps = Math.max(1, Math.ceil(startVec.distanceTo(endVec) / 0.55));
      let step = 0;
      const animOrb = () => {
        const g2 = gameRef.current;
        step++;
        orb.position.addScaledVector(dir3, 0.55);
        if (step >= totalSteps) {
          g2.scene?.remove(orb);
          g2.activeOrbs = g2.activeOrbs.filter(o => o !== orb);
          spawnFlashBurst(g2.scene, endVec);

          const camPos = g2.camera.position;
          const dist = endVec.distanceTo(camPos);
          if (dist < 60) {
            const toCamera = new THREE.Vector3().subVectors(camPos, endVec).normalize();
            const losRay = new THREE.Raycaster(endVec.clone(), toCamera, 0.3, dist - 0.3);
            const losHits = losRay.intersectObjects(g2.sceneMeshes, false);
            if (losHits.length === 0) {
              const dur = Math.round(Math.max(800, (1 - dist / 60) * 3500));
              setIsBlinded(true);
              setTimeout(() => setIsBlinded(false), dur);
            }
          }
          return;
        }
        setTimeout(animOrb, 16);
      };
      animOrb();
    });

    socket.on("enemyTeleportPlace", ({ pos }) => {
      const g = gameRef.current;
      if (!g.scene) return;
      if (g.enemyTeleportMarker) g.scene.remove(g.enemyTeleportMarker);
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.08, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4400 })
      );
      m.position.set(pos.x, pos.y + 0.05, pos.z);
      m.rotation.x = -Math.PI / 2;
      g.scene.add(m);
      g.enemyTeleportMarker = m;
    });

    socket.on("enemyTeleportGo", ({ newPos }) => {
      const g = gameRef.current;
      if (g.enemy) g.enemy.position.set(newPos.x, newPos.y, newPos.z);
      if (g.enemyTeleportMarker && g.scene) { g.scene.remove(g.enemyTeleportMarker); g.enemyTeleportMarker = null; }
    });

    socket.on("enemyClone", ({ pos, dir }) => {
      const g = gameRef.current;
      if (!g.scene) return;
      const clone = makePlayerMesh(0xff6600);
      clone.position.set(pos.x, 0, pos.z);
      clone.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
      g.scene.add(clone);
      g.clones.push({ mesh: clone, dir: new THREE.Vector3(dir.x, 0, dir.z).normalize(), timeLeft: 3000, isEnemy: true });
    });

    socket.on("enemyInvisible", () => {
      const g = gameRef.current;
      g.enemyInvisible = true;
      if (g.enemy) g.enemy.visible = false;
    });

    socket.on("enemyVisibleAgain", () => {
      const g = gameRef.current;
      g.enemyInvisible = false;
      if (g.enemy) g.enemy.visible = true;
    });

    socket.on("shieldUpdate", ({ shield: sh }) => {
      gameRef.current.shield = sh; setShield(sh);
    });

    socket.on("enemyUltEnd", ({ pos }) => {
      const g = gameRef.current;
      if (!g.audioCtx || !g.camera) return;
      if (g.audioCtx.state === "suspended") g.audioCtx.resume();
      playUltEndSound(g.audioCtx, true, pos);
    });

    socket.on("enemyWeaponChange", ({ weaponId }) => {
      const g = gameRef.current;
      if (!g.enemy) return;
      const armR = g.enemy.userData.parts?.armR;
      if (!armR) return;
      if (g.enemyWeaponMesh) armR.remove(g.enemyWeaponMesh);
      const nw = makeWeaponMesh(weaponId);
      nw.scale.setScalar(0.80);
      nw.position.set(0, -0.62, -0.10);
      armR.add(nw);
      g.enemyWeaponMesh = nw;
    });

    return () => {
      socket.off("roundStart"); socket.off("playPhase"); socket.off("roundOver");
      socket.off("matchOver"); socket.off("killCredits"); socket.off("enemyMove");
      socket.off("youWereHit"); socket.off("enemyHpUpdate");
      socket.off("enemyFlash"); socket.off("enemyTeleportPlace"); socket.off("enemyTeleportGo");
      socket.off("enemyClone"); socket.off("enemyInvisible"); socket.off("enemyVisibleAgain");
      socket.off("shieldUpdate"); socket.off("enemyUltEnd"); socket.off("enemyWeaponChange");
    };
  }, [socket, myNick, enemyNick, isHost, lobbyCode]);

  useEffect(() => {
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

    const camera = new THREE.PerspectiveCamera(80, el.clientWidth / el.clientHeight, 0.05, 600);
    g.camera = camera;
    scene.add(camera);

    const spawnFpWeapon = (wId) => {
      if (g.fpWeapon) camera.remove(g.fpWeapon);
      const wMesh = makeWeaponMesh(wId);
      wMesh.traverse(child => {
        if (!child.isMesh) return;
        child.material = child.material.clone();
        child.material.depthTest = false;
        child.renderOrder = 999;
      });
      wMesh.position.set(0.14, -0.14, -0.40);
      wMesh.rotation.set(0.06, -0.02, 0);
      camera.add(wMesh);
      g.fpWeapon = wMesh;
    };
    g.spawnFpWeapon = spawnFpWeapon;
    spawnFpWeapon(g.currentWeapon);

    const spawn  = isHost ? { x: -80, z: -80 } : { x: 80, z: 80 };
    g.pos   = { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z };
    g.yaw   = isHost ? Math.PI * 0.75 : -Math.PI * 0.25;
    g.pitch = 0;
    camera.position.set(g.pos.x, g.pos.y, g.pos.z);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(40, 80, 40);
    sun.castShadow = true;
    scene.add(sun);

    const arenaData = buildArena(scene);
    g.collidables = arenaData.collidables;
    g.sceneMeshes = arenaData.meshes;

    const enemyColor = isHost ? 0xee4444 : 0x4488ff;
    const enemy = makePlayerMesh(enemyColor);
    const enemySpawn = isHost ? { x: 80, z: 80 } : { x: -80, z: -80 };
    enemy.position.set(enemySpawn.x, 0, enemySpawn.z);
    scene.add(enemy);
    g.enemy = enemy;

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

    const tpWeapon = makeWeaponMesh("classic");
    tpWeapon.scale.setScalar(0.80);
    tpWeapon.position.set(0, -0.62, -0.10);
    enemy.userData.parts.armR.add(tpWeapon);
    g.enemyWeaponMesh = tpWeapon;

    const initAudio = () => {
      if (!g.audioCtx) g.audioCtx = createAudioCtx();
      else if (g.audioCtx.state === "suspended") g.audioCtx.resume();
    };

    const shoot = () => {
      const g = gameRef.current;
      if (g.phase !== "game") return;
      if (g.isInvisible) return;
      if (g.isReloading) return;
      const weapon = WEAPONS[g.currentWeapon];
      const now = Date.now();
      if (now - g.lastShot < weapon.fireRate) return;
      if (g.ammo <= 0) { reload(); return; }

      g.lastShot = now;
      g.ammo--;
      setAmmo(g.ammo);

      playGunshot(g.audioCtx, g.currentWeapon);

      g.recoilPitch = Math.min(g.recoilPitch + weapon.recoil, weapon.recoil * 6);

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObject(g.enemy, true);
      if (hits.length > 0 && hits[0].distance < 200) {
        const zone = hits[0].object.userData.zone ?? "body";
        const mult = zone === "head" ? 2.5 : zone === "leg" ? 0.75 : 1.0;
        const finalDamage = Math.round(weapon.damage * mult);
        setCrosshairRed(true);
        setTimeout(() => setCrosshairRed(false), 120);

        clearTimeout(hitIndicatorTimer.current);
        setHitIndicator({ damage: finalDamage, zone });
        hitIndicatorTimer.current = setTimeout(() => setHitIndicator(null), 1400);
        socket?.emit("playerHit", { code: lobbyCode, damage: finalDamage, shooter: myNick, zone });
      }

      for (let i = g.clones.length - 1; i >= 0; i--) {
        const c = g.clones[i];
        if (!c.isEnemy) continue;
        const cloneHits = ray.intersectObject(c.mesh, true);
        if (cloneHits.length > 0 && cloneHits[0].distance < 200) {

          scene.remove(c.mesh);
          g.clones.splice(i, 1);

          const clonePos = new THREE.Vector3(
            c.mesh.position.x, PLAYER_HEIGHT, c.mesh.position.z
          );
          const dist = clonePos.distanceTo(camera.position);
          if (dist < 35 && isInFlashCone(camera, clonePos, 70)) {
            const dur = Math.round(Math.max(800, (1 - dist / 35) * 3000));
            setIsBlinded(true);
            setTimeout(() => setIsBlinded(false), dur);
          }
          break;
        }
      }

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const end = hits[0]?.point || camera.position.clone().addScaledVector(dir, 150);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([camera.position.clone(), end]),
        new THREE.LineBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.7 })
      );
      scene.add(line);
      setTimeout(() => scene.remove(line), 55);

      const muzzleLight = new THREE.PointLight(0xffaa33, 5, 7);
      muzzleLight.position.copy(camera.position).addScaledVector(dir, 1.0);
      scene.add(muzzleLight);
      setTimeout(() => scene.remove(muzzleLight), 55);

      if (g.ammo <= 0) reload();
    };

    const reload = () => {
      const g = gameRef.current;
      if (g.isReloading) return;
      const weapon = WEAPONS[g.currentWeapon];
      if (g.ammo === weapon.maxAmmo) return;
      g.isReloading = true;
      g.reloadStart = Date.now();
      setIsReloading(true);
      if (g.audioCtx?.state === "suspended") g.audioCtx.resume();
      playReloadSound(g.audioCtx);
      setTimeout(() => {
        g.isReloading = false;
        setIsReloading(false);
        g.ammo = WEAPONS[g.currentWeapon].maxAmmo;
        setAmmo(g.ammo);
      }, weapon.reload);
    };

    const useFlash = () => {
      const g = gameRef.current;
      if (g.phase !== "game") return;
      if (g.flashCharges <= 0) return;
      const now = Date.now();
      if (now < g.flashCooldownUntil) return;

      g.flashCharges--;
      setFlashChargesUI(g.flashCharges);
      if (g.flashCharges <= 0) {
        g.flashCooldownUntil = now + 20000;
        const cd = setInterval(() => {
          const rem = Math.max(0, g.flashCooldownUntil - Date.now());
          setCooldownUI(c => ({ ...c, flash: rem }));
          if (rem <= 0) {
            g.flashCharges = Math.min(2, g.flashCharges + 1);
            setFlashChargesUI(g.flashCharges);
            clearInterval(cd);
          }
        }, 100);
      }

      const throwDir = new THREE.Vector3();
      camera.getWorldDirection(throwDir);
      const startPos = camera.position.clone().addScaledVector(throwDir, 0.6);

      const surfRay = new THREE.Raycaster(camera.position.clone(), throwDir.clone());
      const surfHits = surfRay.intersectObjects(g.sceneMeshes, false);
      const targetPos = (surfHits.length > 0 && surfHits[0].distance < 80)
        ? surfHits[0].point.clone()
        : camera.position.clone().addScaledVector(throwDir, 80);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      orb.position.copy(startPos);
      scene.add(orb);
      g.activeOrbs.push(orb);

      const totalDist = startPos.distanceTo(targetPos);
      const SPEED = 0.55;
      const totalSteps = Math.max(1, Math.ceil(totalDist / SPEED));
      const dir3 = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
      let step = 0;
      const animOrb = () => {
        const g2 = gameRef.current;
        step++;
        orb.position.addScaledVector(dir3, SPEED);
        if (step >= totalSteps) {
          scene.remove(orb);
          g2.activeOrbs = g2.activeOrbs.filter(o => o !== orb);
          spawnFlashBurst(scene, targetPos);

          const camPos = camera.position;
          const distOwner = targetPos.distanceTo(camPos);
          if (distOwner < 60) {
            const toOwner = new THREE.Vector3().subVectors(camPos, targetPos).normalize();
            const ownerLos = new THREE.Raycaster(targetPos.clone(), toOwner, 0.3, distOwner - 0.3);
            const ownerHits = ownerLos.intersectObjects(g2.sceneMeshes, false);
            if (ownerHits.length === 0) {
              const dur = Math.round(Math.max(800, (1 - distOwner / 60) * 3500));
              setIsBlinded(true);
              setTimeout(() => setIsBlinded(false), dur);
            }
          }
          return;
        }
        setTimeout(animOrb, 16);
      };
      animOrb();

      socket?.emit("abilityFlash", {
        code: lobbyCode,
        pos:       { x: startPos.x,  y: startPos.y,  z: startPos.z  },
        targetPos: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      });
    };

    const useTeleport = () => {
      const g = gameRef.current;
      if (g.phase !== "game") return;
      const now = Date.now();

      if (g.teleportMarkerPos) {

        const tp = g.teleportMarkerPos;
        g.pos = { x: tp.x, y: PLAYER_HEIGHT, z: tp.z };
        socket?.emit("abilityTeleportGo", { code: lobbyCode, newPos: { x: tp.x, y: 0, z: tp.z } });
        if (g.teleportMarkerMesh) { scene.remove(g.teleportMarkerMesh); g.teleportMarkerMesh = null; }
        g.teleportMarkerPos = null;
        setHasTpMarker(false);
        g.teleportCooldownUntil = now + 35000;
        const cd = setInterval(() => {
          const rem = Math.max(0, g.teleportCooldownUntil - Date.now());
          setCooldownUI(c => ({ ...c, teleport: rem }));
          if (rem <= 0) clearInterval(cd);
        }, 100);
      } else {

        if (now < g.teleportCooldownUntil) return;

        const actualPitch = g.pitch - g.recoilPitch;
        const cosP = Math.cos(actualPitch);
        const dir = new THREE.Vector3(
          -Math.sin(g.yaw) * cosP,
           Math.sin(actualPitch),
          -Math.cos(g.yaw) * cosP
        ).normalize();
        const origin = new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z);
        const ray = new THREE.Raycaster(origin, dir);
        const hits = ray.intersectObjects(g.sceneMeshes, true);
        let hitPoint = null;
        if (hits.length && hits[0].distance <= 80) {
          hitPoint = hits[0].point.clone();
        } else if (dir.y < -0.01) {

          const t = -origin.y / dir.y;
          if (t > 0 && t <= 80) {
            hitPoint = new THREE.Vector3(origin.x + dir.x * t, 0.05, origin.z + dir.z * t);
          }
        }
        if (!hitPoint) return;
        const hit = hitPoint;

        const TP_PR = 0.55;
        const isOnBoxTop = hit.y >= BOX_H - 0.2;
        if (!isOnBoxTop) {
          const insideBox = g.collidables.some(b => {
            const bw = b.maxX - b.minX, bd = b.maxZ - b.minZ;
            if (bw > 40 || bd > 40) return false;
            return hit.x + TP_PR > b.minX && hit.x - TP_PR < b.maxX &&
                   hit.z + TP_PR > b.minZ && hit.z - TP_PR < b.maxZ;
          });
          if (insideBox) return;
        }

        g.teleportMarkerPos = { x: hit.x, y: hit.y, z: hit.z };
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.08, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x00ffcc })
        );
        ring.position.set(hit.x, hit.y + 0.05, hit.z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
        if (g.teleportMarkerMesh) scene.remove(g.teleportMarkerMesh);
        g.teleportMarkerMesh = ring;
        setHasTpMarker(true);

        socket?.emit("abilityTeleportPlace", {
          code: lobbyCode,
          pos:  { x: hit.x, y: hit.y, z: hit.z },
        });
      }
    };

    const useClone = () => {
      const g = gameRef.current;
      if (g.phase !== "game") return;
      if (g.cloneCharges <= 0) return;
      const now = Date.now();
      if (now < g.cloneCooldownUntil) return;

      g.cloneCharges--;
      setCloneChargesUI(g.cloneCharges);
      if (g.cloneCharges <= 0) {
        g.cloneCooldownUntil = now + 25000;
        const cd = setInterval(() => {
          const rem = Math.max(0, g.cloneCooldownUntil - Date.now());
          setCooldownUI(c => ({ ...c, clone: rem }));
          if (rem <= 0) {
            g.cloneCharges = Math.min(2, g.cloneCharges + 1);
            setCloneChargesUI(g.cloneCharges);
            clearInterval(cd);
          }
        }, 100);
      }

      const dir = new THREE.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
      const clone = makePlayerMesh(0x44ff88);
      clone.position.set(g.pos.x, 0, g.pos.z);
      clone.rotation.y = g.yaw + Math.PI;
      scene.add(clone);
      g.clones.push({ mesh: clone, dir: dir.clone(), timeLeft: 3000, isEnemy: false });

      socket?.emit("abilityClone", {
        code: lobbyCode,
        pos: { x: g.pos.x, y: 0, z: g.pos.z },
        dir: { x: dir.x, y: 0, z: dir.z },
      });
    };

    const ULT_DURATION = 8000;

    const exitUlt = () => {
      clearTimeout(ultEndRef.current);
      clearInterval(ultCountdownRef.current);
      ultEndRef.current = null;
      const g2 = gameRef.current;
      g2.ultActive = false;
      g2.isInvisible = false;
      setUltActiveUI(false);
      setUltTimeLeft(0);
      if (g2.audioCtx?.state === "suspended") g2.audioCtx.resume();
      playUltEndSound(g2.audioCtx, false, null);
      socket?.emit("abilityUltEnd", { code: lobbyCode, pos: { x: g2.pos.x, y: g2.pos.y, z: g2.pos.z } });
      socket?.emit("abilityVisibleAgain", { code: lobbyCode });
    };

    const useUlt = () => {
      const g = gameRef.current;
      if (g.phase !== "game") return;

      if (g.ultActive) { exitUlt(); return; }

      if (g.ultPoints < 7) return;
      g.ultActive = true; g.ultPoints = 0;
      setUltActiveUI(true); setUltPointsUI(0);
      socket?.emit("abilityInvisible", { code: lobbyCode });
      g.isInvisible = true;

      clearInterval(ultCountdownRef.current);
      const start = Date.now();
      setUltTimeLeft(Math.ceil(ULT_DURATION / 1000));
      ultCountdownRef.current = setInterval(() => {
        const rem = Math.max(0, ULT_DURATION - (Date.now() - start));
        setUltTimeLeft(Math.ceil(rem / 1000));
        if (rem <= 0) clearInterval(ultCountdownRef.current);
      }, 100);

      clearTimeout(ultEndRef.current);
      ultEndRef.current = setTimeout(exitUlt, ULT_DURATION);
    };

    const onKeyDown = e => {
      if (e.code === "KeyQ") useFlash();
      if (e.code === "KeyE") useTeleport();
      if (e.code === "KeyC") useClone();
      if (e.code === "KeyX") useUlt();
      if (e.code === "KeyR") reload();
    };

    const keys = {};
    const onKD = e => { initAudio(); keys[e.code] = true; onKeyDown(e); };
    const onKU = e => { keys[e.code] = false; };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup",   onKU);

    renderer.domElement.addEventListener("click", () => {
      initAudio();
      if (document.pointerLockElement !== renderer.domElement)
        renderer.domElement.requestPointerLock();
    });

    const onMouseMove = e => {
      if (document.pointerLockElement !== renderer.domElement) return;
      const g = gameRef.current;
      if (g.phase !== "game") return;
      g.yaw  -= e.movementX * 0.002;
      g.pitch = Math.max(-1.3, Math.min(1.3, g.pitch - e.movementY * 0.002));
    };
    window.addEventListener("mousemove", onMouseMove);

    const onMouseDown = e => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== renderer.domElement) return;
      initAudio();
      gameRef.current.mouseHeld = true;
      shoot();
    };
    const onMouseUp = e => {
      if (e.button !== 0) return;
      gameRef.current.mouseHeld = false;
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup",   onMouseUp);

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let animId;
    const loop = () => {
      animId = requestAnimationFrame(loop);
      const g = gameRef.current;

      if (g.teleportMarkerMesh) g.teleportMarkerMesh.rotation.z += 0.03;

      g.clones = g.clones.filter(clone => {
        clone.timeLeft -= 16;
        if (clone.timeLeft <= 0) { scene.remove(clone.mesh); return false; }
        clone.mesh.position.x += clone.dir.x * PLAYER_SPEED * 0.6;
        clone.mesh.position.z += clone.dir.z * PLAYER_SPEED * 0.6;
        animatePlayerMesh(clone.mesh, true, false);
        return true;
      });

      if (g.enemy && g.enemy.userData.parts) {
        const anim  = g.enemy.userData.anim;
        animatePlayerMesh(g.enemy, anim.isMoving, anim.isJumping);
      }

      camera.position.set(g.pos.x, g.pos.y, g.pos.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = g.yaw;
      camera.rotation.x = g.pitch - g.recoilPitch;

      if (g.audioCtx && g.audioCtx.state === "running") {
        const L = g.audioCtx.listener;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        if (L.positionX !== undefined) {
          L.positionX.value = camera.position.x;
          L.positionY.value = camera.position.y;
          L.positionZ.value = camera.position.z;
          L.forwardX.value  = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
          L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
        } else {
          L.setPosition(camera.position.x, camera.position.y, camera.position.z);
          L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
        }
      }

      if (g.fpWeapon && g.phase === "game") {
        const bx = Math.sin(g.camBobCycle * 2) * 0.006;
        const by = Math.sin(g.camBobCycle * 4) * 0.005;
        let baseRX = 0.06, baseRZ = 0, offPY = 0;
        if (g.isReloading && g.reloadStart > 0) {
          const dur = WEAPONS[g.currentWeapon]?.reload || 1500;
          const p   = Math.min(1, (Date.now() - g.reloadStart) / dur);
          const off = getReloadOffsets(g.currentWeapon, p);
          baseRX += off.rx;
          baseRZ += off.rz;
          offPY   = off.py ?? 0;
        }
        g.fpWeapon.position.x += (0.14 + bx           - g.fpWeapon.position.x) * 0.12;
        g.fpWeapon.position.y += (-0.14 + by + offPY  - g.fpWeapon.position.y) * 0.12;
        g.fpWeapon.rotation.x += (baseRX + g.recoilPitch * 2.2 - g.fpWeapon.rotation.x) * 0.28;
        g.fpWeapon.rotation.z += (baseRZ - bx * 1.4   - g.fpWeapon.rotation.z) * 0.12;
      }

      renderer.render(scene, camera);

      if (g.phase !== "game") return;

      if (g.mouseHeld && WEAPONS[g.currentWeapon]?.auto) shoot();

      if (g.recoilPitch > 0) g.recoilPitch = Math.max(0, g.recoilPitch - 0.004);

      const fwd   = new THREE.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
      const right = new THREE.Vector3( Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      let moving = false;
      const prevX = g.pos.x, prevZ = g.pos.z;
      let nx = g.pos.x, nz = g.pos.z;

      if (keys["KeyW"] || keys["ArrowUp"])    { nx += fwd.x * PLAYER_SPEED;   nz += fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyS"] || keys["ArrowDown"])  { nx -= fwd.x * PLAYER_SPEED;   nz -= fwd.z * PLAYER_SPEED;   moving = true; }
      if (keys["KeyA"] || keys["ArrowLeft"])  { nx -= right.x * PLAYER_SPEED; nz -= right.z * PLAYER_SPEED; moving = true; }
      if (keys["KeyD"] || keys["ArrowRight"]) { nx += right.x * PLAYER_SPEED; nz += right.z * PLAYER_SPEED; moving = true; }

      if (moving && g.onGround) {
        g.camBobCycle = (g.camBobCycle + 0.10) % (Math.PI * 2);
        camera.position.y = g.pos.y + Math.sin(g.camBobCycle * 2) * 0.032;
      } else {
        g.camBobCycle *= 0.85;
        camera.position.y = g.pos.y;
      }

      if (keys["Space"] && g.onGround) { g.vel.y = JUMP_FORCE; g.onGround = false; }
      g.vel.y += GRAVITY;
      g.pos.y += g.vel.y;
      if (g.pos.y <= PLAYER_HEIGHT) { g.pos.y = PLAYER_HEIGHT; g.vel.y = 0; g.onGround = true; }

      const { px, pz } = resolveCollision(nx, nz, prevX, prevZ, g);
      g.pos.x = px; g.pos.z = pz;

      const half = MAP_SIZE / 2 - 1;
      g.pos.x = Math.max(-half, Math.min(half, g.pos.x));
      g.pos.z = Math.max(-half, Math.min(half, g.pos.z));

      socket?.emit("move", {
        code: lobbyCode,
        x: g.pos.x, y: g.pos.y - PLAYER_HEIGHT, z: g.pos.z,
        yaw: g.yaw, pitch: g.pitch, moving,
      });

      if (moving) {
        const nowMs = performance.now();
        if (nowMs - g.lastOwnStep > 420) {
          g.lastOwnStep = nowMs;
          playOwnFootstep(g.audioCtx);
        }
      }
    };
    loop();

    socket?.emit("playerReady", { code: lobbyCode });

    return () => {
      cancelAnimationFrame(animId);
      document.exitPointerLock();
      window.removeEventListener("keydown",   onKD);
      window.removeEventListener("keyup",     onKU);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup",   onMouseUp);
      window.removeEventListener("resize",    onResize);
      clearInterval(gameRef.current.buyInterval);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  const handleBuyShield = (shieldHp, price) => {
    const g = gameRef.current;
    if (g.credits < price || g.shield >= shieldHp) return;
    g.credits -= price; setCredits(g.credits);
    socket?.emit("buyShield", { code: lobbyCode, amount: shieldHp });
  };

  const handleSellShield = () => {
    const g = gameRef.current;
    if (g.shield === 0) return;
    const refund = g.shield === 25 ? 400 : g.shield === 50 ? 1000 : 0;
    if (refund === 0) return;
    g.credits = Math.min(MAX_CREDITS, g.credits + refund);
    setCredits(g.credits);
    g.shield = 0; setShield(0);
    socket?.emit("sellShield", { code: lobbyCode });
  };

  const handleSell = (weaponId) => {
    const g = gameRef.current;
    const w = WEAPONS[weaponId];
    if (!w || w.price === 0 || g.currentWeapon !== weaponId) return;
    g.credits = Math.min(MAX_CREDITS, g.credits + w.price);
    setCredits(g.credits);
    g.currentWeapon = "classic";
    setCurrentWeapon("classic");
    g.ammo = WEAPONS["classic"].maxAmmo;
    setAmmo(g.ammo);
    g.spawnFpWeapon?.("classic");
    socket?.emit("weaponChange", { code: lobbyCode, weaponId: "classic" });
  };

  const handleBuy = (weaponId) => {
    const g = gameRef.current;
    const w = WEAPONS[weaponId];
    if (!w || g.credits < w.price) return;
    if (weaponId === g.currentWeapon) return;
    g.credits -= w.price;
    setCredits(g.credits);
    g.currentWeapon = weaponId;
    setCurrentWeapon(weaponId);
    g.ammo = w.maxAmmo;
    setAmmo(g.ammo);
    g.spawnFpWeapon?.(weaponId);
    socket?.emit("weaponChange", { code: lobbyCode, weaponId });
  };

  if (phase === "match_over") return <EndScreen win={matchResult === "win"} onExit={() => navigate("/perfil")} />;

  const weapon = WEAPONS[currentWeapon];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
            <div ref={mountRef} className="w-full h-full" />

            {phase === "loading" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
          <div className="bg-gray-800 p-10 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-6 items-center">
            <div className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">YoruZone</div>

            <div className="flex items-center gap-8 w-full justify-center">
              <div className="flex-1 text-right">
                <div className="text-[9px] tracking-[0.1em] text-gray-500 uppercase mb-2">Tu</div>
                <div className="text-2xl font-bold text-white">{myNick}</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-px h-8 bg-gray-700"/>
                <div className="text-gray-600 font-light text-lg">×</div>
                <div className="w-px h-8 bg-gray-700"/>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[9px] tracking-[0.1em] text-gray-500 uppercase mb-2">Adversário</div>
                <div className="text-2xl font-bold text-gray-400">{enemyNick}</div>
              </div>
            </div>

            {lobbyCode && (
              <div className="text-[9px] tracking-[0.15em] text-gray-600 uppercase">Sala {lobbyCode}</div>
            )}

            <div className="w-full h-px bg-gray-700"/>

            <div className="flex flex-col items-center gap-3">
              <div className="text-[9px] tracking-[0.12em] text-gray-500 uppercase">A Aguardar Jogadores</div>
              <div className="flex gap-1.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="animate-pulse w-1 h-1 rounded-full bg-amber-400/50"
                       style={{animationDelay:`${i*0.22}s`}}/>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

            {isBlinded && (
        <div className="absolute inset-0 z-50 pointer-events-none bg-white/92 transition-opacity duration-300" />
      )}

            {ultActiveUI && (
        <div className="absolute inset-0 z-20 pointer-events-none"
             style={{boxShadow:'inset 0 0 90px rgba(251,191,36,0.14)',border:'1px solid rgba(251,191,36,0.18)'}}/>
      )}

            {phase === "buy" && (
        <ShopOverlay
          credits={credits} currentWeapon={currentWeapon} shield={shield}
          onBuy={handleBuy} onSell={handleSell} onBuyShield={handleBuyShield} onSellShield={handleSellShield}
          timer={buyTimer} round={round}
          myRounds={myRounds} enemyRounds={enemyRounds}
          myNick={myNick} enemyNick={enemyNick}
        />
      )}

            {phase === "round_over" && roundResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-800 rounded-2xl shadow-2xl px-16 py-9 text-center border border-gray-700/60">
            <div className={`text-[9px] tracking-[0.15em] uppercase mb-3 font-semibold ${roundResult === "win" ? "text-green-400" : "text-red-400"}`}>
              {roundResult === "win" ? "RONDA GANHA" : "RONDA PERDIDA"}
            </div>
            <div className="text-5xl font-bold text-white tabular-nums leading-none">
              {myRounds}<span className="text-gray-600 mx-3">:</span>{enemyRounds}
            </div>
            <div className="text-[8px] tracking-[0.12em] text-gray-500 uppercase mt-4">PRÓXIMA RONDA</div>
          </div>
        </div>
      )}

            {(phase === "game" || phase === "buy" || phase === "round_over") && (
        <>
                    <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
               style={{height:'84px',background:'linear-gradient(to bottom,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.45) 65%,transparent 100%)',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>

                        <div className="absolute top-3 left-4">
              <div style={{fontSize:'9px',letterSpacing:'0.08em',color: ultActiveUI ? '#fbbf24' : 'rgba(255,255,255,0.32)',textTransform:'uppercase',marginBottom:'7px',fontWeight: ultActiveUI ? 600 : 400}}>
                {myNick}{ultActiveUI && ' · DRIFT'}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                <div style={{width:'120px',height:'6px',background:'rgba(255,255,255,0.08)',overflow:'hidden'}}>
                  <div style={{height:'100%',transition:'width 0.15s',
                    width:`${hp}%`,
                    background: hp > 50 ? '#ef4444' : hp > 25 ? '#f97316' : '#ff2222',
                    boxShadow: hp <= 25 ? '0 0 8px rgba(255,34,34,0.7)' : 'none'}}/>
                </div>
                <span style={{fontSize:'12px',color:'rgba(255,255,255,0.65)',fontWeight:600,fontVariantNumeric:'tabular-nums',minWidth:'24px'}}>{hp}</span>
              </div>
              {shield > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{width:'120px',height:'4px',background:'rgba(255,255,255,0.08)',overflow:'hidden'}}>
                    <div style={{height:'100%',background:'#38bdf8',transition:'width 0.15s',
                      width:`${(shield/50)*100}%`,boxShadow:'0 0 6px rgba(56,189,248,0.5)'}}/>
                  </div>
                  <span style={{fontSize:'11px',color:'rgba(56,189,248,0.75)',fontWeight:500,fontVariantNumeric:'tabular-nums',minWidth:'24px'}}>{shield}</span>
                </div>
              )}
            </div>

                        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
              <div style={{fontSize:'8px',letterSpacing:'0.12em',color:'rgba(255,255,255,0.2)',textTransform:'uppercase',marginBottom:'5px'}}>RONDA {round}</div>
              <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                <div style={{display:'flex',gap:'5px'}}>
                  {Array.from({length:3}).map((_,i) => (
                    <div key={i} style={{width:'11px',height:'11px',
                      background: i < myRounds ? '#fbbf24' : 'rgba(255,255,255,0.08)',
                      boxShadow: i < myRounds ? '0 0 6px rgba(251,191,36,0.5)' : 'none',
                      transition:'all 0.2s'}}/>
                  ))}
                </div>
                <div style={{fontSize:'22px',fontWeight:700,color:'#fff',fontVariantNumeric:'tabular-nums',lineHeight:1,letterSpacing:'-0.02em'}}>
                  {myRounds}<span style={{color:'rgba(255,255,255,0.18)',margin:'0 6px'}}>:</span>{enemyRounds}
                </div>
                <div style={{display:'flex',gap:'5px'}}>
                  {Array.from({length:3}).map((_,i) => (
                    <div key={i} style={{width:'11px',height:'11px',
                      background: i < enemyRounds ? '#f87171' : 'rgba(255,255,255,0.08)',
                      boxShadow: i < enemyRounds ? '0 0 6px rgba(248,113,113,0.5)' : 'none',
                      transition:'all 0.2s'}}/>
                  ))}
                </div>
              </div>
            </div>

                        <div className="absolute top-3 right-4 text-right">
              <div style={{fontSize:'9px',letterSpacing:'0.08em',color:'rgba(255,255,255,0.28)',textTransform:'uppercase'}}>{enemyNick}</div>
            </div>
          </div>

                    <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
               style={{height:'96px',background:'linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.5) 55%,transparent 100%)'}}>

                        <div className="absolute" style={{bottom:'88px',left:'16px'}}>
              <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(255,255,255,0.25)',textTransform:'uppercase',marginBottom:'3px'}}>CRÉDITOS</div>
              <div style={{fontSize:'18px',fontWeight:700,color:'#fbbf24',fontVariantNumeric:'tabular-nums',lineHeight:1,textShadow:'0 0 12px rgba(251,191,36,0.3)'}}>
                {credits.toLocaleString()}
              </div>
            </div>

                        <div className="absolute text-right" style={{bottom:'82px',right:'16px'}}>
              <div style={{fontSize:'8px',letterSpacing:'0.08em',color:`rgba(255,255,255,0.28)`,textTransform:'uppercase',marginBottom:'3px'}}>
                {weapon.name}{weapon.auto ? ' · AUTO' : ''}
              </div>
              {isReloading ? (
                <div className="animate-pulse" style={{fontSize:'11px',letterSpacing:'0.06em',color:'#fbbf24',textTransform:'uppercase'}}>RECARREGANDO</div>
              ) : (
                <div style={{display:'flex',alignItems:'baseline',gap:'5px',justifyContent:'flex-end'}}>
                  <span style={{fontSize:'36px',fontWeight:800,color:'#fff',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{ammo}</span>
                  <span style={{fontSize:'14px',color:'rgba(255,255,255,0.2)',fontVariantNumeric:'tabular-nums'}}>/ {weapon.maxAmmo}</span>
                </div>
              )}
            </div>
          </div>

                    <AbilityBar cooldownUI={cooldownUI} flashCharges={flashChargesUI}
                      cloneCharges={cloneChargesUI} ultPoints={ultPointsUI} hasTpMarker={hasTpMarker}/>

                    {ultActiveUI && (
            <div className="absolute pointer-events-none z-30 text-center"
                 style={{bottom:'156px',left:'50%',transform:'translateX(-50%)'}}>
              <div style={{fontSize:'8px',letterSpacing:'0.15em',color:'rgba(251,191,36,0.45)',textTransform:'uppercase',marginBottom:'4px'}}>
                DIMENSIONAL DRIFT
              </div>
              <div style={{
                fontSize:'56px',fontWeight:'bold',lineHeight:1,fontVariantNumeric:'tabular-nums',
                color: ultTimeLeft <= 2 ? '#ef4444' : '#fbbf24',
                textShadow: ultTimeLeft <= 2
                  ? '0 0 28px rgba(239,68,68,0.55)'
                  : '0 0 28px rgba(251,191,36,0.4)',
                transition:'color 0.2s,text-shadow 0.2s',
              }}>
                {ultTimeLeft > 0 ? ultTimeLeft : ''}
              </div>
            </div>
          )}

                    {hasTpMarker && (
            <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="text-[9px] tracking-[0.1em] text-teal-400/70 uppercase text-center">
                PORTAL ACTIVO — E PARA TELEPORTAR
              </div>
            </div>
          )}
        </>
      )}

            {phase === "game" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <svg width="32" height="32" viewBox="0 0 32 32">
                        <line x1="16" y1="4" x2="16" y2="11" stroke={crosshairRed ? "#ff3030" : "rgba(255,255,255,0.92)"} strokeWidth="1.5" strokeLinecap="square"/>
                        <line x1="16" y1="21" x2="16" y2="28" stroke={crosshairRed ? "#ff3030" : "rgba(255,255,255,0.92)"} strokeWidth="1.5" strokeLinecap="square"/>
                        <line x1="4" y1="16" x2="11" y2="16" stroke={crosshairRed ? "#ff3030" : "rgba(255,255,255,0.92)"} strokeWidth="1.5" strokeLinecap="square"/>
                        <line x1="21" y1="16" x2="28" y2="16" stroke={crosshairRed ? "#ff3030" : "rgba(255,255,255,0.92)"} strokeWidth="1.5" strokeLinecap="square"/>
                        <circle cx="16" cy="16" r="1.2" fill={crosshairRed ? "#ff3030" : "rgba(255,255,255,0.6)"}/>
          </svg>
        </div>
      )}

            {hitIndicator && phase === "game" && (
        <div className="absolute pointer-events-none z-40 text-center"
             style={{top:"calc(50% - 64px)",left:"50%",transform:"translateX(-50%)"}}>
          <div className="tracking-[0.1em] uppercase leading-none"
               style={{color: hitIndicator.zone === "head" ? "#fbbf24" : hitIndicator.zone === "leg" ? "#38bdf8" : "#ffffff",
                       fontSize: hitIndicator.zone === "head" ? "11px" : "10px"}}>
            {hitIndicator.zone === "head" ? "CABEÇA" : hitIndicator.zone === "leg" ? "PERNA" : "ACERTO"}
          </div>
          <div className="tabular-nums mt-0.5 font-bold"
               style={{color: hitIndicator.zone === "head" ? "#fbbf24" : hitIndicator.zone === "leg" ? "#38bdf8" : "rgba(255,255,255,0.85)",
                       fontSize: hitIndicator.zone === "head" ? "26px" : "22px",
                       textShadow: hitIndicator.zone === "head" ? "0 0 20px rgba(251,191,36,0.6)" : "none"}}>
            {hitIndicator.damage}
          </div>
        </div>
      )}
    </div>
  );
}

function ShopOverlay({ credits, currentWeapon, shield, onBuy, onSell, onBuyShield, onSellShield, timer, round, myRounds, enemyRounds, myNick, enemyNick }) {
  return (
    <div className="absolute inset-0 z-40 flex" style={{background:'rgba(9,11,18,0.97)'}}>

            <div className="w-60 flex flex-col border-r border-gray-700/60 p-4 gap-3 shrink-0">

                <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 font-medium mb-3">Placar — Melhor de 5</div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <div className="text-[11px] text-gray-400 truncate mb-0.5">{myNick}</div>
              <div className="text-3xl font-bold text-green-400 tabular-nums">{myRounds}</div>
            </div>
            <div className="text-gray-600 text-xl font-light">:</div>
            <div className="flex-1 text-right">
              <div className="text-[11px] text-gray-400 truncate mb-0.5">{enemyNick}</div>
              <div className="text-3xl font-bold text-red-400 tabular-nums">{enemyRounds}</div>
            </div>
          </div>
        </div>

                <div className="bg-gray-800 rounded-xl p-4 flex gap-3 items-center">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Tempo</div>
            <div className={`text-4xl font-bold tabular-nums leading-none ${timer <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
              {String(timer).padStart(2,'0')}
            </div>
          </div>
          <div className="w-px h-10 bg-gray-700"/>
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Créditos</div>
            <div className="text-2xl font-bold text-amber-400 tabular-nums leading-none">{credits.toLocaleString()}</div>
          </div>
        </div>

                <div className="bg-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 font-medium mb-3">Armadura</div>
          <div className="flex flex-col gap-2">
            {[{hp:25, label:'Escudo Leve', price:400},{hp:50, label:'Escudo Pesado', price:1000}].map(s => {
              const exact = shield === s.hp, surpassed = shield > s.hp;
              const canBuy = !exact && !surpassed && credits >= s.price;
              return (
                <div key={s.hp}
                  onClick={() => { if (canBuy) onBuyShield(s.hp, s.price); }}
                  className={`rounded-lg p-3 flex items-center justify-between transition-all ${
                    exact     ? 'bg-sky-950 border border-sky-600/60 cursor-default' :
                    canBuy    ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer border border-gray-600' :
                    surpassed ? 'opacity-20 bg-gray-700/30 border border-gray-700/20 cursor-default' :
                                'opacity-40 bg-gray-700/30 border border-gray-700/40 cursor-default'
                  }`}>
                  <div>
                    <div className={`text-sm font-medium ${exact ? 'text-sky-300' : 'text-gray-200'}`}>{s.label}</div>
                    <div className="text-xs text-gray-500">+{s.hp} escudo</div>
                  </div>
                  {exact ? (
                    <button onClick={e => { e.stopPropagation(); onSellShield(); }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-800/70 transition font-medium">
                      Vender
                    </button>
                  ) : (
                    <span className={`text-sm font-bold ${canBuy ? 'text-amber-400' : 'text-gray-600'}`}>
                      {surpassed ? '—' : s.price.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

                <div className="bg-gray-800 rounded-xl p-4 mt-auto">
          <div className="text-xs text-gray-500 font-medium mb-2.5">Habilidades</div>
          {[['Q','Blindside'],['E','Gatecrash'],['C','Fakeout'],['X','Dimensional Drift']].map(([k,n]) => (
            <div key={k} className="flex items-center gap-2 mb-1.5 text-sm text-gray-400">
              <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 text-gray-300 text-[10px] font-bold shrink-0">{k}</span>
              {n}
            </div>
          ))}
        </div>
      </div>

            <div className="flex-1 p-5 overflow-y-auto">
        <div className="text-xs text-gray-500 font-medium mb-4">Arsenal</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(WEAPONS).map(([id, w]) => {
            const owned = id === currentWeapon;
            const canBuy = !owned && credits >= w.price;
            return (
              <div key={id}
                onClick={() => { if (canBuy) onBuy(id); }}
                className={`rounded-xl p-4 flex flex-col gap-2.5 transition-all border ${
                  owned   ? 'bg-gray-700' :
                  canBuy  ? 'bg-gray-800 hover:bg-gray-700 cursor-pointer border-gray-700' :
                            'bg-gray-800/40 border-gray-800 opacity-35'
                }`}
                style={owned ? {borderColor: w.color, borderWidth:'2px'} : {}}>

                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-sm" style={{color: owned ? w.color : canBuy ? '#e5e5e5' : '#555'}}>{w.name}</span>
                  {w.auto && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-600/80 text-gray-400 font-medium">AUTO</span>}
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {[['Cab', Math.round(w.damage*2.5), 'text-amber-400'],
                    ['Corp', w.damage, 'text-gray-300'],
                    ['Perna', Math.round(w.damage*0.75), 'text-gray-400']].map(([lbl, val, col]) => (
                    <div key={lbl} className="bg-gray-900/60 rounded-lg p-1.5 text-center">
                      <div className={`text-sm font-bold tabular-nums ${col}`}>{val}</div>
                      <div className="text-[9px] text-gray-600 mt-0.5">{lbl}</div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-gray-500">{w.maxAmmo} mun</div>

                <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-700/50">
                  <span className="text-sm font-bold"
                        style={{color: owned ? w.color : canBuy ? '#fbbf24' : '#333'}}>
                    {owned ? 'Equipado' : w.price === 0 ? 'Grátis' : w.price.toLocaleString()}
                  </span>
                  {owned && w.price > 0 && (
                    <button onClick={e => { e.stopPropagation(); onSell(id); }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-800/70 transition font-medium">
                      Vender
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AbilityBar({ cooldownUI, flashCharges, cloneCharges, ultPoints, hasTpMarker }) {
  const abilities = [
    { key:"Q", name:"Blindside",       charges:flashCharges,         max:2, cd:cooldownUI.flash,    accent:"#38bdf8", isUlt:false },
    { key:"E", name:"Gatecrash",       charges:hasTpMarker ? 1 : 0, max:1, cd:cooldownUI.teleport, accent:"#2dd4bf", isUlt:false },
    { key:"C", name:"Fakeout",         charges:cloneCharges,         max:2, cd:cooldownUI.clone,    accent:"#4ade80", isUlt:false },
    { key:"X", name:"D. Drift",        charges:0,                    max:0, cd:0,                   accent:"#fbbf24", isUlt:true  },
  ];
  return (
    <div className="absolute bottom-[104px] left-1/2 -translate-x-1/2 z-30 flex gap-1.5 pointer-events-none">
      {abilities.map(ab => {
        const isReady = ab.isUlt ? ultPoints >= 7 : ab.charges > 0;
        const isCd    = ab.cd > 0;
        return (
          <div key={ab.key} className="rounded-xl flex flex-col gap-1.5 transition-all"
               style={{
                 width:'76px', padding:'8px 10px 9px',
                 background: isReady ? 'rgba(26,29,42,0.96)' : 'rgba(14,16,24,0.92)',
                 border:`1px solid ${isReady ? ab.accent+'55' : 'rgba(255,255,255,0.07)'}`,
                 borderTop:`2px solid ${isReady ? ab.accent : 'rgba(255,255,255,0.07)'}`,
                 opacity: isCd ? 0.5 : 1,
               }}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-gray-500">[{ab.key}]</span>
              {isCd && <span className="text-[9px] text-red-400 font-bold tabular-nums">{(ab.cd/1000).toFixed(1)}s</span>}
            </div>
            <div className="text-[10px] font-semibold leading-tight"
                 style={{color: isReady ? ab.accent : 'rgba(255,255,255,0.3)'}}>{ab.name}</div>
            {ab.isUlt ? (
              <div className="flex gap-0.5 flex-wrap">
                {Array.from({length:7}).map((_,i) => (
                  <div key={i} className="rounded-sm transition-all"
                       style={{width:'7px',height:'7px',
                         background: i < ultPoints ? ab.accent : 'rgba(255,255,255,0.08)'}}/>
                ))}
              </div>
            ) : (
              <div className="flex gap-1">
                {Array.from({length:ab.max}).map((_,i) => (
                  <div key={i} className="flex-1 rounded-full transition-all"
                       style={{height:'3px', background: i < ab.charges ? ab.accent : 'rgba(255,255,255,0.10)'}}/>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EndScreen({ win, onExit }) {
  useEffect(() => {
    const audio = new Audio(win ? "/Vitoria.mp3" : "/Derrota.mp3");
    audio.volume = 0.7;
    audio.play().catch(() => {});
    if (win) {
      const end = Date.now() + 4000;
      const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"];
      const frame = () => {
        confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: Math.random(), y: 0 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
    return () => { audio.pause(); audio.currentTime = 0; confetti.reset(); };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="bg-gray-800 p-10 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-6 items-center text-center">
        <div className="text-[10px] tracking-[0.18em] text-gray-500 uppercase">Partida Terminada</div>
        <div className={`text-6xl font-bold leading-none ${win ? 'text-amber-400' : 'text-gray-500'}`}>
          {win ? "VITÓRIA" : "DERROTA"}
        </div>
        <div className="w-full h-px bg-gray-700"/>
        <button onClick={onExit}
          className="w-full py-4 bg-blue-500 text-white rounded-xl text-base font-bold hover:bg-blue-600 transition hover:scale-[1.02]">
          Voltar ao Perfil
        </button>
      </div>
    </div>
  );
}

function buildArena(scene) {
  const half = MAP_SIZE / 2;
  const collidables = [];
  const meshes = [];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    new THREE.MeshLambertMaterial({ color: 0x2a2a3a })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  meshes.push(floor);
  scene.add(new THREE.GridHelper(MAP_SIZE, 80, 0x444466, 0x333355));

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
  const WALL_H  = 18;
  [
    [MAP_SIZE + 2, WALL_H, 2, 0,    WALL_H / 2, -half],
    [MAP_SIZE + 2, WALL_H, 2, 0,    WALL_H / 2,  half],
    [2, WALL_H, MAP_SIZE + 2, -half, WALL_H / 2, 0],
    [2, WALL_H, MAP_SIZE + 2,  half, WALL_H / 2, 0],
  ].forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    scene.add(m);
    meshes.push(m);
    collidables.push({ minX: x - w/2, maxX: x + w/2, minY: y - h/2, maxY: y + h/2, minZ: z - d/2, maxZ: z + d/2 });
  });

  const boxMat = new THREE.MeshLambertMaterial({ color: 0x7a4d2a });
  const boxGeo = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
  const rng = [[-3,-3],[-3,0],[-3,3],[0,-3],[0,3],[3,-3],[3,0],[3,3],
               [-2,-2],[-2,2],[2,-2],[2,2],[0,-1],[0,1],[-1,0],[1,0]];
  rng.forEach(([gx, gz]) => {
    const x = gx * 22;
    const z = gz * 22;
    if (Math.abs(x) > half - 10 || Math.abs(z) > half - 10) return;
    const y = BOX_H / 2;
    const m = new THREE.Mesh(boxGeo, boxMat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
    collidables.push({
      minX: x - BOX_W/2, maxX: x + BOX_W/2,
      minY: 0,           maxY: BOX_H,
      minZ: z - BOX_D/2, maxZ: z + BOX_D/2,
    });
  });

  return { collidables, meshes };
}

function resolveCollision(px, pz, prevX, prevZ, g) {
  const PR = 0.4;
  const playerBottom = g.pos.y - PLAYER_HEIGHT;
  const playerTop    = g.pos.y + PLAYER_HEIGHT * 0.5;

  for (const b of g.collidables) {
    if (playerTop < b.minY || playerBottom > b.maxY) continue;
    const inside =
      px + PR > b.minX && px - PR < b.maxX &&
      pz + PR > b.minZ && pz - PR < b.maxZ;
    if (!inside) continue;

    const solveX = !(prevX + PR > b.minX && prevX - PR < b.maxX && pz + PR > b.minZ && pz - PR < b.maxZ);
    const solveZ = !(px + PR > b.minX && px - PR < b.maxX && prevZ + PR > b.minZ && prevZ - PR < b.maxZ);

    if (solveX)      px = prevX;
    else if (solveZ) pz = prevZ;
    else             { px = prevX; pz = prevZ; }
  }
  return { px, pz };
}

export default Jogo;
