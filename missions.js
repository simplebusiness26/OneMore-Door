'use strict';

/* ONE MORE DOOR V3 — objective-room system
   Design constitution:
   - Time can add pressure, but time never clears a room.
   - Every room has a concrete objective.
   - Completing the objective unlocks an exit.
   - The player must physically reach the exit to clear the door.
*/
(function () {
  const baseBeginRoom = beginRoom;
  const baseClearRoom = clearRoom;
  const baseDash = dash;
  const baseRender = render;

  let mission = null;
  let missionDashPulse = 0;

  const MISSION_COLOURS = {
    objective: '#62ffb3',
    danger: '#ff365f',
    gold: '#ffc92e',
    blue: '#28c6ff',
    purple: '#b56cff',
    white: '#f7f8ff'
  };

  function mdist(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function actor(kind, x, y, opts = {}) {
    return {
      kind, x, y,
      r: opts.r || .035,
      active: opts.active !== false,
      done: false,
      progress: 0,
      value: opts.value || 0,
      label: opts.label || '',
      order: opts.order || 0,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      phase: opts.phase || 0,
      colour: opts.colour || MISSION_COLOURS.objective,
      ...opts
    };
  }

  function farPoint(avoid = [], yMin = .22, yMax = .78) {
    let best = { x: R(.14, .86), y: R(yMin, yMax) };
    for (let i = 0; i < 18; i++) {
      const p = { x: R(.11, .89), y: R(yMin, yMax) };
      const min = avoid.length ? Math.min(...avoid.map(a => mdist(p, a))) : 1;
      if (min > (avoid.length ? Math.min(...avoid.map(a => mdist(best, a))) : 0)) best = p;
    }
    return best;
  }

  function makeMission(id, title, instruction, target = 1) {
    return {
      id,
      title,
      instruction,
      target,
      progress: 0,
      actors: [],
      active: true,
      readyToExit: false,
      exitReached: false,
      exit: null,
      elapsed: 0,
      lastProgressAt: 0,
      lastPlayerX: player.x,
      lastPlayerY: player.y,
      stillFor: 0,
      scannerCd: 0,
      pressure: 0,
      stage: 0,
      carried: null,
      sequence: [],
      sequenceIndex: 0,
      secondary: 0,
      optional: false,
      autoExit: true,
      hintCooldown: 0
    };
  }

  function updateObjectiveHud() {
    const wrap = $('objectiveHud');
    if (!wrap) return;
    wrap.classList.toggle('hidden', game.mode !== 'playing' || !mission);
    if (!mission) return;
    const title = $('objectiveTitle');
    const copy = $('objectiveCopy');
    const count = $('objectiveCount');
    const bar = $('objectiveBarFill');
    if (title) title.textContent = mission.readyToExit ? 'EXIT OPEN' : mission.title;
    if (copy) copy.textContent = mission.readyToExit ? 'Reach the green exit. The room will not clear until you leave.' : mission.instruction;
    if (count) count.textContent = mission.readyToExit ? 'GO' : `${Math.min(mission.progress, mission.target)}/${mission.target}`;
    if (bar) bar.style.width = `${mission.readyToExit ? 100 : clamp(mission.progress / Math.max(1, mission.target), 0, 1) * 100}%`;
    wrap.classList.toggle('exit-open', !!mission.readyToExit);
  }

  function progressMission(amount = 1, text = '') {
    if (!mission || mission.readyToExit) return;
    mission.progress = Math.min(mission.target, mission.progress + amount);
    mission.lastProgressAt = mission.elapsed;
    mission.stillFor = 0;
    if (text) toast(text, 650);
    sfx('clear');
    vibrate(10);
    updateObjectiveHud();
    if (mission.progress >= mission.target && mission.autoExit !== false) openExit();
  }

  function openExit() {
    if (!mission || mission.readyToExit) return;
    mission.readyToExit = true;
    mission.lastProgressAt = mission.elapsed;
    const candidates = [
      { x: .18, y: .16 }, { x: .5, y: .14 }, { x: .82, y: .16 },
      { x: .14, y: .5 }, { x: .86, y: .5 }
    ];
    candidates.sort((a, b) => mdist(b, player) - mdist(a, player));
    mission.exit = actor('exit', candidates[0].x, candidates[0].y, { r: .055, colour: MISSION_COLOURS.objective });
    game.flash = .18;
    game.flashColor = MISSION_COLOURS.objective;
    toast('EXIT OPEN — GET OUT', 850);
    sfx('bank');
    updateObjectiveHud();
  }

  function finishMissionRoom() {
    if (!mission || !mission.readyToExit || mission.exitReached) return;
    mission.exitReached = true;
    mission.active = false;
    const wrap = $('objectiveHud');
    if (wrap) wrap.classList.add('hidden');
    baseClearRoom();
  }

  function addSpreadActors(kind, count, opts = {}) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const p = farPoint([...made, player], opts.yMin || .23, opts.yMax || .78);
      const a = actor(kind, p.x, p.y, { ...opts, order: i });
      mission.actors.push(a);
      made.push(a);
    }
    return made;
  }

  function setupBreakCore() {
    mission = makeMission('breakCore', 'BREAK THE CORE', 'Dash through the spinner core 3 times.', 3);
    mission.actors.push(actor('coreNode', .5, .48, { r: .042, colour: MISSION_COLOURS.white, hits: 0 }));
    hazards = hazards.filter(h => h.kind !== 'spinner');
    addHazard({ kind: 'spinner', x: .5, y: .48, r: .23, angle: R(0, TAU), speed: R(2.0, 3.0) * difficulty() * .5, width: .018, life: 999, colour: '#ff365f' });
  }

  function setupPowerCells() {
    mission = makeMission('powerCells', 'POWER THE EXIT', 'Carry 3 energy cells to the socket.', 3);
    addSpreadActors('cell', 3, { r: .025, colour: MISSION_COLOURS.blue, yMin: .2, yMax: .66 });
    mission.actors.push(actor('socket', .5, .84, { r: .05, colour: MISSION_COLOURS.gold }));
  }

  function setupHackPoints() {
    mission = makeMission('hackPoints', 'HACK 3 TERMINALS', 'Stay on each terminal until its ring fills.', 3);
    addSpreadActors('terminal', 3, { r: .045, colour: MISSION_COLOURS.purple, yMin: .22, yMax: .74 });
  }

  function setupLaserShutdown() {
    mission = makeMission('laserShutdown', 'SHUT DOWN LASERS', 'Reach both emitters and dash into them.', 2);
    mission.actors.push(actor('emitter', .18, .28, { r: .04, colour: MISSION_COLOURS.danger }));
    mission.actors.push(actor('emitter', .82, .66, { r: .04, colour: MISSION_COLOURS.danger }));
  }

  function setupKeyGrab() {
    mission = makeMission('keyGrab', 'STEAL THE ACCESS TOKEN', 'Cross the room, take the token, then escape.', 1);
    mission.actors.push(actor('token', R(.2, .8), .18, { r: .03, colour: MISSION_COLOURS.gold }));
  }

  function setupSequence() {
    mission = makeMission('sequence', 'RUN THE SEQUENCE', 'Activate the numbered pads in order.', 4);
    const points = [
      { x: .18, y: .28 }, { x: .78, y: .32 }, { x: .28, y: .68 }, { x: .74, y: .74 }
    ];
    mission.sequence = [0, 1, 2, 3].sort(() => rng() - .5);
    points.forEach((p, i) => mission.actors.push(actor('sequencePad', p.x, p.y, { r: .04, order: i, colour: MISSION_COLOURS.blue })));
  }

  function setupMovingTarget() {
    mission = makeMission('movingTarget', 'TAG THE SECURITY ORB', 'Catch it and dash into it 3 times.', 3);
    mission.actors.push(actor('movingTarget', .5, .35, { r: .035, vx: .22, vy: .16, colour: MISSION_COLOURS.purple }));
  }

  function setupPressurePlates() {
    mission = makeMission('pressurePlates', 'ARM 3 PRESSURE PLATES', 'Cross all three plates in order.', 3);
    mission.actors.push(actor('plate', .18, .7, { r: .05, order: 0, colour: MISSION_COLOURS.gold }));
    mission.actors.push(actor('plate', .82, .42, { r: .05, order: 1, colour: MISSION_COLOURS.gold }));
    mission.actors.push(actor('plate', .26, .22, { r: .05, order: 2, colour: MISSION_COLOURS.gold }));
  }

  function setupChargeDelivery() {
    mission = makeMission('chargeDelivery', 'DELIVER THE CHARGES', 'Collect 3 charges and take them to the extractor.', 3);
    addSpreadActors('charge', 3, { r: .027, colour: MISSION_COLOURS.purple, yMin: .2, yMax: .68 });
    mission.actors.push(actor('socket', .82, .84, { r: .05, colour: MISSION_COLOURS.objective }));
  }

  function setupSignalHunt() {
    mission = makeMission('signalHunt', 'FIND THE REAL SIGNAL', 'Scan the decoys. One unlocks the route.', 1);
    const real = RI(0, 3);
    addSpreadActors('signal', 4, { r: .04, colour: MISSION_COLOURS.purple, yMin: .2, yMax: .75 }).forEach((a, i) => a.real = i === real);
  }

  function setupTreasureLock() {
    mission = makeMission('treasureLock', 'CRACK THE CACHE', 'Collect 4 marked shards to unlock the exit.', 4);
    addSpreadActors('lootShard', 4, { r: .024, colour: MISSION_COLOURS.gold, yMin: .2, yMax: .75 });
  }

  function setupFalseExit() {
    mission = makeMission('falseExit', 'FIND THE REAL EXIT', 'Scan the fake doors until you find the real route.', 1);
    const real = RI(0, 2);
    const pts = [{ x: .16, y: .2 }, { x: .5, y: .16 }, { x: .84, y: .2 }];
    pts.forEach((p, i) => mission.actors.push(actor('fakeExit', p.x, p.y, { r: .05, real: i === real, colour: MISSION_COLOURS.purple })));
  }

  function setupCoreRelay() {
    mission = makeMission('coreRelay', 'STABILISE THE CORE', 'Pass through all 3 relay gates while carrying the Core.', 3);
    mission.actors.push(actor('relay', .2, .68, { r: .05, order: 0, colour: MISSION_COLOURS.gold }));
    mission.actors.push(actor('relay', .78, .45, { r: .05, order: 1, colour: MISSION_COLOURS.gold }));
    mission.actors.push(actor('relay', .3, .22, { r: .05, order: 2, colour: MISSION_COLOURS.gold }));
  }

  function setupLockdownOverride() {
    mission = makeMission('lockdownOverride', 'OVERRIDE LOCKDOWN', 'Hack both override consoles.', 2);
    mission.actors.push(actor('terminal', .18, .24, { r: .045, colour: MISSION_COLOURS.danger }));
    mission.actors.push(actor('terminal', .82, .72, { r: .045, colour: MISSION_COLOURS.danger }));
  }

  function setupSecuritySweep() {
    mission = makeMission('securitySweep', 'DESTROY TRACKERS', 'Dash through 4 tracking nodes.', 4);
    addSpreadActors('tracker', 4, { r: .034, colour: MISSION_COLOURS.danger, yMin: .2, yMax: .78 });
  }

  function setupMovingExit() {
    mission = makeMission('movingExit', 'CATCH THE EXIT', 'Reach the moving exit three times to force it open.', 3);
    mission.actors.push(actor('movingExit', .5, .25, { r: .055, vx: .24, vy: .15, colour: MISSION_COLOURS.objective }));
  }

  function setupCoreCooling() {
    mission = makeMission('coreCooling', 'COOL THE CORE', 'Touch 3 coolant nodes before the building overwhelms you.', 3);
    addSpreadActors('coolant', 3, { r: .04, colour: MISSION_COLOURS.blue, yMin: .2, yMax: .76 });
  }

  function setupPursuit() {
    mission = makeMission('pursuit', 'BREAK THE PURSUIT', 'Reach the 4 checkpoints in order.', 4);
    const pts = [{ x: .22, y: .72 }, { x: .76, y: .58 }, { x: .28, y: .36 }, { x: .72, y: .18 }];
    pts.forEach((p, i) => mission.actors.push(actor('checkpoint', p.x, p.y, { r: .045, order: i, colour: MISSION_COLOURS.objective })));
  }

  function setupDoubleCarry() {
    mission = makeMission('doubleCarry', 'STEAL THE SECONDARY CORE', 'Take the fragment to the extractor for a Core-value bonus.', 1);
    mission.actors.push(actor('fragment', R(.18, .82), .2, { r: .03, colour: MISSION_COLOURS.gold }));
    mission.actors.push(actor('socket', .5, .82, { r: .05, colour: MISSION_COLOURS.objective }));
  }

  function setupVault() {
    mission = makeMission('vault', 'BREACH THE VAULT', 'Disable both generators.', 2);
    mission.stage = 0;
    mission.autoExit = false;
    mission.actors.push(actor('generator', .18, .34, { r: .045, colour: MISSION_COLOURS.danger }));
    mission.actors.push(actor('generator', .82, .62, { r: .045, colour: MISSION_COLOURS.danger }));
  }

  function setupFinalDoor() {
    mission = makeMission('finalDoor', 'BREAK THE FINAL LOCK', 'Destroy 4 lock nodes.', 4);
    mission.stage = 0;
    mission.autoExit = false;
    addSpreadActors('tracker', 4, { r: .035, colour: MISSION_COLOURS.danger, yMin: .22, yMax: .74 });
  }

  function setupSecurityLockdown() {
    mission = makeMission('securityLockdown', 'BREAK LOCKDOWN', 'Hit 3 security relays, then reach the exit.', 3);
    addSpreadActors('tracker', 3, { r: .035, colour: MISSION_COLOURS.danger, yMin: .22, yMax: .74 });
  }

  function initialiseMission() {
    const type = game.roomType;
    const escape = game.coreSecured;

    if (type === 'boss') {
      if (!escape && game.room === 10) setupVault();
      else if (game.finalContract && escape && game.room === 20) setupFinalDoor();
      else setupSecurityLockdown();
    } else if (!escape) {
      const setups = {
        spinner: setupBreakCore,
        debris: setupPowerCells,
        lasers: setupLaserShutdown,
        gates: setupKeyGrab,
        memory: setupSequence,
        combo: setupMovingTarget,
        crushers: setupPressurePlates,
        mines: setupChargeDelivery,
        gravity: setupSignalHunt,
        treasureRush: setupTreasureLock,
        glitch: setupFalseExit
      };
      (setups[type] || setupHackPoints)();
    } else {
      const setups = {
        spinner: setupCoreRelay,
        debris: setupPursuit,
        lasers: setupLockdownOverride,
        gates: setupMovingExit,
        memory: setupSequence,
        combo: setupSecuritySweep,
        crushers: setupLockdownOverride,
        mines: setupCoreCooling,
        gravity: setupSignalHunt,
        treasureRush: setupDoubleCarry,
        glitch: setupFalseExit
      };
      (setups[type] || setupCoreRelay)();
    }

    mission.id ||= type;
    mission.lastProgressAt = 0;
    mission.scannerCd = 1.8;
    updateObjectiveHud();
    toast(`${mission.title}: ${mission.instruction}`, 1250);
  }

  beginRoom = function (doorType) {
    baseBeginRoom(doorType);
    initialiseMission();
  };

  clearRoom = function () {
    // Room completion is objective-gated. Timer expiry is ignored.
    if (!mission || !mission.active) return;
    if (!mission.readyToExit || !mission.exitReached) return;
    baseClearRoom();
  };

  dash = function () {
    const before = player.dashCd;
    baseDash();
    if (game.mode === 'playing' && before <= 0 && player.dash > 0) missionDashPulse = .18;
  };

  function isNear(a, radius = null) {
    return mdist(player, a) <= (radius || a.r + .025);
  }

  function markDone(a) {
    a.done = true;
    a.active = false;
    spawnParticle(a.x, a.y, a.colour || MISSION_COLOURS.objective, 15, .13);
  }

  function updateMovingActor(a, dt) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.x < .12 || a.x > .88) { a.vx *= -1; a.x = clamp(a.x, .12, .88); }
    if (a.y < .18 || a.y > .78) { a.vy *= -1; a.y = clamp(a.y, .18, .78); }
    if (mdist(a, player) < .2) {
      a.vx += (a.x - player.x) * dt * .9;
      a.vy += (a.y - player.y) * dt * .9;
      a.vx = clamp(a.vx, -.32, .32);
      a.vy = clamp(a.vy, -.26, .26);
    }
  }

  function updateCarryMission() {
    const pickups = mission.actors.filter(a => ['cell', 'charge', 'fragment'].includes(a.kind) && !a.done);
    const socket = mission.actors.find(a => a.kind === 'socket');

    if (!mission.carried) {
      const pickup = pickups.find(a => isNear(a));
      if (pickup) {
        mission.carried = pickup;
        pickup.carried = true;
        toast(pickup.kind === 'fragment' ? 'FRAGMENT ACQUIRED' : 'PICKED UP — DELIVER IT', 650);
        sfx('coin');
      }
    }

    if (mission.carried) {
      mission.carried.x = player.x;
      mission.carried.y = player.y - .055;
      if (socket && isNear(socket, socket.r + .03)) {
        const delivered = mission.carried;
        markDone(delivered);
        delivered.carried = false;
        mission.carried = null;
        if (delivered.kind === 'fragment') {
          game.coreValue = Math.floor(game.coreValue * 1.35);
          progressMission(1, 'SECONDARY CORE SECURED • VALUE +35%');
        } else {
          progressMission(1, `${mission.progress + 1}/${mission.target} DELIVERED`);
        }
      }
    }
  }

  function updateTerminal(a, dt) {
    if (a.done) return;
    if (isNear(a, a.r + .025)) {
      a.progress += dt;
      if (a.progress >= .72) {
        markDone(a);
        progressMission(1, 'TERMINAL HACKED');
      }
    } else {
      a.progress = Math.max(0, a.progress - dt * .7);
    }
  }

  function updateSequencePad(a) {
    if (a.done || !isNear(a)) return;
    const expectedActorIndex = mission.sequence[mission.sequenceIndex];
    if (a.order === expectedActorIndex) {
      markDone(a);
      mission.sequenceIndex += 1;
      progressMission(1, `SEQUENCE ${mission.sequenceIndex}/${mission.target}`);
    } else if (mission.sequenceIndex > 0) {
      mission.actors.filter(x => x.kind === 'sequencePad').forEach(x => { x.done = false; x.active = true; });
      mission.sequenceIndex = 0;
      mission.progress = 0;
      mission.lastProgressAt = mission.elapsed;
      game.flash = .2;
      game.flashColor = MISSION_COLOURS.danger;
      toast('WRONG PAD — SEQUENCE RESET', 650);
      sfx('warn');
      updateObjectiveHud();
    }
  }

  function updateOrderedActor(a, label) {
    if (a.done || !isNear(a)) return;
    if (a.order !== mission.progress) return;
    markDone(a);
    progressMission(1, `${label} ${mission.progress + 1}/${mission.target}`);
  }

  function updateScanActor(a) {
    if (a.done || !isNear(a, a.r + .035)) return;
    markDone(a);
    if (a.real) {
      mission.progress = mission.target - 1;
      progressMission(1, 'REAL SIGNAL FOUND');
    } else {
      mission.lastProgressAt = mission.elapsed;
      toast('DECOY — KEEP SEARCHING', 450);
      sfx('warn');
    }
  }

  function updateVault(dt) {
    if (mission.stage === 0) {
      mission.actors.filter(a => a.kind === 'generator').forEach(a => {
        if (!a.done && isNear(a) && missionDashPulse > 0) {
          markDone(a);
          progressMission(1, 'GENERATOR DOWN');
        }
      });
      if (mission.progress >= 2) {
        mission.stage = 1;
        mission.title = 'CRACK THE VAULT';
        mission.instruction = 'Hold the centre hack until the vault opens.';
        mission.target = 1;
        mission.progress = 0;
        mission.readyToExit = false;
        mission.actors = [actor('terminal', .5, .46, { r: .055, colour: MISSION_COLOURS.gold, vaultHack: true })];
        updateObjectiveHud();
        toast('GENERATORS DOWN — HACK THE VAULT', 800);
      }
    } else if (mission.stage === 1) {
      const terminal = mission.actors.find(a => a.kind === 'terminal');
      if (terminal && !terminal.done) {
        if (isNear(terminal, .08)) {
          terminal.progress += dt;
          if (terminal.progress >= 1) {
            markDone(terminal);
            mission.stage = 2;
            mission.title = 'STEAL THE CORE';
            mission.instruction = 'Take the exposed Core.';
            mission.progress = 0;
            mission.target = 1;
            mission.actors = [actor('vaultCore', .5, .46, { r: .04, colour: MISSION_COLOURS.gold })];
            updateObjectiveHud();
            toast('VAULT OPEN — TAKE THE CORE', 800);
          }
        } else terminal.progress = Math.max(0, terminal.progress - dt * .75);
      }
    } else if (mission.stage === 2) {
      const core = mission.actors.find(a => a.kind === 'vaultCore');
      if (core && !core.done && isNear(core, .065)) {
        markDone(core);
        mission.progress = 1;
        mission.stage = 3;
        openExit();
      }
    }
  }

  function updateFinalDoor(dt) {
    if (mission.stage === 0) {
      mission.actors.filter(a => a.kind === 'tracker').forEach(a => {
        if (!a.done && isNear(a) && missionDashPulse > 0) {
          markDone(a);
          progressMission(1, 'LOCK NODE BROKEN');
        }
      });
      if (mission.progress >= 4) {
        mission.stage = 1;
        mission.readyToExit = false;
        mission.title = 'FINAL SEQUENCE';
        mission.instruction = 'Hit the three seals in order.';
        mission.target = 3;
        mission.progress = 0;
        mission.sequence = [0, 1, 2];
        mission.sequenceIndex = 0;
        mission.autoExit = true;
        mission.actors = [
          actor('sequencePad', .2, .66, { r: .045, order: 0, colour: MISSION_COLOURS.gold }),
          actor('sequencePad', .8, .42, { r: .045, order: 1, colour: MISSION_COLOURS.gold }),
          actor('sequencePad', .5, .2, { r: .045, order: 2, colour: MISSION_COLOURS.gold })
        ];
        updateObjectiveHud();
        toast('FINAL LOCK EXPOSED', 800);
      }
    } else {
      mission.actors.filter(a => a.kind === 'sequencePad').forEach(updateSequencePad);
    }
  }

  function updateMissionActors(dt) {
    if (!mission || !mission.active) return;

    if (mission.id === 'vault') { updateVault(dt); return; }
    if (mission.id === 'finalDoor') { updateFinalDoor(dt); return; }

    if (['powerCells', 'chargeDelivery', 'doubleCarry'].includes(mission.id)) updateCarryMission();

    for (const a of mission.actors) {
      if (a.done) continue;

      if (a.kind === 'terminal') updateTerminal(a, dt);
      else if (a.kind === 'coreNode' && isNear(a, .07) && missionDashPulse > 0) {
        a.hits = (a.hits || 0) + 1;
        player.invuln = Math.max(player.invuln, .12);
        spawnParticle(a.x, a.y, MISSION_COLOURS.white, 18, .15);
        progressMission(1, `CORE HIT ${a.hits}/3`);
        const dx = player.x - a.x || .01, dy = player.y - a.y || .01;
        const mag = Math.max(.01, Math.hypot(dx, dy));
        player.tx = clamp(a.x + dx / mag * .24, .08, .92);
        player.ty = clamp(a.y + dy / mag * .24, .18, .9);
      }
      else if (['emitter', 'tracker', 'generator'].includes(a.kind) && isNear(a, .065) && missionDashPulse > 0) {
        markDone(a);
        progressMission(1, `${mission.progress + 1}/${mission.target} DISABLED`);
      }
      else if (a.kind === 'token' && isNear(a, .065)) {
        markDone(a);
        progressMission(1, 'TOKEN ACQUIRED');
      }
      else if (a.kind === 'sequencePad') updateSequencePad(a);
      else if (a.kind === 'movingTarget') {
        updateMovingActor(a, dt);
        if (isNear(a, .065) && missionDashPulse > 0) {
          progressMission(1, `ORB TAGGED ${mission.progress + 1}/3`);
          a.x = R(.18, .82); a.y = R(.2, .7); a.vx *= -1;
        }
      }
      else if (a.kind === 'plate' && isNear(a, .065)) updateOrderedActor(a, 'PLATE');
      else if (['signal', 'fakeExit'].includes(a.kind)) updateScanActor(a);
      else if (a.kind === 'lootShard' && isNear(a, .055)) {
        markDone(a);
        game.runCoins += Math.floor(18 * Math.max(1, game.multiplier));
        progressMission(1, `SHARD ${mission.progress + 1}/${mission.target}`);
        spawnPattern(pick(['debris', 'gates', 'lasers']), .7);
      }
      else if (a.kind === 'relay' && isNear(a, .065)) updateOrderedActor(a, 'RELAY');
      else if (a.kind === 'movingExit') {
        updateMovingActor(a, dt);
        if (isNear(a, .075)) {
          progressMission(1, `EXIT LOCK ${mission.progress + 1}/3`);
          a.x = R(.18, .82); a.y = R(.2, .72); a.vx *= -1; a.vy *= -1;
        }
      }
      else if (a.kind === 'coolant' && isNear(a, .065)) {
        markDone(a);
        progressMission(1, `CORE COOLED ${mission.progress + 1}/${mission.target}`);
      }
      else if (a.kind === 'checkpoint') updateOrderedActor(a, 'CHECKPOINT');
    }
  }

  function updateExit() {
    if (!mission || !mission.readyToExit || !mission.exit || mission.exitReached) return;
    if (isNear(mission.exit, .075)) finishMissionRoom();
  }

  function updateAntiCamp(dt) {
    if (!mission || mission.readyToExit) return;
    const moved = Math.hypot(player.x - mission.lastPlayerX, player.y - mission.lastPlayerY);
    mission.lastPlayerX = player.x;
    mission.lastPlayerY = player.y;
    mission.stillFor = moved < .0035 ? mission.stillFor + dt : Math.max(0, mission.stillFor - dt * 1.8);
    mission.scannerCd = Math.max(0, mission.scannerCd - dt);

    const noProgress = mission.elapsed - mission.lastProgressAt;
    if (mission.scannerCd <= 0 && (mission.stillFor > 2.2 || noProgress > 5.8)) {
      if (rng() < .5) laser('v', clamp(player.x, .1, .9), .48, .5, .032);
      else laser('h', clamp(player.y, .2, .85), .48, .5, .03);
      mission.scannerCd = 1.8;
      mission.stillFor = 0;
      mission.lastProgressAt = mission.elapsed - 3.4;
      toast('SCANNER LOCK — MOVE', 520);
      sfx('warn');
    }
  }

  function missionUpdate(dt) {
    if (!mission || game.mode !== 'playing') return;
    mission.elapsed += dt;
    mission.hintCooldown = Math.max(0, mission.hintCooldown - dt);
    missionDashPulse = Math.max(0, missionDashPulse - dt);
    updateMissionActors(dt);
    updateExit();
    updateAntiCamp(dt);
  }

  update = function (dt) {
    if (game.mode !== 'playing') return;
    const slow = roomData.slow > 0 ? .45 : 1;
    if (roomData.slow > 0) roomData.slow -= dt;
    const sdt = dt * slow;
    game.roomTime += sdt;
    game.transition = Math.max(0, game.transition - dt * 2.8);
    game.flash = Math.max(0, game.flash - dt);
    game.screenShake = Math.max(0, game.screenShake - dt * 2.2);
    game.dangerPulse += dt * (2 + difficulty() * .2);
    updatePlayer(sdt);
    updateRoomLogic(sdt);
    updateHazards(sdt);
    updateCoins(sdt);
    updateParticles(dt);
    missionUpdate(sdt);
    musicTick(dt);
    // Deliberately no timer-based clearRoom() call here.
  };

  function drawMissionActor(a) {
    if (a.done && !a.carried) return;
    const x = pxX(a.x), y = pxY(a.y), r = a.r * vw();
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowBlur = 18;
    ctx.shadowColor = a.colour;
    ctx.strokeStyle = a.colour;
    ctx.fillStyle = 'rgba(4,7,13,.82)';
    ctx.lineWidth = 2;

    if (['terminal', 'generator', 'emitter', 'tracker'].includes(a.kind)) {
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-r * .72, -r * .72, r * 1.44, r * 1.44);
      ctx.fillRect(-r * .48, -r * .48, r * .96, r * .96);
      if (a.kind === 'terminal' && a.progress > 0) {
        ctx.rotate(-Math.PI / 4);
        ctx.strokeStyle = MISSION_COLOURS.objective;
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(a.progress / .72, 0, 1));
        ctx.stroke();
      }
    } else if (['cell', 'charge', 'fragment', 'vaultCore', 'lootShard', 'token'].includes(a.kind)) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = a.colour;
      ctx.fillRect(-r * .48, -r * .48, r * .96, r * .96);
    } else if (['sequencePad', 'plate', 'relay', 'coolant', 'checkpoint'].includes(a.kind)) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, TAU); ctx.stroke();
      if (a.kind === 'sequencePad' || a.kind === 'checkpoint') {
        ctx.fillStyle = a.colour;
        ctx.font = `900 ${Math.max(10, r * .7)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let label = a.order + 1;
        if (a.kind === 'sequencePad' && mission.sequence?.length) label = mission.sequence.indexOf(a.order) + 1;
        ctx.fillText(String(label), 0, 1);
      }
    } else if (['movingTarget', 'signal'].includes(a.kind)) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * .28, 0, TAU); ctx.fillStyle = a.colour; ctx.fill();
    } else if (['fakeExit', 'movingExit'].includes(a.kind)) {
      ctx.strokeRect(-r * .65, -r, r * 1.3, r * 2);
      ctx.beginPath(); ctx.arc(r * .38, 0, 2.5, 0, TAU); ctx.fillStyle = a.colour; ctx.fill();
    } else if (a.kind === 'coreNode') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = MISSION_COLOURS.white; ctx.fill();
      ctx.strokeStyle = MISSION_COLOURS.danger;
      ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, TAU); ctx.stroke();
    } else if (a.kind === 'socket') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * .45, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMissionExit() {
    if (!mission?.readyToExit || !mission.exit) return;
    const a = mission.exit;
    const x = pxX(a.x), y = pxY(a.y), r = a.r * vw();
    const pulse = 1 + Math.sin(performance.now() / 120) * .08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.shadowBlur = 28;
    ctx.shadowColor = MISSION_COLOURS.objective;
    ctx.strokeStyle = MISSION_COLOURS.objective;
    ctx.fillStyle = 'rgba(98,255,179,.08)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-r * .62, -r, r * 1.24, r * 2);
    ctx.fillRect(-r * .55, -r * .92, r * 1.1, r * 1.84);
    ctx.fillStyle = MISSION_COLOURS.objective;
    ctx.font = '900 9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 0, r + 16);
    ctx.restore();
  }

  function drawCarryLink() {
    if (!mission?.carried) return;
    const a = mission.carried;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,201,46,.45)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(pxX(player.x), pxY(player.y));
    ctx.lineTo(pxX(a.x), pxY(a.y));
    ctx.stroke();
    ctx.restore();
  }

  function drawMissionLayer() {
    if (!mission || game.mode !== 'playing') return;
    drawCarryLink();
    mission.actors.forEach(drawMissionActor);
    drawMissionExit();
  }

  render = function () {
    baseRender();
    drawMissionLayer();
  };

  drawRoomProgress = function () {
    if (game.mode !== 'playing' || !mission) return;
    const w = vw(), h = vh();
    const x = 14, y = h * .148, bw = w - 28, bh = 3;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x, y, bw, bh);
    const p = mission.readyToExit ? 1 : clamp(mission.progress / Math.max(1, mission.target), 0, 1);
    ctx.fillStyle = mission.readyToExit ? MISSION_COLOURS.objective : game.coreSecured ? MISSION_COLOURS.gold : MISSION_COLOURS.blue;
    ctx.fillRect(x, y, bw * p, bh);
    ctx.font = '800 9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(235,240,255,.78)';
    ctx.fillText(mission.readyToExit ? 'EXIT OPEN' : mission.title, w * .5, y + 17);
  };

  const oldSetMode = setMode;
  setMode = function (mode) {
    oldSetMode(mode);
    const wrap = $('objectiveHud');
    if (wrap) wrap.classList.toggle('hidden', mode !== 'playing' || !mission);
  };
})();
