'use strict';
  function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
  canvas.addEventListener('pointerdown',e=>{
    if(game.mode!=='playing')return;pointerDown=true;canvas.setPointerCapture?.(e.pointerId);const p=pointerPos(e);pointerStart=p;pointerLast=p;player.tx=p.x;player.ty=clamp(p.y,.18,.9);unlockAudio();
  });
  canvas.addEventListener('pointermove',e=>{if(!pointerDown||game.mode!=='playing')return;const p=pointerPos(e);pointerLast=p;player.tx=p.x;player.ty=clamp(p.y,.18,.9);});
  canvas.addEventListener('pointerup',e=>{
    if(!pointerDown)return;pointerDown=false;const p=pointerPos(e);const moved=Math.hypot(p.x-pointerStart.x,p.y-pointerStart.y);const now=performance.now();if(moved<.035){dash();lastTap=now;}pointerStart=null;
  });
  canvas.addEventListener('pointercancel',()=>{pointerDown=false;});

  document.addEventListener('keydown',e=>{
    if(game.mode!=='playing')return;
    const step=.08;
    if(e.key==='ArrowLeft'||e.key==='a')player.tx-=step;
    if(e.key==='ArrowRight'||e.key==='d')player.tx+=step;
    if(e.key==='ArrowUp'||e.key==='w')player.ty-=step;
    if(e.key==='ArrowDown'||e.key==='s')player.ty+=step;
    if(e.key===' '){e.preventDefault();dash();}
    if(e.key==='Escape')pauseGame();
  });

  $('playBtn').addEventListener('click',()=>startRun(false));
  $('dailyBtn').addEventListener('click',()=>startRun(true));
  $('upgradesBtn').addEventListener('click',()=>{renderUpgrades();setMode('upgrades');});
  $('statsBtn').addEventListener('click',()=>{renderStats();setMode('stats');});
  $('soundBtn').addEventListener('click',()=>{save.sound=!save.sound;persist();refreshTitle();if(save.sound)unlockAudio();});
  $('riskBtn').addEventListener('click',riskOneMore);
  $('bankBtn').addEventListener('click',bankRun);
  $('againBtn').addEventListener('click',()=>startRun(game.daily));
  $('bankedAgainBtn').addEventListener('click',()=>startRun(game.daily));
  $('homeFromDead').addEventListener('click',()=>{refreshTitle();setMode('title');});
  $('homeFromBank').addEventListener('click',()=>{refreshTitle();setMode('title');});
  $('pauseBtn').addEventListener('click',pauseGame);
  $('resumeBtn').addEventListener('click',resumeGame);
  $('quitBtn').addEventListener('click',()=>{save.deaths++;persist();refreshTitle();setMode('title');});
  document.querySelectorAll('.backBtn').forEach(btn=>btn.addEventListener('click',()=>{refreshTitle();setMode('title');}));

  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.mode==='playing')pauseGame();});

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}

  refreshTitle();setMode('title');
