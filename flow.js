'use strict';
  function resetWorld() {
    hazards = [];
    coins = [];
    particles = [];
    telegraphs = [];
    roomData = {};
    player.x = .5; player.tx = .5; player.y = .78; player.ty = .78;
    player.dash = 0; player.dashCd = 0; player.invuln = 0; player.alive = true;
    player.trail.length = 0;
    game.screenShake = 0; game.flash = 0; game.transition = 1;
  }

  function startRun(daily=false) {
    unlockAudio();
    game.daily = daily;
    game.seedLabel = daily ? dateSeed() : `${Date.now()}-${Math.floor(Math.random()*1e7)}`;
    rng = mulberry32(hashString(game.seedLabel));
    game.room = 0;
    game.runCoins = 0;
    game.multiplier = 1;
    game.streak = 0;
    game.secondChanceUsed = false;
    game.lastCheckpoint = 0;
    game.chosenDoor = null;
    save.runs += 1;
    persist();
    resetWorld();
    chooseDoors(true);
  }

  function doorPool() {
    const pool = ['challenge','danger','treasure','challenge'];
    if (game.room >= 3) pool.push('mystery');
    if (game.room >= 8) pool.push('glitch');
    return pool;
  }

  const doorMeta = {
    challenge: { label:'CHALLENGE', icon:'▲', color:'#28c6ff', risk:1.0, reward:1.0 },
    danger: { label:'DANGER', icon:'☠', color:'#ff365f', risk:1.35, reward:1.6 },
    treasure: { label:'TREASURE', icon:'◆', color:'#ffc92e', risk:.72, reward:1.3 },
    mystery: { label:'MYSTERY', icon:'?', color:'#b56cff', risk:1.08, reward:1.45 },
    glitch: { label:'GLITCH', icon:'⌁', color:'#ff4fe1', risk:1.55, reward:2.0 },
    boss: { label:'BOSS', icon:'✦', color:'#ff365f', risk:2.1, reward:3.0 }
  };

  function chooseDoors(first=false) {
    resetWorld();
    if (!first && game.room > 0 && game.room % 5 === 0 && game.lastCheckpoint !== game.room) {
      game.lastCheckpoint = game.room;
      showBankDecision();
      return;
    }
    if ((game.room + 1) % 10 === 0) {
      game.doorChoices = [{ type:'boss', ...doorMeta.boss, certainty:'NO EXIT' }];
    } else {
      const pool = doorPool();
      const types = [];
      while (types.length < 3) {
        const t = pick(pool);
        if (!types.includes(t) || (t === 'challenge' && types.filter(x=>x===t).length<2)) types.push(t);
      }
      game.doorChoices = types.map(type => {
        const m = doorMeta[type];
        const fuzz = R(.85,1.17);
        const risk = m.risk * fuzz;
        const reward = m.reward * R(.92,1.18);
        const certainty = hasAbility('peek')
          ? `${Math.round(risk*100)}% RISK`
          : (risk < .9 ? 'CALMER' : risk > 1.4 ? 'BRUTAL' : 'UNKNOWN');
        return { type, ...m, risk, reward, certainty };
      });
    }
    renderDoors();
    setMode('door');
  }

  function renderDoors() {
    const grid = $('doorGrid');
    grid.innerHTML = '';
    game.doorChoices.forEach((d,i) => {
      const btn = document.createElement('button');
      btn.className = 'door';
      btn.style.setProperty('--door', d.color);
      btn.innerHTML = `<span class="door-name">${d.label}</span><span class="door-icon">${d.icon}</span><span class="door-reward">${d.certainty}<br>REWARD x${d.reward.toFixed(1)}</span>`;
      btn.addEventListener('click', () => enterDoor(i));
      grid.appendChild(btn);
    });
    if (game.doorChoices.length === 1) grid.style.gridTemplateColumns = 'minmax(180px,260px)';
    else grid.style.gridTemplateColumns = 'repeat(3,1fr)';
  }

  function enterDoor(index) {
    const d = game.doorChoices[index];
    if (!d) return;
    unlockAudio(); sfx('door'); vibrate(18);
    game.chosenDoor = d;
    game.room += 1;
    game.roomRisk = d.risk;
    game.roomReward = d.reward;
    game.streak += 1;
    save.bestRooms = Math.max(save.bestRooms, game.room-1);
    if (game.daily) save.bestDaily = Math.max(save.bestDaily, game.room-1);
    persist();
    beginRoom(d.type);
  }

  function difficulty() {
    const greed = hasAbility('greed') ? 1.1 : 1;
    return (1 + Math.min(2.5, game.room * .055)) * game.roomRisk * greed;
  }

  function beginRoom(doorType) {
    resetWorld();
    game.shieldReady = hasAbility('shield');
    const d = difficulty();
    if (doorType === 'boss') {
      game.roomType = 'boss';
      game.roomDuration = clamp(10.5 + game.room*.04,10.5,13);
      game.tutorial = 'BOSS: THE ELEVATOR';
      sfx('boss');
    } else if (doorType === 'treasure') {
      game.roomType = rng() < .65 ? 'treasureRush' : pick(['gates','debris']);
      game.roomDuration = R(5.2,6.4);
      game.tutorial = game.roomType === 'treasureRush' ? 'GRAB WHAT YOU CAN' : 'TREASURE HAS TEETH';
    } else if (doorType === 'glitch') {
      game.roomType = 'glitch';
      game.roomDuration = R(6.5,8.2);
      game.tutorial = 'RULES UNSTABLE';
    } else {
      const base = ['debris','lasers','gates','crushers','memory','spinner','mines'];
      if (game.room >= 8) base.push('combo');
      if (game.room >= 14) base.push('gravity','combo');
      game.roomType = doorType === 'danger' && rng()<.45 ? 'combo' : pick(base);
      game.roomDuration = clamp(R(5.4,7.1) + d*.18, 5.4, 8.4);
      game.tutorial = roomName(game.roomType);
    }
    game.roomTime = 0;
    setupRoom(game.roomType);
    updateHud();
    setMode('playing');
    toast(game.tutorial, 900);
  }

  function roomName(type) {
    return ({
      debris:'FALLING STEEL', lasers:'LASER GRID', gates:'BREAK THE GATE', crushers:'CLOSING WALLS',
      memory:'REMEMBER THE SAFE LANE', spinner:'SPIN CYCLE', mines:'MINEFIELD', combo:'COMPOUND ROOM',
      gravity:'GRAVITY FAILURE', glitch:'GLITCH ROOM', treasureRush:'TREASURE RUSH', boss:'THE ELEVATOR'
    })[type] || 'SURVIVE';
  }

  function setupRoom(type) {
    roomData = { spawn:0, phase:0, next:0, safeLane:RI(0,2), flashLane:1.15, invert:false, bossPhase:0, comboA:pick(['debris','gates','lasers']), comboB:pick(['mines','crushers','spinner']) };
    if (type === 'memory') roomData.next = .6;
    if (type === 'gravity') roomData.invert = rng()>.5;
    if (type === 'boss') roomData.next = .35;
  }

  function spawnParticle(x,y,color='#28c6ff',count=8,speed=.12) {
    for(let i=0;i<count;i++) particles.push({x,y,vx:R(-speed,speed),vy:R(-speed,speed),life:R(.25,.65),max:1,color,size:R(1.5,4)});
  }

  function addCoin(x,y,value=1) {
    coins.push({x,y,r:.014,value,spin:R(0,TAU),vy:R(.08,.16)});
  }

  function addHazard(h) {
    hazards.push({active:true, age:0, telegraph:0, ...h});
  }

  function hazardRect(x,y,w,h,vx=0,vy=.2,color='#ff365f') {
    addHazard({kind:'rect',x,y,w,h,vx,vy,color});
  }

  function hazardCircle(x,y,r,vy=.2,color='#ff365f') {
    addHazard({kind:'circle',x,y,r,vy,vx:0,color});
  }

  function laser(axis,pos,delay=.55,duration=.42,width=.025) {
    addHazard({kind:'laser',axis,pos,delay,duration,width,age:0,color:'#ff365f'});
  }

