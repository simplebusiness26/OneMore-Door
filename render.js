'use strict';
  function drawBackground() {
    const w=vw(),h=vh();
    ctx.fillStyle='#03040a';ctx.fillRect(0,0,w,h);
    const grd=ctx.createRadialGradient(w*.5,h*.34,20,w*.5,h*.34,h*.68);
    grd.addColorStop(0,'#161027');grd.addColorStop(.5,'#070a14');grd.addColorStop(1,'#020307');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
    ctx.save();
    ctx.globalAlpha=.28;
    const horizon=h*.32;
    ctx.strokeStyle=game.roomType==='boss'?'#ff365f':'#6f45a9';ctx.lineWidth=1;
    for(let i=-6;i<=6;i++){
      ctx.beginPath();ctx.moveTo(w*.5,horizon);ctx.lineTo(w*.5+i*w*.14,h);ctx.stroke();
    }
    for(let j=0;j<11;j++){
      const t=j/10;const y=lerp(horizon,h,Math.pow(t,1.7));
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
    }
    ctx.restore();
    const sideGlow=Math.sin(game.dangerPulse)*.5+.5;
    ctx.fillStyle=`rgba(255,54,95,${.015+sideGlow*.025})`;ctx.fillRect(0,0,w*.06,h);ctx.fillRect(w*.94,0,w*.06,h);
  }

  function drawCorridorDoor() {
    if(game.mode==='playing')return;
    const w=vw(),h=vh();
    const dw=Math.min(w*.42,230),dh=Math.min(h*.36,320),x=(w-dw)/2,y=h*.18;
    ctx.save();ctx.shadowBlur=28;ctx.shadowColor='#b56cff';ctx.strokeStyle='rgba(181,108,255,.65)';ctx.lineWidth=3;
    ctx.strokeRect(x,y,dw,dh);ctx.shadowBlur=0;
    for(let i=0;i<4;i++){ctx.strokeStyle=`rgba(40,198,255,${.11-i*.018})`;ctx.strokeRect(x-i*9,y-i*8,dw+i*18,dh+i*16)}
    ctx.fillStyle='rgba(181,108,255,.08)';ctx.fillRect(x,y,dw,dh);
    ctx.restore();
  }

  function drawMemoryLane() {
    if(game.roomType!=='memory')return;
    const w=vw(),h=vh();
    const lw=w/3;
    if(roomData.phase%2===1){
      ctx.fillStyle='rgba(98,255,179,.12)';ctx.fillRect(roomData.safeLane*lw,0,lw,h);
      ctx.strokeStyle='rgba(98,255,179,.42)';ctx.strokeRect(roomData.safeLane*lw+2,h*.13,lw-4,h*.77);
    }
  }

  function drawHazards() {
    const w=vw(),h=vh();
    for(const hz of hazards){
      ctx.save();
      if(hz.kind==='circle'){
        const x=pxX(hz.x),y=pxY(hz.y),r=hz.r*w;
        ctx.shadowBlur=16;ctx.shadowColor=hz.color;ctx.fillStyle=hz.color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
        ctx.fillStyle='#05060b';ctx.beginPath();ctx.arc(x,y,r*.45,0,TAU);ctx.fill();
      } else if(hz.kind==='rect'||hz.kind==='crusher'){
        const x=pxX(hz.x),y=pxY(hz.y),rw=pxX(hz.w),rh=pxY(hz.h);
        ctx.shadowBlur=18;ctx.shadowColor=hz.color;ctx.fillStyle=hz.color;ctx.fillRect(x,y,rw,rh);
        ctx.fillStyle='rgba(5,6,11,.65)';ctx.fillRect(x+3,y+3,Math.max(0,rw-6),Math.max(0,rh-6));
      } else if(hz.kind==='laser'){
        const active=hz.age>=hz.delay && hz.age<=hz.delay+hz.duration;
        const warn=hz.age<hz.delay;
        ctx.globalAlpha=active?1:warn?(.25+.2*Math.sin(hz.age*28)):.15;
        ctx.shadowBlur=active?24:8;ctx.shadowColor=hz.color;ctx.strokeStyle=hz.color;ctx.lineWidth=(active?hz.width:.006)*w;
        ctx.beginPath();
        if(hz.axis==='v'){ctx.moveTo(pxX(hz.pos),0);ctx.lineTo(pxX(hz.pos),h);}else{ctx.moveTo(0,pxY(hz.pos));ctx.lineTo(w,pxY(hz.pos));}
        ctx.stroke();
      } else if(hz.kind==='spinner'){
        ctx.translate(pxX(hz.x),pxY(hz.y));ctx.rotate(hz.angle);ctx.strokeStyle=hz.color;ctx.shadowBlur=18;ctx.shadowColor=hz.color;ctx.lineWidth=Math.max(3,hz.width*w);ctx.beginPath();ctx.moveTo(-hz.r*w,0);ctx.lineTo(hz.r*w,0);ctx.stroke();
        ctx.fillStyle='#f7f8ff';ctx.beginPath();ctx.arc(0,0,7,0,TAU);ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawCoins() {
    const w=vw();
    for(const c of coins){
      const x=pxX(c.x),y=pxY(c.y),r=c.r*w;
      ctx.save();ctx.translate(x,y);ctx.rotate(c.spin);ctx.shadowBlur=16;ctx.shadowColor='#ffc92e';ctx.fillStyle='#ffc92e';
      ctx.beginPath();for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;const xx=Math.cos(a)*r,yy=Math.sin(a)*r;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.restore();
    }
  }

  function drawPlayer() {
    const w=vw();
    for(let i=0;i<player.trail.length;i++){
      const t=player.trail[i];ctx.globalAlpha=clamp(t.life/.26,0,1)*.22;ctx.fillStyle='#28c6ff';ctx.beginPath();ctx.arc(pxX(t.x),pxY(t.y),player.r*(i/player.trail.length+.2),0,TAU);ctx.fill();
    }
    ctx.globalAlpha=1;
    const x=pxX(player.x),y=pxY(player.y),r=player.r;
    ctx.save();ctx.translate(x,y);ctx.shadowBlur=player.dash>0?34:20;ctx.shadowColor=player.invuln>0?'#b56cff':'#28c6ff';
    ctx.fillStyle=player.invuln>0&&Math.floor(performance.now()/70)%2===0?'#f7f8ff':'#071421';ctx.strokeStyle=game.shieldReady?'#62ffb3':'#28c6ff';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.stroke();
    ctx.rotate(Math.PI/4);ctx.fillStyle='#28c6ff';ctx.fillRect(-4,-4,8,8);
    if(game.shieldReady){ctx.strokeStyle='rgba(98,255,179,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r+7,0,TAU);ctx.stroke();}
    ctx.restore();
  }

  function drawParticles() {
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.65,0,1);ctx.fillStyle=p.color;ctx.fillRect(pxX(p.x),pxY(p.y),p.size,p.size);}ctx.globalAlpha=1;
  }

  function drawRoomProgress() {
    if(game.mode!=='playing')return;
    const w=vw(),h=vh();
    const x=14,y=h*.105,bw=w-28,bh=3;
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x,y,bw,bh);
    const p=clamp(game.roomTime/game.roomDuration,0,1);
    ctx.fillStyle=game.roomType==='boss'?'#ff365f':'#28c6ff';ctx.fillRect(x,y,bw*p,bh);
    if(game.roomType==='boss'){ctx.font='800 9px system-ui';ctx.textAlign='center';ctx.fillStyle='rgba(255,54,95,.75)';ctx.fillText('THE ELEVATOR',w*.5,y+17);}
  }

  function render() {
    const w=vw(),h=vh();
    ctx.save();
    if(game.screenShake>0){const s=game.screenShake*8;ctx.translate(R(-s,s),R(-s,s));}
    drawBackground();drawCorridorDoor();drawMemoryLane();drawCoins();drawHazards();drawPlayer();drawParticles();drawRoomProgress();
    ctx.restore();
    if(game.flash>0){ctx.globalAlpha=clamp(game.flash*1.8,0,.55);ctx.fillStyle=game.flashColor;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
    if(game.transition>0){ctx.globalAlpha=game.transition;ctx.fillStyle='#020307';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
  }

  function loop(now) {
    const dt=clamp((now-lastTime)/1000,0,.034);lastTime=now;
    update(dt);render();requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
