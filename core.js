'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const TAU = Math.PI * 2;

  const screens = {
    title: $('screenTitle'),
    door: $('screenDoor'),
    bank: $('screenBank'),
    dead: $('screenGameOver'),
    banked: $('screenBanked'),
    upgrades: $('screenUpgrades'),
    stats: $('screenStats'),
    pause: $('screenPause')
  };

  const SAVE_KEY = 'oneMoreDoorSaveV2';
  const abilityCatalog = [
    { id: 'secondChance', name: 'SECOND CHANCE', price: 300, desc: 'Once per run, survive a hit and detonate nearby hazards.' },
    { id: 'magnet', name: 'COIN MAGNET', price: 220, desc: 'Coins pull toward you from much farther away.' },
    { id: 'shield', name: 'PHASE SHIELD', price: 450, desc: 'Start each room with a rechargeable one-hit shield.' },
    { id: 'peek', name: 'DOOR PEEK', price: 600, desc: 'Door cards reveal a more accurate risk rating.' },
    { id: 'slowPulse', name: 'SLOW PULSE', price: 800, desc: 'A perfect dash briefly slows hazards around you.' },
    { id: 'greed', name: 'GREED ENGINE', price: 1000, desc: 'Earn more coins, but room speed ramps harder.' }
  ];

  const defaultSave = () => ({
    banked: 0,
    bestRooms: 0,
    bestDaily: 0,
    runs: 0,
    roomsCleared: 0,
    deaths: 0,
    bankedRuns: 0,
    totalBanked: 0,
    biggestBank: 0,
    highestMultiplier: 1,
    unlocked: [],
    equipped: [],
    sound: true,
    tutorialSeen: false
  });

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return { ...defaultSave(), ...(raw || {}) };
    } catch (_) {
      return defaultSave();
    }
  }
  let save = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function dist2(ax, ay, bx, by) { const x = ax - bx, y = ay - by; return x*x + y*y; }
  function fmt(n) { return Math.floor(n).toLocaleString('en-GB'); }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function dateSeed() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  let rng = Math.random;
  const R = (a=0,b=1) => a + (b-a) * rng();
  const RI = (a,b) => Math.floor(R(a,b+1));
  const pick = (arr) => arr[Math.floor(rng()*arr.length)];

  const game = {
    mode: 'title',
    daily: false,
    seedLabel: '',
    room: 0,
    runCoins: 0,
    multiplier: 1,
    streak: 0,
    roomTime: 0,
    roomDuration: 6,
    roomType: 'debris',
    roomRisk: 1,
    roomReward: 1,
    chosenDoor: null,
    doorChoices: [],
    pausedAt: 0,
    secondChanceUsed: false,
    lastCheckpoint: 0,
    shieldReady: false,
    screenShake: 0,
    flash: 0,
    flashColor: '#ffffff',
    transition: 0,
    dangerPulse: 0,
    tutorial: '',
    active: true
  };

  const player = {
    x: .5,
    y: .78,
    tx: .5,
    ty: .78,
    r: 12,
    dash: 0,
    dashCd: 0,
    invuln: 0,
    alive: true,
    trail: [],
    pulse: 0
  };

  let hazards = [];
  let coins = [];
  let particles = [];
  let telegraphs = [];
  let roomData = {};
  let lastTime = performance.now();
  let pointerDown = false;
  let pointerStart = null;
  let pointerLast = null;
  let lastTap = 0;
  let audioCtx = null;
  let musicTimer = 0;
  let audioUnlocked = false;

  function hasAbility(id) { return save.equipped.includes(id); }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * DPR));
    canvas.height = Math.max(1, Math.floor(rect.height * DPR));
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function vw() { return canvas.clientWidth; }
  function vh() { return canvas.clientHeight; }
  function pxX(n) { return n * vw(); }
  function pxY(n) { return n * vh(); }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (name && screens[name]) screens[name].classList.remove('hidden');
  }

  function setMode(mode) {
    game.mode = mode;
    const inGame = mode === 'playing';
    $('topHud').classList.toggle('hidden', !inGame);
    $('pauseBtn').classList.toggle('hidden', !inGame);
    if (mode === 'playing') showScreen(null);
    else if (screens[mode]) showScreen(mode);
  }

  function updateHud() {
    $('runCoins').textContent = fmt(game.runCoins);
    $('roomCount').textContent = game.room;
    $('multiplier').textContent = `x${Number(game.multiplier.toFixed(1))}`;
  }

  function refreshTitle() {
    $('titleBest').textContent = save.bestRooms;
    $('titleBank').textContent = fmt(save.banked);
    $('titleDaily').textContent = save.bestDaily || '—';
    $('soundBtn').textContent = `SOUND: ${save.sound ? 'ON' : 'OFF'}`;
  }

  function toast(text, ms=1100) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function vibrate(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function unlockAudio() {
    if (audioUnlocked || !save.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      audioUnlocked = true;
    } catch (_) {}
  }

  function tone(freq=220, duration=.08, type='sine', gain=.04, slide=0) {
    if (!save.sound) return;
    unlockAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide), t+duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t+duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t+duration+.02);
  }

  function sfx(name) {
    switch(name) {
      case 'door': tone(110,.18,'sawtooth',.055,180); break;
      case 'coin': tone(720,.05,'triangle',.035,220); break;
      case 'dash': tone(220,.08,'square',.025,420); break;
      case 'hit': tone(90,.22,'sawtooth',.07,-40); break;
      case 'clear': tone(420,.12,'triangle',.045,360); setTimeout(()=>tone(680,.11,'triangle',.035,300),80); break;
      case 'bank': tone(330,.1,'triangle',.04,330); setTimeout(()=>tone(660,.16,'triangle',.04,400),100); break;
      case 'boss': tone(55,.38,'sawtooth',.055,10); break;
      case 'warn': tone(150,.08,'square',.02,20); break;
    }
  }

  function musicTick(dt) {
    if (!save.sound || game.mode !== 'playing') return;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = clamp(.65 - game.room * .008, .25, .65);
      const base = game.room >= 20 ? 82 : 70;
      tone(base + (game.room % 4) * 5, .055, 'square', .006, 0);
    }
  }

