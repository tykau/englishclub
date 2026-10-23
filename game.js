(() => {
  "use strict";

  const WORLD_W = 480;
  const GROUND_H = 92;
  const PLAYER_X = 116;
  const GRAVITY = 1900;
  const FLAP_VELOCITY = -562;
  const MAX_FALL_SPEED = 960;
  const PIPE_W = 112;
  const MIN_WALL = 112;
  const HIT_RX = 17;
  const HIT_RY = 28;
  const STORAGE_BEST = "school-flappy-best-v1";
  const STORAGE_MUTED = "school-flappy-muted-v1";
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  const REASON_FONT = `800 12.5px ${FONT}`;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const shell = document.getElementById("gameShell");
  const scoreEl = document.getElementById("score");
  const scoreBadge = document.getElementById("scoreBadge");
  const callsWord = document.getElementById("callsWord");
  const bestHud = document.getElementById("bestHud");
  const startOverlay = document.getElementById("startOverlay");
  const endOverlay = document.getElementById("endOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const resumeButton = document.getElementById("resumeButton");
  const soundButton = document.getElementById("soundButton");
  const pauseButton = document.getElementById("pauseButton");
  const startBest = document.getElementById("startBest");
  const endScore = document.getElementById("endScore");
  const endBest = document.getElementById("endBest");
  const endReason = document.getElementById("endReason");
  const endReasonLabel = document.getElementById("endReasonLabel");
  const endEyebrow = document.getElementById("endEyebrow");
  const newRecord = document.getElementById("newRecord");

  const REASONS = [
    "Домашка не сделана",
    "Опоздал на урок",
    "Разговоры на уроке",
    "Забыл сменку",
    "Телефон на уроке",
    "Дневник не сдан",
    "Сорвал контрольную",
    "Рисовал на парте",
    "Потерял учебник",
    "Без школьной формы",
    "Не выучил стихи",
    "Бегал по коридору",
    "Забыл тетрадь",
    "Проспал линейку",
    "Стрелял бумажками",
    "Не был на физкультуре"
  ];

  function readNumber(key, fallback) {
    try {
      const value = Number.parseInt(localStorage.getItem(key), 10);
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readBoolean(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === "1";
    } catch {
      return fallback;
    }
  }

  function saveValue(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Storage can be unavailable in private or embedded contexts. */
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function callsLabel(value) {
    const lastTwo = value % 100;
    const last = value % 10;
    if (last === 1 && lastTwo !== 11) return "вызов";
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "вызова";
    return "вызовов";
  }

  const state = {
    mode: "ready",
    time: 0,
    score: 0,
    best: readNumber(STORAGE_BEST, 0),
    previousBest: 0,
    muted: readBoolean(STORAGE_MUTED, false),
    speed: 192,
    pipes: [],
    particles: [],
    floaters: [],
    clouds: [],
    planes: [],
    reasonBag: [],
    lastSpawnReason: "",
    lastGapY: null,
    lastCollisionReason: "",
    lastCollisionLabel: "Последняя причина",
    shake: 0,
    flash: 0,
    groundOffset: 0,
    readyY: 300,
    overAt: 0,
    deathTimer: 0,
    pipeId: 0
  };

  const student = {
    x: PLAYER_X,
    y: 300,
    vy: 0,
    rot: 0,
    arm: 0
  };

  let viewH = 800;
  let playBottom = viewH - GROUND_H;
  let canvasScaleX = 1;
  let canvasScaleY = 1;
  let lastFrame = performance.now();

  function createSoundEngine() {
    const sound = {
      muted: state.muted,
      ctx: null,
      master: null,

      ensure() {
        if (this.muted) return false;
        if (!this.ctx) {
          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtor) return false;
          try {
            this.ctx = new AudioCtor();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.72;
            this.master.connect(this.ctx.destination);
          } catch {
            return false;
          }
        }
        if (this.ctx.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
        return true;
      },

      setMuted(muted) {
        this.muted = muted;
        if (this.master && this.ctx) {
          this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.012);
        }
      },

      tone(frequency, duration, options = {}) {
        if (!this.ensure()) return;
        const c = this.ctx;
        const type = options.type || "sine";
        const volume = options.volume || 0.055;
        const delay = options.delay || 0;
        const start = c.currentTime + delay;
        const oscillator = c.createOscillator();
        const gain = c.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
        if (options.endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, options.endFrequency),
            start + duration
          );
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.015, duration * 0.3));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      },

      noise(duration, volume, options = {}) {
        if (!this.ensure()) return;
        const c = this.ctx;
        const length = Math.max(1, Math.floor(c.sampleRate * duration));
        const buffer = c.createBuffer(1, length, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }
        const source = c.createBufferSource();
        source.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = options.type || "lowpass";
        filter.frequency.value = options.frequency || 900;
        const gain = c.createGain();
        const start = c.currentTime + (options.delay || 0);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        source.start(start);
        source.stop(start + duration);
      },

      flap() {
        this.tone(330, 0.09, { type: "triangle", endFrequency: 190, volume: 0.045 });
        this.noise(0.055, 0.016, { frequency: 1400, type: "bandpass" });
      },

      score() {
        this.tone(740, 0.08, { type: "sine", volume: 0.045 });
        this.tone(1050, 0.11, { type: "sine", volume: 0.04, delay: 0.06 });
      },

      hit() {
        this.noise(0.22, 0.11, { frequency: 540, type: "lowpass" });
        this.tone(160, 0.3, { type: "sine", endFrequency: 55, volume: 0.08 });
      },

      start() {
        this.tone(440, 0.08, { type: "triangle", volume: 0.035 });
        this.tone(554, 0.09, { type: "triangle", volume: 0.035, delay: 0.07 });
        this.tone(659, 0.12, { type: "triangle", volume: 0.035, delay: 0.14 });
      }
    };
    return sound;
  }

  const sound = createSoundEngine();

  function regenerateReasons() {
    state.reasonBag = shuffle(REASONS);
    if (state.reasonBag[state.reasonBag.length - 1] === state.lastSpawnReason) {
      state.reasonBag.unshift(state.reasonBag.pop());
    }
  }

  function takeReason() {
    if (!state.reasonBag.length) regenerateReasons();
    const reason = state.reasonBag.pop();
    state.lastSpawnReason = reason;
    return reason;
  }

  function roundedPath(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(text, maxWidth, font) {
    ctx.save();
    ctx.font = font;
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }

  function ellipseHitsRect(cx, cy, rx, ry, x, y, width, height) {
    const nearestX = clamp(cx, x, x + width);
    const nearestY = clamp(cy, y, y + height);
    const dx = (cx - nearestX) / rx;
    const dy = (cy - nearestY) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function makeClouds() {
    state.clouds = Array.from({ length: 9 }, () => ({
      x: random(-40, WORLD_W + 80),
      yRatio: random(0.055, 0.55),
      scale: random(0.55, 1.12),
      speed: random(4, 12),
      alpha: random(0.42, 0.82),
      phase: random(0, Math.PI * 2)
    }));
  }

  function makePlanes() {
    state.planes = Array.from({ length: 3 }, (_, index) => ({
      x: random(0, WORLD_W),
      yRatio: random(0.13, 0.42),
      scale: random(0.58, 0.95),
      speed: random(9, 15),
      phase: random(0, Math.PI * 2) + index
    }));
  }

  function updateAmbient(dt) {
    for (const cloud of state.clouds) {
      cloud.x -= cloud.speed * dt;
      if (cloud.x < -140) {
        cloud.x = WORLD_W + random(70, 260);
        cloud.yRatio = random(0.055, 0.55);
        cloud.scale = random(0.55, 1.12);
      }
    }
    for (const plane of state.planes) {
      plane.x -= plane.speed * dt;
      if (plane.x < -90) {
        plane.x = WORLD_W + random(30, 240);
        plane.yRatio = random(0.13, 0.42);
      }
    }
  }

  function drawCloud(x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff9e9";
    ctx.beginPath();
    ctx.ellipse(0, 5, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-27, -5, 17, 0, Math.PI * 2);
    ctx.arc(-5, -17, 23, 0, Math.PI * 2);
    ctx.arc(22, -7, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.38;
    ctx.fillStyle = "#d3dfcf";
    ctx.beginPath();
    ctx.ellipse(1, 12, 35, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSun() {
    const x = WORLD_W - 79;
    const y = 108 + Math.sin(state.time * 0.28) * 2;
    const glow = ctx.createRadialGradient(x, y, 8, x, y, 86);
    glow.addColorStop(0, "rgba(255, 226, 122, 0.55)");
    glow.addColorStop(1, "rgba(255, 224, 110, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 90, y - 90, 180, 180);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.time * 0.018);
    ctx.strokeStyle = "rgba(244, 182, 55, 0.55)";
    ctx.lineWidth = 2.3;
    ctx.lineCap = "round";
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 38, Math.sin(angle) * 38);
      ctx.lineTo(Math.cos(angle) * 46, Math.sin(angle) * 46);
      ctx.stroke();
    }
    ctx.rotate(-state.time * 0.018);
    ctx.fillStyle = "#ffd76d";
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(195, 132, 34, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 248, 210, 0.55)";
    ctx.beginPath();
    ctx.arc(-9, -10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHills() {
    const base = playBottom + 2;
    ctx.fillStyle = "rgba(154, 190, 145, 0.55)";
    ctx.beginPath();
    ctx.moveTo(-20, base);
    ctx.lineTo(-20, base - 45);
    ctx.quadraticCurveTo(55, base - 102, 138, base - 48);
    ctx.quadraticCurveTo(183, base - 22, 238, base - 56);
    ctx.quadraticCurveTo(326, base - 110, 500, base - 40);
    ctx.lineTo(500, base);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(113, 158, 118, 0.5)";
    ctx.beginPath();
    ctx.moveTo(-20, base);
    ctx.lineTo(-20, base - 16);
    ctx.quadraticCurveTo(80, base - 62, 165, base - 20);
    ctx.quadraticCurveTo(260, base - 2, 342, base - 26);
    ctx.quadraticCurveTo(422, base - 44, 500, base - 17);
    ctx.lineTo(500, base);
    ctx.closePath();
    ctx.fill();
  }

  function drawTree(x, base, size, hue) {
    ctx.save();
    ctx.translate(x, base);
    ctx.globalAlpha = 0.76;
    ctx.fillStyle = "#6d5033";
    roundedPath(-4, -38 * size, 8, 42 * size, 3);
    ctx.fill();
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(-11 * size, -44 * size, 17 * size, 0, Math.PI * 2);
    ctx.arc(5 * size, -54 * size, 21 * size, 0, Math.PI * 2);
    ctx.arc(17 * size, -41 * size, 15 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fdf5d9";
    ctx.beginPath();
    ctx.arc(1 * size, -61 * size, 9 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSchool() {
    const base = playBottom + 4;
    const width = 286;
    const bodyH = 128;
    const x = (WORLD_W - width) / 2;
    const y = base - bodyH;
    const centerX = WORLD_W / 2;

    ctx.save();
    ctx.globalAlpha = 0.9;

    const wingColor = "rgba(224, 202, 151, 0.72)";
    ctx.fillStyle = wingColor;
    ctx.fillRect(x - 38, y + 42, 48, bodyH - 42);
    ctx.fillRect(x + width - 10, y + 42, 48, bodyH - 42);
    ctx.fillStyle = "rgba(167, 130, 84, 0.2)";
    ctx.fillRect(x - 38, y + bodyH - 6, 48, 6);
    ctx.fillRect(x + width - 10, y + bodyH - 6, 48, 6);

    const facade = ctx.createLinearGradient(0, y, 0, base);
    facade.addColorStop(0, "rgba(241, 220, 174, 0.96)");
    facade.addColorStop(1, "rgba(221, 193, 143, 0.94)");
    ctx.fillStyle = facade;
    ctx.fillRect(x, y, width, bodyH);

    ctx.fillStyle = "rgba(180, 136, 82, 0.32)";
    ctx.fillRect(x, y, width, 7);
    ctx.fillStyle = "rgba(255, 249, 224, 0.48)";
    ctx.fillRect(x + 7, y + 10, width - 14, 4);

    const roofColor = "#b45f4b";
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 2);
    ctx.lineTo(x + width + 12, y + 2);
    ctx.lineTo(x + width - 8, y - 29);
    ctx.lineTo(x + 8, y - 29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(95, 50, 42, 0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#c66d54";
    ctx.beginPath();
    ctx.moveTo(centerX - 43, y - 28);
    ctx.lineTo(centerX, y - 65);
    ctx.lineTo(centerX + 43, y - 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(95, 50, 42, 0.35)";
    ctx.stroke();

    ctx.fillStyle = "#f8ebc8";
    ctx.beginPath();
    ctx.arc(centerX, y - 26, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a14c3f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "#6b4233";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(centerX, y - 26);
    ctx.lineTo(centerX, y - 34);
    ctx.moveTo(centerX, y - 26);
    ctx.lineTo(centerX + 5, y - 23);
    ctx.stroke();

    const cols = 6;
    const rows = 2;
    const winW = 24;
    const winH = 20;
    const gap = 16;
    const startX = x + (width - (cols * winW + (cols - 1) * gap)) / 2;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const wx = startX + col * (winW + gap);
        const wy = y + 28 + row * 36;
        ctx.fillStyle = "rgba(250, 240, 208, 0.92)";
        roundedPath(wx - 2, wy - 2, winW + 4, winH + 4, 3);
        ctx.fill();
        const glass = ctx.createLinearGradient(wx, wy, wx + winW, wy + winH);
        glass.addColorStop(0, "rgba(112, 170, 180, 0.88)");
        glass.addColorStop(1, "rgba(77, 131, 150, 0.9)");
        ctx.fillStyle = glass;
        ctx.fillRect(wx, wy, winW, winH);
        ctx.fillStyle = "rgba(255, 250, 225, 0.34)";
        ctx.beginPath();
        ctx.moveTo(wx + 2, wy + 2);
        ctx.lineTo(wx + 10, wy + 2);
        ctx.lineTo(wx + 2, wy + 11);
        ctx.closePath();
        ctx.fill();
      }
    }

    const doorW = 40;
    const doorH = 46;
    const doorX = centerX - doorW / 2;
    const doorY = base - doorH;
    ctx.fillStyle = "rgba(125, 68, 57, 0.9)";
    roundedPath(doorX, doorY, doorW, doorH, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(247, 231, 193, 0.8)";
    ctx.fillRect(doorX + 6, doorY - 7, doorW - 12, 8);
    ctx.fillStyle = "#e4c781";
    ctx.beginPath();
    ctx.arc(doorX + doorW - 9, doorY + 24, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(23, 52, 58, 0.68)";
    ctx.font = `900 7px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("ШКОЛА №7", centerX, y - 7);

    ctx.strokeStyle = "rgba(94, 67, 43, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, y - 65);
    ctx.lineTo(centerX, y - 99);
    ctx.stroke();
    ctx.fillStyle = "#cf4234";
    ctx.beginPath();
    ctx.moveTo(centerX + 1, y - 98);
    ctx.lineTo(centerX + 27, y - 90);
    ctx.lineTo(centerX + 1, y - 82);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawPlane(x, y, scale, phase) {
    ctx.save();
    ctx.translate(x, y + Math.sin(state.time * 1.4 + phase) * 7);
    ctx.rotate(-0.18 + Math.sin(state.time * 1.1 + phase) * 0.13);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "rgba(23, 52, 58, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.quadraticCurveTo(54, -8, 78, -2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 250, 235, 0.9)";
    ctx.strokeStyle = "rgba(23, 52, 58, 0.24)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(17, -9);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(7, 8);
    ctx.lineTo(3, -1);
    ctx.stroke();
    ctx.restore();
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, playBottom);
    sky.addColorStop(0, "#79c8e3");
    sky.addColorStop(0.5, "#b6e1df");
    sky.addColorStop(0.82, "#e9efce");
    sky.addColorStop(1, "#f7e8bb");
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, WORLD_W + 80, playBottom + 80);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = 1;
    for (let x = 24; x < WORLD_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, playBottom);
      ctx.stroke();
    }
    for (let y = 32; y < playBottom; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }
    ctx.restore();

    drawSun();

    for (const cloud of state.clouds) {
      drawCloud(
        cloud.x,
        cloud.yRatio * playBottom + Math.sin(state.time * 0.3 + cloud.phase) * 3,
        cloud.scale,
        cloud.alpha
      );
    }

    drawHills();
    drawTree(41, playBottom + 4, 1.18, "rgba(76, 123, 90, 0.9)");
    drawTree(448, playBottom + 7, 0.93, "rgba(88, 133, 94, 0.86)");
    drawSchool();

    for (const plane of state.planes) {
      drawPlane(plane.x, plane.yRatio * playBottom, plane.scale, plane.phase);
    }

    const haze = ctx.createLinearGradient(0, playBottom - 90, 0, playBottom);
    haze.addColorStop(0, "rgba(255, 246, 210, 0)");
    haze.addColorStop(1, "rgba(255, 246, 210, 0.28)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, playBottom - 90, WORLD_W, 90);
  }

  function drawGround() {
    const y = playBottom;
    const base = ctx.createLinearGradient(0, y, 0, viewH);
    base.addColorStop(0, "#ead6a4");
    base.addColorStop(1, "#d9bc84");
    ctx.fillStyle = base;
    ctx.fillRect(0, y + 12, WORLD_W, GROUND_H + 8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + 12, WORLD_W, GROUND_H + 8);
    ctx.clip();
    ctx.strokeStyle = "rgba(101, 76, 39, 0.14)";
    ctx.lineWidth = 1.5;
    const offset = state.groundOffset % 56;
    for (let x = -offset - 20; x < WORLD_W + 70; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + 29, viewH);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(101, 76, 39, 0.09)";
    for (let lineY = y + 31; lineY < viewH; lineY += 26) {
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(WORLD_W, lineY);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 249, 225, 0.26)";
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 34]);
    ctx.lineDashOffset = -state.groundOffset;
    ctx.beginPath();
    ctx.moveTo(0, y + 56);
    ctx.lineTo(WORLD_W, y + 56);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.fillStyle = "#7ba45c";
    ctx.fillRect(0, y, WORLD_W, 14);
    ctx.fillStyle = "#456d3e";
    ctx.fillRect(0, y, WORLD_W, 4);

    ctx.strokeStyle = "#86b466";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const bladeOffset = state.groundOffset % 18;
    for (let x = -bladeOffset; x < WORLD_W + 18; x += 18) {
      const blade = (x * 7) % 11;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.quadraticCurveTo(x + 2, y - 3 - blade, x + 5, y - 5 - blade * 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 249, 224, 0.58)";
    ctx.fillRect(0, viewH - 7, WORLD_W, 7);
    ctx.fillStyle = "rgba(23, 52, 58, 0.18)";
    ctx.fillRect(0, viewH - 9, WORLD_W, 2);
  }

  function handleResize() {
    const rect = shell.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const oldH = viewH;
    const oldPlayBottom = playBottom;
    const newH = (WORLD_W * rect.height) / rect.width;

    viewH = newH;
    playBottom = viewH - GROUND_H;
    state.readyY = playBottom * 0.445;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvasScaleX = canvas.width / WORLD_W;
    canvasScaleY = canvas.height / viewH;

    if (oldH > 1 && Math.abs(oldH - viewH) > 1) {
      const ratio = viewH / oldH;
      if (state.mode === "playing" || state.mode === "dying" || state.mode === "paused") {
        student.y *= ratio;
        for (const pipe of state.pipes) {
          pipe.gapY *= ratio;
          const halfGap = pipe.gapH / 2;
          pipe.gapY = clamp(pipe.gapY, MIN_WALL + halfGap, playBottom - MIN_WALL - halfGap);
        }
      }
    }

    if (state.mode === "ready") {
      student.y = state.readyY;
    } else {
      student.y = clamp(student.y, 52, playBottom - 20);
    }

    if (Math.abs(oldPlayBottom - playBottom) > 1 && state.mode === "ready") {
      student.y = state.readyY;
    }
  }

  function currentSpeed() {
    return 192 + Math.min(state.score * 3.2, 92);
  }

  function currentGap() {
    const available = playBottom - MIN_WALL * 2 - 8;
    return Math.max(156, Math.min(216 - state.score * 1.45, available));
  }

  function currentSpacing() {
    return 332 + Math.min(state.score * 2.6, 98);
  }

  function createPipe(x) {
    const gapH = currentGap();
    const halfGap = gapH / 2;
    const minCenter = MIN_WALL + halfGap;
    const maxCenter = playBottom - MIN_WALL - halfGap;
    const travel = Math.min(148, playBottom * 0.2);
    let gapY;

    if (maxCenter <= minCenter) {
      gapY = playBottom / 2;
    } else if (state.lastGapY === null) {
      gapY = random(minCenter + 10, maxCenter - 10);
    } else {
      gapY = clamp(state.lastGapY + random(-travel, travel), minCenter, maxCenter);
    }

    if (Math.abs(gapY - state.lastGapY) < 32 && state.lastGapY !== null && maxCenter > minCenter) {
      gapY = clamp(gapY + (gapY < playBottom / 2 ? 40 : -40), minCenter, maxCenter);
    }

    state.lastGapY = gapY;
    const reason = takeReason();
    const lines = wrapText(reason, 82, REASON_FONT);
    state.pipeId += 1;
    state.pipes.push({
      x,
      w: PIPE_W,
      gapH,
      gapY,
      reason,
      reasonLines: lines,
      scored: false,
      id: state.pipeId
    });
  }

  function ensurePipes() {
    if (!state.pipes.length) {
      createPipe(WORLD_W + 72);
      return;
    }
    const last = state.pipes[state.pipes.length - 1];
    if (last.x < WORLD_W + 72 - currentSpacing()) {
      createPipe(last.x + currentSpacing());
    }
  }

  function drawWallSegment(pipe, y, height, isTop) {
    if (height <= 0) return;
    const x = pipe.x;
    const radius = 9;

    ctx.save();
    ctx.fillStyle = "rgba(5, 27, 32, 0.24)";
    roundedPath(x + 5, y + 5, PIPE_W, height, radius);
    ctx.fill();

    const board = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    board.addColorStop(0, "#1b454b");
    board.addColorStop(0.24, "#2a5b5d");
    board.addColorStop(0.72, "#1c474e");
    board.addColorStop(1, "#123841");
    ctx.fillStyle = board;
    roundedPath(x, y, PIPE_W, height, radius);
    ctx.fill();

    ctx.save();
    roundedPath(x, y, PIPE_W, height, radius);
    ctx.clip();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.lineWidth = 2;
    for (let lineX = -height; lineX < PIPE_W + height; lineX += 34) {
      ctx.beginPath();
      ctx.moveTo(x + lineX, y);
      ctx.lineTo(x + lineX + height, y + height);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(9, 34, 39, 0.38)";
    ctx.lineWidth = 2;
    for (let seam = y + 34; seam < y + height; seam += 84) {
      ctx.beginPath();
      ctx.moveTo(x + 3, seam);
      ctx.lineTo(x + PIPE_W - 3, seam);
      ctx.stroke();
    }

    ctx.fillStyle = "#e6cb91";
    ctx.fillRect(x + 3, y, 8, height);
    ctx.fillRect(x + PIPE_W - 11, y, 8, height);
    ctx.fillStyle = "rgba(119, 81, 36, 0.36)";
    ctx.fillRect(x + 11, y, 2, height);
    ctx.fillRect(x + PIPE_W - 13, y, 2, height);
    ctx.fillStyle = "rgba(255, 246, 214, 0.36)";
    ctx.fillRect(x + 4, y, 2, height);
    ctx.fillRect(x + PIPE_W - 10, y, 2, height);

    const seed = pipe.id * 37 + (isTop ? 11 : 23);
    ctx.fillStyle = "rgba(255, 249, 226, 0.26)";
    for (let i = 0; i < 6; i += 1) {
      const dotX = x + 20 + ((seed + i * 53) % (PIPE_W - 40));
      const dotY = y + 30 + ((seed + i * 97) % Math.max(30, height - 60));
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1.1 + (i % 2) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "#102f37";
    ctx.lineWidth = 3.5;
    roundedPath(x, y, PIPE_W, height, radius);
    ctx.stroke();

    const capY = isTop ? y + height - 14 : y;
    ctx.save();
    roundedPath(x + 4, capY + 1, PIPE_W - 8, 13, 3);
    ctx.clip();
    ctx.fillStyle = "#f3e3bb";
    ctx.fillRect(x + 4, capY + 1, PIPE_W - 8, 13);
    ctx.strokeStyle = "rgba(207, 66, 52, 0.58)";
    ctx.lineWidth = 5;
    for (let stripe = -18; stripe < PIPE_W + 18; stripe += 18) {
      ctx.beginPath();
      ctx.moveTo(x + stripe, capY + 15);
      ctx.lineTo(x + stripe + 16, capY);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(23, 52, 58, 0.72)";
    ctx.lineWidth = 1.5;
    roundedPath(x + 4, capY + 1, PIPE_W - 8, 13, 3);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 247, 220, 0.75)";
    for (const boltX of [x + 17, x + PIPE_W - 17]) {
      const boltY = isTop ? y + height - 27 : y + 27;
      if (boltY > y + 5 && boltY < y + height - 5) {
        ctx.beginPath();
        ctx.arc(boltX, boltY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawReasonCard(pipe) {
    const gapBottom = pipe.gapY + pipe.gapH / 2;
    const cardW = 104;
    const lines = pipe.reasonLines;
    const lineHeight = 14.5;
    const cardH = 37 + lines.length * lineHeight;
    const centerX = pipe.x + pipe.w / 2;
    const y = gapBottom + 16;
    const tilt = pipe.id % 2 === 0 ? -0.013 : 0.013;

    ctx.save();
    ctx.translate(centerX, y + cardH / 2);
    ctx.rotate(tilt);

    ctx.fillStyle = "rgba(5, 27, 32, 0.35)";
    roundedPath(-cardW / 2 + 3, -cardH / 2 + 4, cardW, cardH, 5);
    ctx.fill();

    const paper = ctx.createLinearGradient(0, -cardH / 2, 0, cardH / 2);
    paper.addColorStop(0, "#fffaf0");
    paper.addColorStop(1, "#f8eccd");
    ctx.fillStyle = paper;
    roundedPath(-cardW / 2, -cardH / 2, cardW, cardH, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(23, 52, 58, 0.68)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "rgba(207, 66, 52, 0.19)";
    ctx.fillRect(-cardW / 2 + 8, -cardH / 2 + 4, 1, cardH - 8);

    ctx.textAlign = "center";
    ctx.fillStyle = "#a9322a";
    ctx.font = `900 8px ${FONT}`;
    ctx.fillText("ВЫЗОВ В ШКОЛУ", 1, -cardH / 2 + 15);

    ctx.fillStyle = "#17343a";
    ctx.font = REASON_FONT;
    const firstLine = -cardH / 2 + 31;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], 1, firstLine + i * lineHeight);
    }

    ctx.fillStyle = "rgba(207, 66, 52, 0.8)";
    ctx.fillRect(-16, cardH / 2 - 9, 32, 1.5);

    ctx.fillStyle = "#cf4234";
    ctx.beginPath();
    ctx.arc(0, -cardH / 2 + 1, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 248, 225, 0.7)";
    ctx.beginPath();
    ctx.arc(-1.2, -cardH / 2 - 0.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawWarningBadge(pipe) {
    const gapTop = pipe.gapY - pipe.gapH / 2;
    const x = pipe.x + pipe.w / 2;
    const y = gapTop - 38;
    if (y < 28) return;

    ctx.save();
    ctx.fillStyle = "rgba(5, 27, 32, 0.28)";
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f6e7c3";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#17343a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#cf4234";
    ctx.font = `900 29px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y + 1);
    ctx.restore();
  }

  function drawPipe(pipe) {
    const gapTop = pipe.gapY - pipe.gapH / 2;
    const gapBottom = pipe.gapY + pipe.gapH / 2;
    drawWallSegment(pipe, -32, gapTop + 32, true);
    drawWallSegment(pipe, gapBottom, playBottom - gapBottom + 12, false);
    drawWarningBadge(pipe);
    drawReasonCard(pipe);
  }

  function drawPipes() {
    for (const pipe of state.pipes) {
      if (pipe.x > WORLD_W + 20 || pipe.x + pipe.w < -30) continue;
      drawPipe(pipe);
    }
  }

  function strokeLimb(x1, y1, x2, y2, width, color, bendX, bendY) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = width + 2.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(bendX, bendY, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(bendX, bendY, x2, y2);
    ctx.stroke();
  }

  function drawBackpack() {
    ctx.save();
    ctx.translate(-17, 4);
    ctx.fillStyle = "#b95e2c";
    roundedPath(-13, -18, 22, 35, 6);
    ctx.fill();
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 2;
    ctx.stroke();
    const packGradient = ctx.createLinearGradient(-13, 0, 9, 0);
    packGradient.addColorStop(0, "rgba(255, 184, 103, 0.25)");
    packGradient.addColorStop(1, "rgba(80, 29, 10, 0.16)");
    ctx.fillStyle = packGradient;
    roundedPath(-13, -18, 22, 35, 6);
    ctx.fill();
    ctx.fillStyle = "#d47a3c";
    roundedPath(-9, -12, 15, 11, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(23, 42, 46, 0.68)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#f6dc9a";
    ctx.fillRect(-7, 3, 11, 3);
    ctx.fillStyle = "#7a3e24";
    ctx.beginPath();
    ctx.arc(-4, 1, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(5, -22);
    ctx.rotate(0.32);
    ctx.fillStyle = "#f1c748";
    ctx.fillRect(-2.5, 0, 5, 12);
    ctx.fillStyle = "#e8b87b";
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#cf4234";
    ctx.fillRect(-2.5, 10, 5, 2);
    ctx.restore();
    ctx.restore();
  }

  function drawStudent() {
    const armUp = clamp(student.arm, 0, 1);
    const idle = state.mode === "ready" ? Math.sin(state.time * 2.2) : 0;
    const twitch = Math.sin(state.time * 13) * 0.5;
    const legKick = armUp * 4 + (state.mode === "playing" ? Math.sin(state.time * 16) * 1.5 : 0);

    ctx.save();
    ctx.translate(student.x, student.y + idle * 3);
    ctx.rotate(student.rot);
    ctx.scale(0.94, 0.94);

    // Back arm
    const backHandX = -17 + armUp * 1;
    const backHandY = 15 - armUp * 24;
    strokeLimb(-7, -5, backHandX, backHandY, 7, "#224763", -14, 4 - armUp * 8);
    ctx.fillStyle = "#efc29a";
    ctx.beginPath();
    ctx.arc(backHandX, backHandY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Back leg
    const backFootX = -9 - legKick;
    const backFootY = 37 - armUp * 7;
    strokeLimb(-4, 17, backFootX, backFootY, 7.5, "#31485e", -10, 28);
    ctx.fillStyle = "#1b252d";
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(backFootX - 1, backFootY + 1, 7, 4, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawBackpack();

    // Rear collar and neck
    ctx.fillStyle = "#efc29a";
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 2;
    roundedPath(-1, -20, 8, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Jacket torso
    const jacket = ctx.createLinearGradient(-13, -8, 14, 22);
    jacket.addColorStop(0, "#3f7396");
    jacket.addColorStop(0.55, "#2d5e82");
    jacket.addColorStop(1, "#20465f");
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.moveTo(-11, -9);
    ctx.quadraticCurveTo(-15, 5, -11, 19);
    ctx.quadraticCurveTo(-2, 24, 10, 18);
    ctx.quadraticCurveTo(14, 5, 10, -8);
    ctx.quadraticCurveTo(0, -13, -11, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 2.3;
    ctx.stroke();

    // Shirt triangle and tie
    ctx.fillStyle = "#fff8e5";
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.lineTo(1, -1);
    ctx.lineTo(9, -9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#cf4234";
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.lineTo(3, -2);
    ctx.lineTo(4, 3);
    ctx.lineTo(1, 5);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1, 4);
    ctx.lineTo(5, 3);
    ctx.lineTo(7, 13);
    ctx.lineTo(3, 11);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();

    // Pocket and badge
    ctx.strokeStyle = "rgba(18, 48, 62, 0.6)";
    ctx.lineWidth = 1.4;
    roundedPath(3, 4, 6, 5, 1.5);
    ctx.stroke();
    ctx.fillStyle = "#f4ca51";
    ctx.beginPath();
    ctx.arc(-6, 2, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Backpack strap
    ctx.strokeStyle = "#9f4c25";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.quadraticCurveTo(-5, 3, -7, 14);
    ctx.stroke();
    ctx.fillStyle = "#f4ca51";
    ctx.beginPath();
    ctx.arc(-6, 9, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Front leg
    const frontFootX = 4 + legKick * 0.45;
    const frontFootY = 39 - armUp * 5;
    strokeLimb(5, 17, frontFootX, frontFootY, 7.5, "#2b4359", 3, 30);
    ctx.fillStyle = "#1b252d";
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(frontFootX + 2, frontFootY + 1, 7.5, 4, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = "#f0c29a";
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(-10, -26, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(3, -28, 15.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair
    ctx.fillStyle = "#4c2e1f";
    ctx.beginPath();
    ctx.moveTo(-12, -29);
    ctx.quadraticCurveTo(-17, -44, 1, -43.5);
    ctx.quadraticCurveTo(17, -43, 18.5, -31);
    ctx.quadraticCurveTo(11, -36, 7, -33.5);
    ctx.quadraticCurveTo(1, -30, -4, -30.5);
    ctx.quadraticCurveTo(-8, -31, -12, -29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, -39);
    ctx.quadraticCurveTo(-12, -45, -4, -47);
    ctx.quadraticCurveTo(1, -48, 2, -43);
    ctx.strokeStyle = "#4c2e1f";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Worried eyebrows
    ctx.strokeStyle = "#3a2418";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(5, -34);
    ctx.lineTo(9, -35.5);
    ctx.moveTo(13, -35);
    ctx.lineTo(17.5, -33.5);
    ctx.stroke();

    // Eyes
    for (const [eyeX, eyeY, pupilX] of [[7, -30, 7.9], [13.9, -29.6, 14.8]]) {
      ctx.fillStyle = "#fff9e9";
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, 3.2, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#17252b";
      ctx.beginPath();
      ctx.arc(pupilX + twitch * 0.3, eyeY + 0.3, 1.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nose and mouth
    ctx.strokeStyle = "#9b6649";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(18, -26);
    ctx.quadraticCurveTo(20, -24, 17.7, -22.7);
    ctx.stroke();

    ctx.fillStyle = "rgba(112, 50, 43, 0.8)";
    ctx.beginPath();
    ctx.ellipse(12, -20, 2.5, 2.1 + armUp * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8c5841";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(9.8, -20);
    ctx.quadraticCurveTo(12, -18.4, 14.3, -20);
    ctx.stroke();

    // Freckles
    ctx.fillStyle = "rgba(164, 97, 64, 0.65)";
    for (const [fx, fy] of [[8, -24], [10.5, -23.2], [15, -23.6]]) {
      ctx.beginPath();
      ctx.arc(fx, fy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sweat drop
    const dropY = -37 - Math.sin(state.time * 3) * 1.2;
    ctx.fillStyle = "#72b9d6";
    ctx.strokeStyle = "rgba(23, 42, 46, 0.55)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(22, dropY - 4);
    ctx.quadraticCurveTo(26, dropY + 1, 22.5, dropY + 4);
    ctx.quadraticCurveTo(19, dropY + 2, 22, dropY - 4);
    ctx.fill();
    ctx.stroke();

    // Front arm
    const handX = 21 + armUp * 3;
    const handY = 10 - armUp * 29;
    strokeLimb(7, -5, handX, handY, 7.2, "#356b90", 17, 2 - armUp * 11);
    ctx.fillStyle = "#efc29a";
    ctx.beginPath();
    ctx.arc(handX, handY, 4.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#172a2e";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Cuff
    ctx.strokeStyle = "#d8e0dc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(handX - 2.5, handY + 2.5, 4.1, Math.PI * 1.05, Math.PI * 1.85);
    ctx.stroke();

    ctx.restore();
  }

  function addParticle(kind, x, y, options = {}) {
    if (state.particles.length > 180) return;
    state.particles.push({
      kind,
      x,
      y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      gravity: options.gravity || 0,
      size: options.size || 4,
      rot: options.rot || random(0, Math.PI * 2),
      vr: options.vr || random(-5, 5),
      life: options.life || 0.6,
      maxLife: options.life || 0.6,
      color: options.color || "#fff7df",
      layer: options.layer || "front"
    });
  }

  function spawnFlapParticles() {
    for (let i = 0; i < 3; i += 1) {
      addParticle("puff", student.x - 25 + random(-3, 3), student.y + 9 + random(-5, 5), {
        vx: random(-74, -34),
        vy: random(-18, 14),
        size: random(3, 6),
        life: random(0.28, 0.5),
        layer: "back"
      });
    }
    for (let i = 0; i < 2; i += 1) {
      addParticle("paper", student.x - 23 + random(-4, 4), student.y + 2 + random(-5, 5), {
        vx: random(-65, -24),
        vy: random(-35, 18),
        gravity: 90,
        size: random(4, 6),
        life: random(0.6, 0.95)
      });
    }
  }

  function spawnScoreParticles() {
    addFloater("+1", student.x + 24, student.y - 35);
    for (let i = 0; i < 7; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(35, 100);
      addParticle("spark", student.x + random(-5, 5), student.y + random(-8, 8), {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        gravity: 90,
        size: random(2.5, 5),
        life: random(0.35, 0.7),
        color: i % 2 ? "#f6c84b" : "#fff7d7"
      });
    }
  }

  function spawnCrashParticles() {
    for (let i = 0; i < 17; i += 1) {
      addParticle("paper", student.x + random(-10, 12), student.y + random(-18, 18), {
        vx: random(-210, 220),
        vy: random(-310, -60),
        gravity: 650,
        size: random(4, 7),
        life: random(0.8, 1.5),
        vr: random(-12, 12)
      });
    }
    for (let i = 0; i < 6; i += 1) {
      addParticle("puff", student.x + random(-20, 10), student.y + random(-15, 15), {
        vx: random(-75, 20),
        vy: random(-50, 30),
        size: random(4, 9),
        life: random(0.35, 0.75),
        layer: "back"
      });
    }
    addParticle("ring", student.x, student.y, {
      size: 18,
      life: 0.4,
      color: "#fff3ce",
      layer: "back"
    });
  }

  function addFloater(text, x, y) {
    state.floaters.push({ text, x, y, life: 0.9, maxLife: 0.9 });
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.rot += particle.vr * dt;
      if (particle.kind === "ring") particle.size += 190 * dt;
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const floater = state.floaters[i];
      floater.life -= dt;
      floater.y -= 32 * dt;
      if (floater.life <= 0) state.floaters.splice(i, 1);
    }
  }

  function drawParticles(layer) {
    for (const particle of state.particles) {
      if (particle.layer !== layer) continue;
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (particle.kind === "paper") {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rot);
        ctx.fillStyle = particle.color;
        ctx.strokeStyle = "rgba(23, 52, 58, 0.18)";
        ctx.lineWidth = 0.8;
        roundedPath(-particle.size, -particle.size * 0.7, particle.size * 2, particle.size * 1.4, 1);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(46, 101, 132, 0.28)";
        ctx.beginPath();
        ctx.moveTo(-particle.size + 2, 0);
        ctx.lineTo(particle.size - 2, 0);
        ctx.stroke();
      } else if (particle.kind === "spark") {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rot);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const radius = i % 2 === 0 ? particle.size : particle.size * 0.35;
          const angle = (i / 8) * Math.PI * 2;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (particle.kind === "ring") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3 * alpha;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.7 + alpha * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const floater of state.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = `900 20px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(23, 52, 58, 0.72)";
      ctx.strokeText(floater.text, floater.x, floater.y);
      ctx.fillStyle = "#fff4cf";
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function updateScoreHud() {
    scoreEl.textContent = String(state.score);
    callsWord.textContent = callsLabel(state.score);
    bestHud.textContent = String(state.best);
    startBest.textContent = String(state.best);
  }

  function setOverlay(element, visible) {
    element.classList.toggle("is-visible", visible);
  }

  function beginRun() {
    if (state.mode !== "ready" && state.mode !== "over") return;
    sound.ensure();
    state.previousBest = state.best;
    state.score = 0;
    state.pipes = [];
    state.particles = [];
    state.floaters = [];
    state.lastGapY = null;
    state.lastSpawnReason = "";
    state.lastCollisionReason = "";
    state.lastCollisionLabel = "Последняя причина";
    state.shake = 0;
    state.flash = 0;
    state.deathTimer = 0;
    state.overAt = 0;
    state.groundOffset = 0;
    state.pipeId = 0;
    regenerateReasons();

    student.y = clamp(state.readyY, 110, playBottom - 140);
    student.vy = 0;
    student.rot = 0;
    student.arm = 0;

    state.mode = "playing";
    shell.dataset.mode = "playing";
    setOverlay(startOverlay, false);
    setOverlay(endOverlay, false);
    setOverlay(pauseOverlay, false);
    newRecord.hidden = true;
    updateScoreHud();
    ensurePipes();
    sound.start();
    flap(false);
  }

  function flap(withSound = true) {
    if (state.mode !== "playing") return;
    student.vy = FLAP_VELOCITY;
    student.rot = Math.min(student.rot, -0.34);
    student.arm = 1;
    spawnFlapParticles();
    if (withSound) sound.flap();
  }

  function addScore(pipe) {
    state.score += 1;
    if (state.score > state.best) {
      state.best = state.score;
      saveValue(STORAGE_BEST, state.best);
    }
    state.lastCollisionReason = pipe.reason;
    spawnScoreParticles();
    updateScoreHud();
    scoreBadge.classList.remove("pop");
    void scoreBadge.offsetWidth;
    scoreBadge.classList.add("pop");
    sound.score();
  }

  function die(reason, hitGround = false) {
    if (state.mode !== "playing") return;
    state.mode = "dying";
    shell.dataset.mode = "dying";
    state.deathTimer = 0;
    state.shake = 18;
    state.flash = 0.58;
    student.vy = hitGround ? -120 : -345;
    student.rot = hitGround ? 0.35 : 0.18;
    state.lastCollisionReason = reason || "";
    state.lastCollisionLabel = reason ? "Последняя причина" : "Что случилось";
    if (!reason) {
      state.lastCollisionReason = "Слишком низко — заметил завуч";
    }
    spawnCrashParticles();
    sound.hit();
  }

  function endRunMessage(score) {
    if (score === 0) return "Даже первый вызов не пролетел. Завуч уже достаёт журнал.";
    if (score < 4) return "Завуч записал пару причин. Попробуй пролететь дальше.";
    if (score < 10) return "Уже похоже на побег! Но школа просто так не отпускает.";
    if (score < 20) return "Отличный манёвр. Ещё немного — и каникулы!";
    return "Легенда 5 «Б». Даже завуч не успевает за тобой.";
  }

  function finishRun() {
    if (state.mode === "over") return;
    state.mode = "over";
    shell.dataset.mode = "over";
    state.overAt = performance.now();

    if (state.score > state.best) {
      state.best = state.score;
      saveValue(STORAGE_BEST, state.best);
    }
    const isRecord = state.score > state.previousBest && state.score > 0;

    endEyebrow.textContent = isRecord ? "НОВЫЙ РЕКОРД" : "ДНЕВНИК НА СТОЛ";
    endReasonLabel.textContent = state.lastCollisionLabel;
    endReason.textContent = state.lastCollisionReason || "Попался на глаза завучу";
    endScore.textContent = String(state.score);
    endBest.textContent = String(state.best);
    newRecord.hidden = !isRecord;
    document.getElementById("endMessage").textContent = endRunMessage(state.score);

    updateScoreHud();
    setOverlay(startOverlay, false);
    setOverlay(pauseOverlay, false);
    setOverlay(endOverlay, true);
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    state.mode = "paused";
    shell.dataset.mode = "paused";
    setOverlay(pauseOverlay, true);
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = "playing";
    shell.dataset.mode = "playing";
    setOverlay(pauseOverlay, false);
    lastFrame = performance.now();
  }

  function update(dt) {
    if (state.mode === "paused") return;

    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 48);
    state.flash = Math.max(0, state.flash - dt * 3.2);
    updateAmbient(dt);

    if (state.mode === "ready") {
      student.y = state.readyY + Math.sin(state.time * 2.15) * 6;
      student.rot = Math.sin(state.time * 1.55) * 0.045;
      student.arm = Math.max(0, student.arm - dt * 2.4);
    } else if (state.mode === "playing") {
      state.speed = currentSpeed();
      student.vy = Math.min(student.vy + GRAVITY * dt, MAX_FALL_SPEED);
      student.y += student.vy * dt;
      const targetRotation = clamp(student.vy / 1150, -0.48, 1.02);
      student.rot += (targetRotation - student.rot) * Math.min(1, dt * 7.5);
      student.arm = Math.max(0, student.arm - dt * 3.8);

      if (student.y < 46) {
        student.y = 46;
        student.vy = Math.max(student.vy, 0);
      }

      for (const pipe of state.pipes) {
        pipe.x -= state.speed * dt;
      }
      state.groundOffset = (state.groundOffset + state.speed * dt) % 72;
      ensurePipes();

      for (const pipe of state.pipes) {
        const gapTop = pipe.gapY - pipe.gapH / 2;
        const gapBottom = pipe.gapY + pipe.gapH / 2;
        if (
          ellipseHitsRect(student.x, student.y - 2, HIT_RX, HIT_RY, pipe.x, -40, pipe.w, gapTop + 40) ||
          ellipseHitsRect(
            student.x,
            student.y - 2,
            HIT_RX,
            HIT_RY,
            pipe.x,
            gapBottom,
            pipe.w,
            playBottom - gapBottom + 20
          )
        ) {
          die(pipe.reason, false);
          return;
        }
      }

      for (const pipe of state.pipes) {
        if (!pipe.scored && pipe.x + pipe.w < student.x - HIT_RX) {
          pipe.scored = true;
          addScore(pipe);
        }
      }

      if (student.y + 31 >= playBottom - 2) {
        die("", true);
        return;
      }

      state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.w > -34);
    } else if (state.mode === "dying") {
      state.deathTimer += dt;
      student.vy = Math.min(student.vy + GRAVITY * dt * 0.95, 1040);
      student.y += student.vy * dt;
      student.rot += dt * 3.35;
      student.arm = Math.max(0, student.arm - dt * 2.5);
      if (student.y > playBottom - 22) {
        student.y = playBottom - 22;
      }
      if (state.deathTimer > 0.96) {
        finishRun();
      }
    }

    updateParticles(dt);
  }

  function render() {
    if (!canvasScaleX || !canvasScaleY) return;
    ctx.setTransform(canvasScaleX, 0, 0, canvasScaleY, 0, 0);
    ctx.clearRect(0, 0, WORLD_W, viewH);

    let shakeX = 0;
    let shakeY = 0;
    if (state.shake > 0.2) {
      shakeX = random(-state.shake, state.shake) * 0.52;
      shakeY = random(-state.shake, state.shake) * 0.52;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawPipes();
    drawGround();
    drawParticles("back");
    drawStudent();
    drawParticles("front");
    drawFloaters();
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      WORLD_W / 2,
      viewH * 0.42,
      Math.min(WORLD_W, viewH) * 0.26,
      WORLD_W / 2,
      viewH * 0.42,
      Math.max(WORLD_W, viewH) * 0.7
    );
    vignette.addColorStop(0, "rgba(8, 31, 36, 0)");
    vignette.addColorStop(1, "rgba(8, 31, 36, 0.17)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WORLD_W, viewH);

    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255, 248, 224, ${state.flash * 0.7})`;
      ctx.fillRect(0, 0, WORLD_W, viewH);
    }
  }

  function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.033);
    lastFrame = now;
    if (state.mode !== "paused") {
      update(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  function syncSoundButton() {
    soundButton.classList.toggle("is-muted", state.muted);
    const label = state.muted ? "Включить звук" : "Выключить звук";
    soundButton.setAttribute("aria-label", label);
    soundButton.title = `${label} (M)`;
  }

  function toggleMute() {
    state.muted = !state.muted;
    saveValue(STORAGE_MUTED, state.muted ? 1 : 0);
    sound.setMuted(state.muted);
    syncSoundButton();
    if (!state.muted) {
      sound.ensure();
      sound.tone(700, 0.07, { type: "triangle", volume: 0.04 });
    }
  }

  function onPointerDown(event) {
    if (event.isPrimary === false) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;

    if (state.mode === "playing") {
      event.preventDefault();
      sound.ensure();
      flap();
    } else if (state.mode === "ready") {
      event.preventDefault();
      beginRun();
    } else if (state.mode === "over" && performance.now() - state.overAt > 620) {
      event.preventDefault();
      beginRun();
    }
  }

  function onKeyDown(event) {
    const code = event.code;
    if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
      event.preventDefault();
      if (event.repeat) return;
      sound.ensure();
      if (state.mode === "ready") {
        beginRun();
      } else if (state.mode === "playing") {
        flap();
      } else if (state.mode === "over" && performance.now() - state.overAt > 520) {
        beginRun();
      }
      return;
    }

    if (code === "KeyP" || code === "Escape") {
      if (state.mode === "playing") {
        event.preventDefault();
        pauseGame();
      } else if (state.mode === "paused") {
        event.preventDefault();
        resumeGame();
      }
      return;
    }

    if (code === "KeyM") {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (code === "KeyR" && state.mode === "over" && !event.repeat) {
      event.preventDefault();
      beginRun();
      return;
    }

    if (code === "Enter" && (state.mode === "ready" || state.mode === "over") && !event.repeat) {
      event.preventDefault();
      beginRun();
    }
  }

  function init() {
    updateScoreHud();
    syncSoundButton();
    makeClouds();
    makePlanes();
    regenerateReasons();
    handleResize();
    student.y = state.readyY;
    shell.dataset.mode = "ready";
    setOverlay(startOverlay, true);
    setOverlay(endOverlay, false);
    setOverlay(pauseOverlay, false);
    newRecord.hidden = true;

    startButton.addEventListener("click", () => {
      if (state.mode === "ready") beginRun();
    });
    restartButton.addEventListener("click", () => {
      if (state.mode === "over") beginRun();
    });
    resumeButton.addEventListener("click", resumeGame);
    soundButton.addEventListener("click", toggleMute);
    pauseButton.addEventListener("click", pauseGame);

    shell.addEventListener("pointerdown", onPointerDown, { passive: false });
    document.addEventListener("keydown", onKeyDown, { passive: false });
    shell.addEventListener("contextmenu", (event) => event.preventDefault());

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseGame();
    });
    window.addEventListener("blur", () => {
      if (state.mode === "playing") pauseGame();
    });
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleResize, 220);
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(shell);
    }

    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  init();
})();
