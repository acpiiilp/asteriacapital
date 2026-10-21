(function(){
  var d=document, root=d.documentElement;
  root.classList.add('js');

  // year
  d.querySelectorAll('[data-year]').forEach(function(n){n.textContent=new Date().getFullYear();});

  // mobile menu
  var btn=d.querySelector('.tb__menu'), nav=d.getElementById('mnav');
  if(btn&&nav){
    btn.addEventListener('click',function(){
      var open=btn.getAttribute('aria-expanded')==='true';
      btn.setAttribute('aria-expanded',String(!open)); btn.textContent=open?'Menú':'Cerrar';
      nav.hidden=open;
    });
    nav.addEventListener('click',function(e){ if(e.target.tagName==='A'){nav.hidden=true;btn.setAttribute('aria-expanded','false');btn.textContent='Menú';}});
  }

  // hero: tighter crop on phones
  var el=d.querySelector('.elev');
  if(el&&window.matchMedia('(max-width:600px)').matches){ el.setAttribute('viewBox', el.getAttribute('data-vb-m')); el.setAttribute('preserveAspectRatio','xMidYMid meet'); }

  // hero: draw the building once fonts/layout are ready
  var hero=d.querySelector('.hero');
  var done=false; function go(){ if(done) return; done=true; setTimeout(function(){ hero&&hero.classList.add('drawn'); },60); }
  setTimeout(go,1400);
  if(d.fonts&&d.fonts.ready){ Promise.race([d.fonts.ready,new Promise(function(r){setTimeout(r,900);})]).then(go); } else go();

  // hero: the tower opens to show its interiors on hover (tap on touch screens)
  (function(){
    var svg=d.querySelector('.elev'); if(!svg||!hero) return;
    var BOX={x0:1340,x1:1600,y0:0,y1:572}, coarse=window.matchMedia('(pointer:coarse)').matches;
    var reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches, demoT=null;
    var txt=d.querySelector('.tower-hint__txt');
    if(coarse&&txt) txt.textContent='Toca la torre para verla por dentro';
    function toSvg(e){ var p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; var m=svg.getScreenCTM(); return m?p.matrixTransform(m.inverse()):null; }
    function inBox(p){ return p&&p.x>BOX.x0&&p.x<BOX.x1&&p.y>BOX.y0&&p.y<BOX.y1; }
    function set(on){ hero.classList.toggle('open',on); }
    svg.addEventListener('pointermove',function(e){
      if(e.pointerType==='touch') return;
      var on=inBox(toSvg(e)); if(on){ clearTimeout(demoT); hero.classList.add('used'); } set(on);
    });
    svg.addEventListener('pointerleave',function(e){ if(e.pointerType!=='touch') set(false); });
    svg.addEventListener('pointerdown',function(e){
      if(e.pointerType!=='touch') return;
      clearTimeout(demoT); hero.classList.add('used');
      set(inBox(toSvg(e)) ? !hero.classList.contains('open') : false);
    });
    // open once by itself after the drawing finishes, so people discover it
    if(!reduce){ demoT=setTimeout(function(){ if(hero.classList.contains('used')) return; set(true);
      demoT=setTimeout(function(){ if(!hero.classList.contains('used')) set(false); },2600); },4200); }
  })();

  // hero: the city comes alive (people walk, trees sway, cars drive) while the cursor is over it;
  // on touch screens it stays alive once the drawing has finished
  (function(){
    var stage=d.querySelector('.hero__draw'); if(!stage||!hero) return;
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if(window.matchMedia('(pointer:coarse)').matches){ setTimeout(function(){ hero.classList.add('alive'); },3200); return; }
    stage.addEventListener('pointerenter',function(){ hero.classList.add('alive'); });
    stage.addEventListener('pointerleave',function(){ hero.classList.remove('alive'); });
  })();

  // process: construction stages follow the scroll position, read every frame (no thin trigger band to skip past)
  var steps=[].slice.call(d.querySelectorAll('.step')),
      sect=d.querySelector('.sect'),
      stages=sect?[].slice.call(sect.querySelectorAll('[data-stage]')):[],
      cap=d.querySelector('[data-cap]'), bar=d.querySelector('.bar i'), cur=0, ticking=false;
  function setStage(n){
    if(n===cur) return; cur=n;
    stages.forEach(function(g){ g.classList.toggle('on', +g.getAttribute('data-stage')<=n); });
    steps.forEach(function(s){ s.classList.toggle('on', +s.getAttribute('data-step')===n); });
    if(sect){ sect.classList.toggle('s5', n>=5); }
    if(cap) cap.textContent='Etapa '+n+' de 5';
  }
  function update(){
    ticking=false;
    var mid=window.innerHeight*0.5, n=1;
    for(var i=0;i<steps.length;i++){ if(steps[i].getBoundingClientRect().top<mid) n=i+1; }
    setStage(n);
    if(bar){
      var a=steps[0].getBoundingClientRect().top, b=steps[steps.length-1].getBoundingClientRect().top;
      var p=b>a?(mid-a)/(b-a):1; p=Math.max(0,Math.min(1,p));
      bar.style.width=(20+p*80)+'%';
    }
  }
  function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } }
  if(steps.length){
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll);
    update();
  }
})();
