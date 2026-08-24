'use strict';

/* ONE MORE DOOR V2 — mission layer
   The original room engine stays intact. This layer gives every run a purpose:
   find 3 keycards, breach the Door 10 Vault, steal the Core, then extract or push deeper. */

(function () {
  const CORE_LORE = [
    'CORE 01: The casing is stamped with tomorrow\'s date.',
    'CORE 02: Its floor plan includes a level below the foundations.',
    'CORE 03: The audio log is your own voice saying “don\'t open it.”',
    'CORE 04: Every camera frame shows the same door from a different year.',
    'CORE 05: The serial number belongs to a building demolished decades ago.',
    'CORE 06: A signal inside the Core points to Door 20. The Final Door.'
  ];

  // Extend existing saves without invalidating anyone's progress.
  save.coresExtracted ??= 0;
  save.bestCoreValue ??= 0;
  save.totalCoreValue ??= 0;
  save.bestEscapeDoors ??= 0;
  save.vaultsOpened ??= 0;
  save.keysFound ??= 0;
  save.buildingBeaten ??= false;
  save.finalDoorWins ??= 0;
  persist();

  Object.assign(game, {
    phase: 'infiltration',
    keys: 0,
    coreSecured: false,
    coreValue: 0,
    heat: 0,
    pendingKey: false,
    pendingCoreBoost: 0,
    finalContract: false,
    finalDoorReached: false
  });

  const oldSetMode = setMode;
  setMode = function (mode) {
    oldSetMode(mode);
    const missionHud = $('missionHud');
    if (missionHud) missionHud.classList.toggle('hidden', mode !== 'playing');
  };

  refreshTitle = function () {
    $('titleBest').textContent = save.bestRooms;
    $('titleBank').textContent = save.coresExtracted;
    $('titleDaily').textContent = save.bestDaily || '—';
    $('soundBtn').textContent = `SOUND: ${save.sound ? 'ON' : 'OFF'}`;

    const label = $('titleMissionLabel');
    const mission = $('titleMission');
    const meta = $('titleMissionMeta');
    if (!label || !mission || !meta) return;

    if (save.buildingBeaten) {
      label.textContent = 'BUILDING BREACHED';
      mission.textContent = 'THE FINAL DOOR IS OPEN. ENDLESS CONTRACTS ACTIVE.';
      meta.textContent = `Best Core ${fmt(save.bestCoreValue)} • deepest run ${save.bestRooms} doors.`;
    } else if (save.coresExtracted >= 6) {
      label.textContent = 'FINAL CONTRACT';
      mission.textContent = 'STEAL A CORE, THEN CARRY IT TO DOOR 20.';
      meta.textContent = 'You can still extract early — or finish what the six Cores started.';
    } else {
      label.textContent = `CONTRACT ${save.coresExtracted + 1} / 6`;
      mission.textContent = 'FIND 3 KEYCARDS → BREACH DOOR 10 → STEAL THE CORE.';
      meta.textContent = 'Once you have it, every extra door makes the Core more valuable — and harder to escape with.';
    }
  };

  updateHud = function () {
    $('runCoins').textContent = fmt(game.runCoins);
    $('roomCount').textContent = game.room;
    $('multiplier').textContent = `x${Number(game.multiplier.toFixed(1))}`;
    const phase = $('missionPhase');
    const keys = $('missionKeys');
    const core = $('missionCore');
    if (phase) phase.textContent = game.coreSecured ? 'ESCAPE' : 'INFILTRATE';
    if (keys) keys.textContent = game.coreSecured ? 'VAULT BREACHED' : `${game.keys}/3 KEYCARDS`;
    if (core) core.textContent = game.coreSecured ? `CORE ${fmt(game.coreValue)}` : 'VAULT • D10';
  };

  startRun = function (daily = false) {
    unlockAudio();
    game.daily = daily;
    game.seedLabel = daily ? dateSeed() : `${Date.now()}-${Math.floor(Math.random() * 1e7)}`;
    rng = mulberry32(hashString(game.seedLabel));
    game.room = 0;
    game.runCoins = 0;
    game.multiplier = 1;
    game.streak = 0;
    game.secondChanceUsed = false;
    game.lastCheckpoint = -1;
    game.chosenDoor = null;
    game.phase = 'infiltration';
    game.keys = 0;
    game.coreSecured = false;
    game.coreValue = 0;
    game.heat = 0;
    game.pendingKey = false;
    game.pendingCoreBoost = 0;
    game.finalContract = save.coresExtracted >= 6 && !save.buildingBeaten;
    game.finalDoorReached = false;
    save.runs += 1;
    persist();
    resetWorld();
    chooseDoors(true);
    setTimeout(() => toast(game.finalContract ? 'FINAL CONTRACT: CORE → DOOR 20' : 'MISSION: 3 KEYS → VAULT → ESCAPE', 1500), 120);
  };

  function v2DoorPool() {
    const pool = ['challenge', 'danger', 'treasure', 'challenge'];
    if (game.room >= 2) pool.push('mystery');
    if (game.room >= 7) pool.push('glitch');
    return pool;
  }

  function coreBoostForDoor(d) {
    if (d.type === 'boss') return game.room + 1 >= 20 ? 42 : 30;
    return Math.round(7 + d.reward * 7 + d.risk * 3);
  }

  chooseDoors = function (first = false) {
    resetWorld();

    // Extraction exists only after the actual objective is complete.
    if (!first && game.coreSecured) {
      const extractionRoom = game.room === 10 || (game.room > 10 && (game.room - 10) % 3 === 0);
      if (extractionRoom && game.lastCheckpoint !== game.room) {
        game.lastCheckpoint = game.room;
        showBankDecision();
        return;
      }
    }

    if ((game.room + 1) % 10 === 0) {
      const isVault = !game.coreSecured && game.room + 1 === 10;
      const isFinal = game.finalContract && game.coreSecured && game.room + 1 === 20;
      const label = isVault ? 'THE VAULT' : isFinal ? 'FINAL DOOR' : 'LOCKDOWN';
      game.doorChoices = [{
        type: 'boss',
        ...doorMeta.boss,
        label,
        certainty: isVault ? '3 KEYS REQUIRED' : isFinal ? 'END THIS' : 'CORE AT RISK',
        coreBoost: isVault ? 0 : 42
      }];
    } else {
      const pool = v2DoorPool();
      const types = [];
      while (types.length < 3) {
        const t = pick(pool);
        if (!types.includes(t) || (t === 'challenge' && types.filter(x => x === t).length < 2)) types.push(t);
      }

      game.doorChoices = types.map(type => {
        const m = doorMeta[type];
        const risk = m.risk * R(.85, 1.17);
        const reward = m.reward * R(.92, 1.18);
        const certainty = hasAbility('peek')
          ? `${Math.round(risk * 100)}% THREAT`
          : (risk < .9 ? 'LOW THREAT' : risk > 1.4 ? 'HIGH THREAT' : 'MID THREAT');
        const door = { type, ...m, risk, reward, certainty, containsKey: false, coreBoost: 0 };
        if (game.coreSecured) door.coreBoost = coreBoostForDoor(door);
        return door;
      });

      // A player can ignore key signals, but the building can never make the mission impossible.
      if (!game.coreSecured && game.keys < 3 && game.room < 9) {
        const needed = 3 - game.keys;
        const remainingDoorsBeforeVault = 9 - game.room;
        if (needed >= remainingDoorsBeforeVault) {
          game.doorChoices.forEach(d => { d.containsKey = true; });
        } else {
          game.doorChoices[RI(0, game.doorChoices.length - 1)].containsKey = true;
        }
      }
    }

    renderDoors();
    setMode('door');
  };

  renderDoors = function () {
    const grid = $('doorGrid');
    grid.innerHTML = '';
    const heading = $('doorHeading');
    const eyebrow = $('doorEyebrow');
    const hint = $('doorHint');

    if (game.coreSecured) {
      if (eyebrow) eyebrow.textContent = `ESCAPE • HEAT ${Math.max(0, game.room - 10)}`;
      if (heading) heading.innerHTML = game.doorChoices.length === 1 ? 'SECURITY<br>LOCKDOWN' : 'THE EXIT<br>MOVED AGAIN.';
      if (hint) hint.textContent = 'Every cleared door overclocks the stolen Core. Higher value. Higher pressure.';
    } else {
      if (eyebrow) eyebrow.textContent = `INFILTRATION • ${game.keys}/3 KEYCARDS`;
      if (heading) heading.innerHTML = game.doorChoices.length === 1 ? 'THE VAULT<br>IS OPEN.' : 'PICK YOUR<br>ROUTE.';
      if (hint) hint.textContent = 'Keycard signals are guaranteed when shown. Safer routes may mean less progress.';
    }

    const infiltrationNames = { challenge: 'SERVICE', danger: 'SECURITY', treasure: 'CACHE', mystery: 'SIGNAL', glitch: 'BREACH', boss: 'THE VAULT' };
    const escapeNames = { challenge: 'STAIRS', danger: 'PURSUIT', treasure: 'CACHE', mystery: 'SHORTCUT', glitch: 'BREACH', boss: 'LOCKDOWN' };

    game.doorChoices.forEach((d, i) => {
      const btn = document.createElement('button');
      btn.className = `door ${game.coreSecured ? 'core-door' : ''}`;
      btn.style.setProperty('--door', d.color);
      const displayName = d.label || (game.coreSecured ? escapeNames[d.type] : infiltrationNames[d.type]) || d.type.toUpperCase();
      let rewardLine = `${d.certainty}`;
      if (d.containsKey) rewardLine += '<span class="door-keyline">◆ KEYCARD SIGNAL</span>';
      else if (game.coreSecured && d.type !== 'boss') rewardLine += `<span class="door-coreline">CORE +${d.coreBoost}%</span>`;
      else if (d.type !== 'boss') rewardLine += `<br>LOOT x${d.reward.toFixed(1)}`;
      btn.innerHTML = `<span class="door-name">${displayName}</span><span class="door-icon">${d.icon}</span><span class="door-reward">${rewardLine}</span>`;
      btn.addEventListener('click', () => enterDoor(i));
      grid.appendChild(btn);
    });
    grid.style.gridTemplateColumns = game.doorChoices.length === 1 ? 'minmax(180px,260px)' : 'repeat(3,1fr)';
  };

  enterDoor = function (index) {
    const d = game.doorChoices[index];
    if (!d) return;
    unlockAudio();
    sfx('door');
    vibrate(18);
    game.chosenDoor = d;
    game.pendingKey = !!d.containsKey;
    game.pendingCoreBoost = d.coreBoost || 0;
    game.room += 1;
    game.roomRisk = d.risk || doorMeta[d.type]?.risk || 1;
    game.roomReward = d.reward || doorMeta[d.type]?.reward || 1;
    game.streak += 1;
    save.bestRooms = Math.max(save.bestRooms, game.room - 1);
    if (game.daily) save.bestDaily = Math.max(save.bestDaily, game.room - 1);
    persist();
    beginRoom(d.type);
  };

  difficulty = function () {
    const greed = hasAbility('greed') ? 1.1 : 1;
    const base = 1 + Math.min(2.5, game.room * .055);
    const escapeHeat = game.coreSecured ? 1 + Math.min(.85, Math.max(0, game.room - 10) * .035) : 1;
    return base * game.roomRisk * greed * escapeHeat;
  };

  const oldBeginRoom = beginRoom;
  beginRoom = function (doorType) {
    oldBeginRoom(doorType);
    if (doorType === 'boss') {
      if (game.room === 10 && !game.coreSecured) game.tutorial = 'BREACH THE VAULT';
      else if (game.finalContract && game.room === 20) game.tutorial = 'THE FINAL DOOR';
      else game.tutorial = 'SECURITY LOCKDOWN';
      toast(game.tutorial, 1000);
    }
    updateHud();
  };

  clearRoom = function () {
    if (game.mode !== 'playing') return;

    const base = 16 + game.room * 3;
    const doorBonus = game.roomReward || 1;
    const earned = Math.floor(base * game.multiplier * doorBonus * (hasAbility('greed') ? 1.2 : 1));
    game.runCoins += earned;

    let eventText = '';
    if (game.pendingKey && !game.coreSecured && game.keys < 3) {
      game.keys += 1;
      save.keysFound += 1;
      eventText = `KEYCARD ACQUIRED • ${game.keys}/3`;
      sfx('bank');
      vibrate([10, 18, 10]);
    }

    const justStoleCore = game.room === 10 && game.roomType === 'boss' && !game.coreSecured;
    if (justStoleCore) {
      game.coreSecured = true;
      game.phase = 'escape';
      game.coreValue = 1000 + Math.floor(game.runCoins * 2.2);
      game.heat = 0;
      save.vaultsOpened += 1;
      eventText = 'CORE STOLEN • EXIT ROUTE UNLOCKED';
      sfx('boss');
      vibrate([18, 35, 18, 35, 24]);
    } else if (game.coreSecured && game.room > 10) {
      const boost = Math.max(10, game.pendingCoreBoost || 14);
      game.coreValue = Math.floor(game.coreValue * (1 + boost / 100));
      game.heat = Math.max(0, game.room - 10);
      eventText = `CORE OVERCLOCKED • +${boost}%`;
    }

    if (game.finalContract && game.coreSecured && game.room >= 20 && game.roomType === 'boss') {
      game.finalDoorReached = true;
      eventText = 'FINAL DOOR BREACHED • EXTRACTION AVAILABLE';
    }

    game.pendingKey = false;
    game.pendingCoreBoost = 0;
    save.roomsCleared += 1;
    save.bestRooms = Math.max(save.bestRooms, game.room);
    if (game.daily) save.bestDaily = Math.max(save.bestDaily, game.room);
    save.highestMultiplier = Math.max(save.highestMultiplier, game.multiplier);
    persist();
    updateHud();
    game.flash = .25;
    game.flashColor = game.coreSecured ? '#ffc92e' : '#62ffb3';
    sfx('clear');
    vibrate(16);
    toast(eventText || `ROUTE CLEAR • +${fmt(earned)} GEAR`, eventText ? 1050 : 700);
    setTimeout(() => chooseDoors(false), eventText ? 650 : 430);
  };

  showBankDecision = function () {
    if (!game.coreSecured) {
      chooseDoors(false);
      return;
    }
    $('bankAmount').textContent = fmt(game.coreValue);
    const loot = $('bankLoot');
    if (loot) loot.textContent = `+ ${fmt(game.runCoins)} gear coins if you extract`;
    const eyebrow = $('extractEyebrow');
    const heading = $('extractHeading');

    if (game.finalContract && game.room >= 20) {
      if (eyebrow) eyebrow.textContent = 'FINAL DOOR';
      if (heading) heading.innerHTML = 'END THE<br>BUILDING?';
      $('bankBtn').textContent = 'OPEN THE FINAL DOOR';
      $('riskBtn').textContent = 'KEEP RUNNING';
      $('riskCopy').textContent = `Core value ${fmt(game.coreValue)}. The Final Door is open now — or you can still push deeper.`;
    } else if (game.finalContract) {
      if (eyebrow) eyebrow.textContent = 'EXIT FOUND';
      if (heading) heading.innerHTML = 'EXTRACT…<br>OR FINISH THIS?';
      $('bankBtn').textContent = 'EXTRACT CORE';
      $('riskBtn').textContent = game.room === 10 ? 'PUSH FOR FINAL DOOR' : 'ONE MORE DOOR';
      $('riskCopy').textContent = `Final Door signal: Door 20. You can leave with ${fmt(game.coreValue)} now, or keep carrying the Core.`;
    } else {
      if (eyebrow) eyebrow.textContent = 'EXIT FOUND';
      if (heading) heading.innerHTML = 'TAKE THE CORE<br>OUT?';
      $('bankBtn').textContent = 'EXTRACT CORE';
      $('riskBtn').textContent = 'ONE MORE DOOR';
      $('riskCopy').textContent = `Core value ${fmt(game.coreValue)}. Every extra door increases it. One mistake destroys the Core.`;
    }
    setMode('bank');
  };

  riskOneMore = function () {
    game.multiplier = clamp(game.multiplier * 1.25, 1, 99);
    game.heat += 1;
    save.highestMultiplier = Math.max(save.highestMultiplier, game.multiplier);
    persist();
    sfx('door');
    vibrate([12, 15, 12]);
    chooseDoors(false);
  };

  bankRun = function () {
    if (!game.coreSecured) return;
    const loot = game.runCoins;
    const coreValue = game.coreValue;
    const finalWin = game.finalContract && game.room >= 20;

    save.banked += loot;
    save.totalBanked += loot;
    save.biggestBank = Math.max(save.biggestBank, loot);
    save.bankedRuns += 1;
    save.coresExtracted += 1;
    save.bestCoreValue = Math.max(save.bestCoreValue, coreValue);
    save.totalCoreValue += coreValue;
    save.bestEscapeDoors = Math.max(save.bestEscapeDoors, game.room);
    if (finalWin) {
      save.buildingBeaten = true;
      save.finalDoorWins += 1;
    }
    persist();

    $('bankedResult').textContent = fmt(coreValue);
    const lore = $('bankedLore');
    const eyebrow = $('bankedEyebrow');
    if (eyebrow) eyebrow.textContent = finalWin ? 'THE FINAL DOOR OPENED' : 'EXTRACTION COMPLETE';
    if (lore) {
      lore.textContent = finalWin
        ? 'The corridor finally ends. Behind the Final Door is daylight — and another building across the street with one light still on.'
        : CORE_LORE[Math.min(CORE_LORE.length - 1, save.coresExtracted - 1)];
    }
    sfx('bank');
    vibrate([15, 30, 15, 30, 25]);
    refreshTitle();
    setMode('banked');
  };

  endRunDeath = function () {
    if (game.mode !== 'playing') return;
    save.deaths += 1;
    save.bestRooms = Math.max(save.bestRooms, Math.max(0, game.room - 1));
    if (game.daily) save.bestDaily = Math.max(save.bestDaily, Math.max(0, game.room - 1));
    persist();
    $('deadRooms').textContent = Math.max(0, game.room - 1);
    $('lostCoins').textContent = game.coreSecured ? fmt(game.coreValue) : `${game.keys}/3`;
    $('deadBest').textContent = save.bestRooms;
    $('deadCopy').textContent = game.coreSecured
      ? `The Core shattered at Door ${game.room}. Value lost: ${fmt(game.coreValue)}.`
      : `Vault still locked. You reached ${game.keys}/3 keycards.`;
    setMode('dead');
  };

  renderStats = function () {
    const stats = [
      ['CORES EXTRACTED', fmt(save.coresExtracted)],
      ['BEST CORE VALUE', fmt(save.bestCoreValue)],
      ['DEEPEST ESCAPE', `${save.bestEscapeDoors || 0} DOORS`],
      ['VAULTS BREACHED', fmt(save.vaultsOpened)],
      ['KEYCARDS FOUND', fmt(save.keysFound)],
      ['FINAL DOOR', save.buildingBeaten ? 'OPENED' : save.coresExtracted >= 6 ? 'AVAILABLE' : `${save.coresExtracted}/6 CORES`],
      ['BEST RUN', `${save.bestRooms} DOORS`],
      ['GEAR COINS', fmt(save.banked)],
      ['ROOMS CLEARED', fmt(save.roomsCleared)],
      ['RUNS', fmt(save.runs)],
      ['DEATHS', fmt(save.deaths)],
      ['TOP MULTIPLIER', `x${Number(save.highestMultiplier.toFixed(1))}`]
    ];
    $('statsList').innerHTML = stats.map(([k, v]) => `<div class="stat-row"><span>${k}</span><strong>${v}</strong></div>`).join('');
  };

  // Carrying the Core should be visible during play, not only in UI text.
  const oldDrawPlayer = drawPlayer;
  drawPlayer = function () {
    oldDrawPlayer();
    if (!game.coreSecured || game.mode !== 'playing') return;
    const x = pxX(player.x), y = pxY(player.y);
    const t = performance.now() / 700;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t);
    ctx.strokeStyle = 'rgba(255,201,46,.72)';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ffc92e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, player.r + 11, 0, TAU * .72);
    ctx.stroke();
    ctx.fillStyle = '#ffc92e';
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(player.r + 6, player.r + 6, 5, 5);
    ctx.restore();
  };

  drawRoomProgress = function () {
    if (game.mode !== 'playing') return;
    const w = vw(), h = vh();
    const x = 14, y = h * .125, bw = w - 28, bh = 3;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x, y, bw, bh);
    const p = clamp(game.roomTime / game.roomDuration, 0, 1);
    ctx.fillStyle = game.roomType === 'boss' ? '#ff365f' : game.coreSecured ? '#ffc92e' : '#28c6ff';
    ctx.fillRect(x, y, bw * p, bh);
    if (game.roomType === 'boss') {
      const label = game.room === 10 && !game.coreSecured ? 'THE VAULT' : game.finalContract && game.room === 20 ? 'THE FINAL DOOR' : 'LOCKDOWN';
      ctx.font = '800 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,54,95,.82)';
      ctx.fillText(label, w * .5, y + 17);
    }
  };

  const oldDrawBackground = drawBackground;
  drawBackground = function () {
    oldDrawBackground();
    if (!game.coreSecured || game.mode !== 'playing') return;
    const w = vw(), h = vh();
    const pulse = .018 + (Math.sin(game.dangerPulse * 1.7) * .5 + .5) * .028;
    ctx.fillStyle = `rgba(255,201,46,${pulse})`;
    ctx.fillRect(0, 0, w, h * .15);
  };

  refreshTitle();
})();
