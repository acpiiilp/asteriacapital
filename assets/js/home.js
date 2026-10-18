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
  if(el&&window.matchMedia('(max-width:600px)').matches){ el.setAttribute('viewBox', el.getAttribute('data-vb-m')); }

  // hero: draw the building once fonts/layout are ready
  var hero=d.querySelector('.hero');
  var done=false; function go(){ if(done) return; done=true; setTimeout(function(){ hero&&hero.classList.add('drawn'); },60); }
  setTimeout(go,1400);
  if(d.fonts&&d.fonts.ready){ Promise.race([d.fonts.ready,new Promise(function(r){setTimeout(r,900);})]).then(go); } else go();

  // hero: interior cut lens (magnifier) on the tower
  (function(){
    var svg=d.querySelector('.elev'); if(!svg) return;
    var c=d.getElementById('lensC'), bg=d.getElementById('lensBg'), mag=d.getElementById('mag'), ui=d.getElementById('lensUI');
    var S=3.2, BOX={x0:600,x1:930,y0:10,y1:670}, coarse=window.matchMedia('(pointer:coarse)').matches;
    var reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches, demo=null;
    var hintTxt=d.querySelector('.hint__txt');
    if(coarse&&hintTxt) hintTxt.textContent='Toca la torre para ver el interior';
    function place(x,y){
      c.setAttribute('cx',x); c.setAttribute('cy',y); bg.setAttribute('cx',x); bg.setAttribute('cy',y);
      ui.setAttribute('transform','translate('+x+' '+y+')');
      mag.setAttribute('transform','translate('+x+' '+y+') scale('+S+') translate('+(-x)+' '+(-y)+')');
    }
    function toSvg(e){ var p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; var m=svg.getScreenCTM(); return m?p.matrixTransform(m.inverse()):null; }
    function inBox(p){ return p&&p.x>BOX.x0&&p.x<BOX.x1&&p.y>BOX.y0&&p.y<BOX.y1; }
    function stopDemo(){ if(demo){ cancelAnimationFrame(demo); demo=null; } }
    svg.addEventListener('pointermove',function(e){
      if(e.pointerType==='touch') return;
      var p=toSvg(e); stopDemo();
      if(inBox(p)){ place(p.x,p.y); hero.classList.add('lens-on','lens-used'); } else hero.classList.remove('lens-on');
    });
    svg.addEventListener('pointerleave',function(e){ if(e.pointerType!=='touch'){ stopDemo(); hero.classList.remove('lens-on'); }});
    svg.addEventListener('pointerdown',function(e){
      if(e.pointerType!=='touch') return;
      var p=toSvg(e); stopDemo();
      if(inBox(p)){ place(p.x,p.y); hero.classList.add('lens-on','lens-used'); } else hero.classList.remove('lens-on');
    });
    // one guided sweep after the drawing finishes, so people discover it
    function sweep(){
      if(reduce||hero.classList.contains('lens-used')) { if(coarse){ place(760,300); hero.classList.add('lens-on'); } return; }
      var t0=null, dur=3200;
      function step(ts){
        if(!t0) t0=ts; var k=Math.min(1,(ts-t0)/dur), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
        place(700+110*Math.sin(e*Math.PI), 560-440*e); hero.classList.add('lens-on');
        if(k<1) demo=requestAnimationFrame(step); else { demo=null; if(coarse){ place(760,300); } else setTimeout(function(){ if(!hero.classList.contains('lens-used')) hero.classList.remove('lens-on'); },500); }
      }
      demo=requestAnimationFrame(step);
    }
    setTimeout(sweep,3600);
  })();

  // process: scroll-driven construction stages
  var steps=[].slice.call(d.querySelectorAll('.step')),
      sect=d.querySelector('.sect'),
      stages=sect?[].slice.call(sect.querySelectorAll('[data-stage]')):[],
      cap=d.querySelector('[data-cap]'), bar=d.querySelector('.bar i'), cur=0;
  function setStage(n){
    if(n===cur) return; cur=n;
    stages.forEach(function(g){ g.classList.toggle('on', +g.getAttribute('data-stage')<=n); });
    steps.forEach(function(s){ s.classList.toggle('on', +s.getAttribute('data-step')===n); });
    if(sect){ sect.classList.toggle('s5', n>=5); }
    if(cap) cap.textContent='Etapa '+n+' de 5';
    if(bar) bar.style.width=(n*20)+'%';
  }
  if('IntersectionObserver' in window && steps.length){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting) setStage(+e.target.getAttribute('data-step')); });
    },{rootMargin:'-45% 0px -50% 0px'});
    steps.forEach(function(s){io.observe(s);});
    setStage(1);
  } else { stages.forEach(function(g){g.classList.add('on');}); steps.forEach(function(s){s.classList.add('on');}); }
})();
