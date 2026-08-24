'use strict';
  function spawnPattern(type, intensity=1) {
    const d = difficulty() * intensity;
    if (type === 'debris') {
      const count = RI(1, Math.min(4,1+Math.floor(d*.75)));
      for(let i=0;i<count;i++) hazardCircle(R(.08,.92), R(-.22,-.04), R(.022,.045), R(.18,.28)*d);
      if(rng()<.55) addCoin(R(.12,.88),R(-.12,-.03),Math.ceil(game.multiplier));
    } else if (type === 'gates') {
      const gap = clamp(.34 - d*.025,.18,.34);
      const center = R(.22,.78);
      const leftW = Math.max(0,center-gap/2);
      const rightX = center+gap/2;
      if(leftW>0) hazardRect(0,-.09,leftW,.055,0,.17*d,'#ff365f');
      if(rightX<1) hazardRect(rightX,-.09,1-rightX,.055,0,.17*d,'#ff365f');
      addCoin(center,-.04,Math.ceil(2*game.multiplier));
    } else if (type === 'lasers') {
      if(rng()<.55) laser('v',R(.16,.84),clamp(.72-d*.045,.3,.72),.42,.025);
      else laser('h',R(.25,.7),clamp(.72-d*.045,.3,.72),.38,.022);
    } else if (type === 'mines') {
      for(let i=0;i<RI(2,4);i++) hazardCircle(R(.08,.92),R(-.18,-.02),R(.018,.03),R(.1,.17)*d,'#ff4fe1');
    } else if (type === 'crushers') {
      const y=R(.25,.62), gap=clamp(.34-d*.03,.16,.34), center=R(.3,.7);
      addHazard({kind:'crusher',side:'left',x:0,y,w:center-gap/2,h:.09,vx:.14*d,vy:0,color:'#ff365f',life:1.9});
      addHazard({kind:'crusher',side:'right',x:center+gap/2,y,w:1-(center+gap/2),h:.09,vx:-.14*d,vy:0,color:'#ff365f',life:1.9});
    } else if (type === 'spinner') {
      addHazard({kind:'spinner',x:.5,y:.48,r:R(.17,.25),angle:R(0,TAU),speed:R(1.8,3.2)*d*.55,width:.018,life:2.4,color:'#ff365f'});
    }
  }

  function updateRoomLogic(dt) {
    const type = game.roomType;
    const d = difficulty();
    roomData.next -= dt;

    if (type === 'debris' || type === 'gates' || type === 'lasers' || type === 'mines' || type === 'crushers' || type === 'spinner') {
      if (roomData.next <= 0) {
        spawnPattern(type);
        roomData.next = clamp(R(.72,1.15)/Math.sqrt(d),.34,1.1);
      }
    } else if (type === 'combo') {
      if (roomData.next <= 0) {
        spawnPattern(roomData.phase%2===0 ? roomData.comboA : roomData.comboB, .82);
        if(game.room>18 && rng()<.35) spawnPattern(pick(['debris','lasers','mines']),.52);
        roomData.phase++;
        roomData.next = clamp(R(.6,.95)/Math.sqrt(d),.28,.85);
      }
    } else if (type === 'treasureRush') {
      if (roomData.next <= 0) {
        for(let i=0;i<RI(2,4);i++) addCoin(R(.08,.92),R(-.14,-.02),RI(1,3)*Math.ceil(game.multiplier));
        if(rng()<.38) spawnPattern(pick(['debris','gates']),.55);
        roomData.next = R(.38,.72);
      }
    } else if (type === 'memory') {
      roomData.flashLane -= dt;
      if (roomData.flashLane <= 0 && roomData.phase % 2 === 0) {
        roomData.safeLane = RI(0,2);
        roomData.phase++;
        roomData.flashLane = .62;
        toast(`SAFE LANE ${roomData.safeLane+1}`,500);
        sfx('warn');
      } else if (roomData.flashLane <= 0 && roomData.phase % 2 === 1) {
        const laneW=1/3;
        for(let lane=0;lane<3;lane++) if(lane!==roomData.safeLane) hazardRect(lane*laneW,.18,laneW-.012,.72,0,0,'#ff365f');
        hazards.forEach(h=>{if(h.kind==='rect'&&h.vy===0){h.life=.48;h.telegraph=0;}});
        roomData.phase++;
        roomData.flashLane = clamp(1.05-d*.06,.62,1.05);
      }
    } else if (type === 'gravity') {
      if (roomData.next <= 0) {
        roomData.invert = !roomData.invert;
        toast(roomData.invert ? 'CONTROLS INVERTED' : 'CONTROLS RESTORED',650);
        spawnPattern(pick(['debris','gates']),.72);
        roomData.next = R(1.05,1.55);
      }
    } else if (type === 'glitch') {
      if (roomData.next <= 0) {
        const patterns=['debris','gates','lasers','mines','crushers','spinner'];
        spawnPattern(pick(patterns),R(.65,1.25));
        if(rng()<.18){ player.x=1-player.x; player.tx=player.x; game.flash=.25; game.flashColor='#ff4fe1'; toast('POSITION CORRUPTED',450); }
        roomData.next = clamp(R(.42,.85)/Math.sqrt(d),.24,.8);
      }
    } else if (type === 'boss') {
      if (roomData.next <= 0) {
        const p = Math.floor(game.roomTime/2.25)%4;
        roomData.bossPhase = p;
        if(p===0){spawnPattern('gates',1.25);spawnPattern('debris',.9);}
        if(p===1){laser('v',R(.2,.8),.38,.5,.034);setTimeout(()=>{},0);spawnPattern('mines',.8);}
        if(p===2){spawnPattern('spinner',1.15);spawnPattern('debris',.7);}
        if(p===3){spawnPattern('crushers',1.05);if(rng()<.65)spawnPattern('lasers',.8);}
        roomData.next = clamp(.72/Math.sqrt(d),.28,.72);
      }
    }
  }

  function collisionCircleCircle(a,b) {
    const r = a.r+b.r; return dist2(a.x,a.y,b.x,b.y) < r*r;
  }

  function circleRectCollision(cx,cy,cr,x,y,w,h) {
    const nx=clamp(cx,x,x+w), ny=clamp(cy,y,y+h);
    return dist2(cx,cy,nx,ny) < cr*cr;
  }

  function spinnerCollision(h) {
    const arms=2, pr=.018;
    for(let k=0;k<arms;k++){
      const a=h.angle+k*Math.PI;
      const ex=h.x+Math.cos(a)*h.r, ey=h.y+Math.sin(a)*h.r;
      const vx=ex-h.x, vy=ey-h.y;
      const wx=player.x-h.x, wy=player.y-h.y;
      const c1=wx*vx+wy*vy, c2=vx*vx+vy*vy;
      const t=clamp(c1/c2,0,1);
      const px=h.x+t*vx, py=h.y+t*vy;
      if(dist2(player.x,player.y,px,py)<Math.pow(pr+.019,2)) return true;
    }
    return false;
  }

  function hitPlayer() {
    if (player.invuln > 0 || !player.alive) return;
    if (game.shieldReady) {
      game.shieldReady = false;
      player.invuln = 1.0;
      game.flash = .28; game.flashColor='#28c6ff'; game.screenShake=.5;
      hazards = hazards.filter(h => dist2(h.x??.5,h.y??.5,player.x,player.y)>.08);
      spawnParticle(player.x,player.y,'#28c6ff',22,.2);
      sfx('hit'); vibrate([20,25,20]); toast('PHASE SHIELD',650);
      return;
    }
    if (hasAbility('secondChance') && !game.secondChanceUsed) {
      game.secondChanceUsed = true;
      player.invuln = 1.25;
      game.flash=.35;game.flashColor='#b56cff';game.screenShake=.65;
      hazards = hazards.filter(h => {
        const hx=h.x??.5, hy=h.y??.5;
        return dist2(hx,hy,player.x,player.y)>.16;
      });
      spawnParticle(player.x,player.y,'#b56cff',32,.24);
      sfx('hit'); vibrate([25,35,25]); toast('SECOND CHANCE',800);
      return;
    }
    player.alive=false;
    game.flash=.48; game.flashColor='#ff365f'; game.screenShake=1;
    spawnParticle(player.x,player.y,'#ff365f',44,.3);
    sfx('hit'); vibrate([45,35,80]);
    setTimeout(endRunDeath,360);
  }

  function updateHazards(dt) {
    for (const h of hazards) {
      h.age += dt;
      if (h.kind === 'circle') { h.x += (h.vx||0)*dt; h.y += (h.vy||0)*dt; }
      else if (h.kind === 'rect') { h.x += (h.vx||0)*dt; h.y += (h.vy||0)*dt; }
      else if (h.kind === 'crusher') {
        h.life -= dt;
        if (h.side==='left') h.w = clamp(h.w + h.vx*dt,0,.46);
        else { const delta=Math.abs(h.vx)*dt; h.x=clamp(h.x-delta,.54,1); h.w=1-h.x; }
      }
      else if (h.kind === 'spinner') { h.angle += h.speed*dt; h.life -= dt; }
      else if (h.kind === 'laser') {}

      if (!player.alive) continue;
      let hit=false;
      if(h.kind==='circle') hit=collisionCircleCircle({x:player.x,y:player.y,r:.019},{x:h.x,y:h.y,r:h.r});
      if(h.kind==='rect') hit=circleRectCollision(player.x,player.y,.019,h.x,h.y,h.w,h.h);
      if(h.kind==='crusher') hit=circleRectCollision(player.x,player.y,.019,h.x,h.y,h.w,h.h);
      if(h.kind==='spinner') hit=spinnerCollision(h);
      if(h.kind==='laser' && h.age>=h.delay && h.age<=h.delay+h.duration){
        if(h.axis==='v') hit=Math.abs(player.x-h.pos)<h.width+.018;
        else hit=Math.abs(player.y-h.pos)<h.width+.018;
      }
      if(hit) hitPlayer();
    }
    hazards = hazards.filter(h => {
      if(h.kind==='circle') return h.y-h.r<1.2 && h.y+h.r>-0.4;
      if(h.kind==='rect') return h.y<1.2 && h.y+h.h>-0.4;
      if(h.kind==='crusher'||h.kind==='spinner') return h.life>0;
      if(h.kind==='laser') return h.age<h.delay+h.duration+.18;
      return true;
    });
  }

