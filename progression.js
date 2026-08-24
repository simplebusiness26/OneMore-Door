'use strict';
  function updateCoins(dt) {
    const magnet = hasAbility('magnet');
    for (const c of coins) {
      c.spin += dt*7;
      c.y += c.vy*dt;
      const dd=Math.sqrt(dist2(c.x,c.y,player.x,player.y));
      if(magnet && dd<.25){ c.x += (player.x-c.x)*dt*4.8; c.y += (player.y-c.y)*dt*4.8; }
      if(player.alive && dd<c.r+.025){
        c.dead=true;
        const bonus=hasAbility('greed')?1.25:1;
        game.runCoins += Math.max(1,Math.floor(c.value*bonus));
        spawnParticle(c.x,c.y,'#ffc92e',7,.09); sfx('coin');
        updateHud();
      }
    }
    coins=coins.filter(c=>!c.dead && c.y<1.1);
  }

  function updateParticles(dt) {
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
  }

  function updatePlayer(dt) {
    if (!player.alive) return;
    player.invuln=Math.max(0,player.invuln-dt);
    player.dashCd=Math.max(0,player.dashCd-dt);
    player.dash=Math.max(0,player.dash-dt);
    const rate=player.dash>0?18:10;
    let targetX=player.tx;
    if(game.roomType==='gravity' && roomData.invert) targetX=1-player.tx;
    player.x=lerp(player.x,clamp(targetX,.04,.96),1-Math.exp(-rate*dt));
    player.y=lerp(player.y,clamp(player.ty,.16,.92),1-Math.exp(-7*dt));
    player.trail.push({x:player.x,y:player.y,life:.26});
    if(player.trail.length>16)player.trail.shift();
    player.trail.forEach(t=>t.life-=dt);
    player.trail=player.trail.filter(t=>t.life>0);
  }

  function dash() {
    if(game.mode!=='playing'||player.dashCd>0||!player.alive)return;
    player.dash=.14;player.dashCd=.68;player.invuln=Math.max(player.invuln,.14);
    const perfect = hazards.some(h => {
      const hx=h.x??(h.axis==='v'?h.pos:.5),hy=h.y??(h.axis==='h'?h.pos:.5);
      return dist2(hx,hy,player.x,player.y)<.028;
    });
    if(perfect && hasAbility('slowPulse')) { roomData.slow=.55; toast('PERFECT DASH',450); }
    spawnParticle(player.x,player.y,'#28c6ff',10,.16);sfx('dash');vibrate(8);
  }

  function clearRoom() {
    if(game.mode!=='playing')return;
    const base = 28 + game.room*4;
    const doorBonus = game.roomReward || 1;
    const earned = Math.floor(base*game.multiplier*doorBonus*(hasAbility('greed')?1.2:1));
    game.runCoins += earned;
    save.roomsCleared += 1;
    save.bestRooms=Math.max(save.bestRooms,game.room);
    if(game.daily)save.bestDaily=Math.max(save.bestDaily,game.room);
    save.highestMultiplier=Math.max(save.highestMultiplier,game.multiplier);
    persist();
    updateHud();
    game.flash=.25;game.flashColor='#62ffb3';sfx('clear');vibrate(16);
    toast(`ROOM CLEAR  +${fmt(earned)}`,700);
    setTimeout(()=>chooseDoors(false),430);
  }

  function showBankDecision() {
    $('bankAmount').textContent=fmt(game.runCoins);
    $('riskCopy').textContent=`Next-room payout x${Number((game.multiplier*1.55).toFixed(1))}. Fall and this run's ${fmt(game.runCoins)} coins disappear.`;
    setMode('bank');
  }

  function riskOneMore() {
    game.multiplier = clamp(game.multiplier*1.55,1,99);
    save.highestMultiplier=Math.max(save.highestMultiplier,game.multiplier);
    persist();
    sfx('door');vibrate([12,15,12]);
    chooseDoors(false);
  }

  function bankRun() {
    const amount=game.runCoins;
    save.banked += amount;
    save.totalBanked += amount;
    save.biggestBank=Math.max(save.biggestBank,amount);
    save.bankedRuns += 1;
    persist();
    $('bankedResult').textContent=fmt(amount);
    sfx('bank');vibrate([15,30,15]);
    setMode('banked');
  }

  function endRunDeath() {
    if(game.mode!=='playing')return;
    save.deaths += 1;
    save.bestRooms=Math.max(save.bestRooms,Math.max(0,game.room-1));
    if(game.daily)save.bestDaily=Math.max(save.bestDaily,Math.max(0,game.room-1));
    persist();
    $('deadRooms').textContent=Math.max(0,game.room-1);
    $('lostCoins').textContent=fmt(game.runCoins);
    $('deadBest').textContent=save.bestRooms;
    $('deadCopy').textContent=game.runCoins>0?`The building kept ${fmt(game.runCoins)} coins.`:'The building kept nothing. This time.';
    setMode('dead');
  }

  function pauseGame() {
    if(game.mode!=='playing')return;
    game.pausedAt=performance.now();
    setMode('pause');
  }
  function resumeGame() {
    lastTime=performance.now();
    setMode('playing');
  }

  function renderUpgrades() {
    $('upgradeBank').textContent=`${fmt(save.banked)} COINS`;
    const list=$('upgradeList');list.innerHTML='';
    abilityCatalog.forEach(a=>{
      const owned=save.unlocked.includes(a.id), equipped=save.equipped.includes(a.id);
      const row=document.createElement('div');row.className='upgrade';
      const info=document.createElement('div');info.innerHTML=`<h3>${a.name}</h3><p>${a.desc}</p>`;
      const state=document.createElement('div');state.className='upgrade-state';
      const price=document.createElement('span');price.className='price';price.textContent=owned?'OWNED':`${fmt(a.price)} ◈`;
      const btn=document.createElement('button');btn.className=`mini-btn ${equipped?'equipped':''} ${!owned&&save.banked<a.price?'locked':''}`;
      btn.textContent=owned?(equipped?'EQUIPPED':'EQUIP'):'BUY';
      btn.addEventListener('click',()=>{
        if(!owned){
          if(save.banked<a.price){toast('NOT ENOUGH COINS');return;}
          save.banked-=a.price;save.unlocked.push(a.id);
          if(save.equipped.length<3)save.equipped.push(a.id);
          persist();sfx('bank');renderUpgrades();return;
        }
        const idx=save.equipped.indexOf(a.id);
        if(idx>=0)save.equipped.splice(idx,1);
        else if(save.equipped.length<3)save.equipped.push(a.id);
        else {toast('MAX 3 EQUIPPED');return;}
        persist();renderUpgrades();
      });
      state.append(price,btn);row.append(info,state);list.appendChild(row);
    });
  }

  function renderStats() {
    const stats=[
      ['BEST RUN',`${save.bestRooms} DOORS`],['DAILY BEST',`${save.bestDaily||0} DOORS`],['BANKED COINS',fmt(save.banked)],
      ['TOTAL BANKED',fmt(save.totalBanked)],['BIGGEST BANK',fmt(save.biggestBank)],['ROOMS CLEARED',fmt(save.roomsCleared)],
      ['RUNS',fmt(save.runs)],['BANKED RUNS',fmt(save.bankedRuns)],['DEATHS',fmt(save.deaths)],['TOP MULTIPLIER',`x${Number(save.highestMultiplier.toFixed(1))}`]
    ];
    $('statsList').innerHTML=stats.map(([k,v])=>`<div class="stat-row"><span>${k}</span><strong>${v}</strong></div>`).join('');
  }

  function update(dt) {
    if(game.mode!=='playing')return;
    const slow = roomData.slow>0 ? .45 : 1;
    if(roomData.slow>0)roomData.slow-=dt;
    const sdt=dt*slow;
    game.roomTime+=sdt;
    game.transition=Math.max(0,game.transition-dt*2.8);
    game.flash=Math.max(0,game.flash-dt);
    game.screenShake=Math.max(0,game.screenShake-dt*2.2);
    game.dangerPulse+=dt*(2+difficulty()*.2);
    updatePlayer(sdt);
    updateRoomLogic(sdt);
    updateHazards(sdt);
    updateCoins(sdt);
    updateParticles(dt);
    musicTick(dt);
    if(player.alive && game.roomTime>=game.roomDuration)clearRoom();
  }

