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

  // ---------- v7 extras (only on pages that load home.css; the calculator keeps its own skin)
  var tb=d.querySelector('.tb'), full=!!d.querySelector('link[href*="home.css"]');
  if(!tb||!full) return;

  // "Plano azul" theme switch, remembered per visitor (the class is set early by an inline script to avoid a flash)
  var KEY='asteria-theme', meta=d.querySelector('meta[name="theme-color"]');
  var tbtn=d.createElement('button'); tbtn.className='tb__theme'; tbtn.type='button';
  tbtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 9.5h17M9.5 3.5v17M13 14l2.5 2.5L20 12"/></svg>';
  function paint(on){
    root.classList.toggle('cyan',on); tbtn.setAttribute('aria-pressed',String(on));
    var label=on?'Volver al plano en papel':'Ver como plano azul'; tbtn.setAttribute('aria-label',label); tbtn.title=label;
    if(meta) meta.setAttribute('content',on?'#E3ECF5':'#ECE9E2');
    d.dispatchEvent(new Event('asteria:theme'));
  }
  paint(root.classList.contains('cyan'));
  tbtn.addEventListener('click',function(){
    var on=!root.classList.contains('cyan');
    root.classList.add('theming'); paint(on); setTimeout(function(){ root.classList.remove('theming'); },520);
    try{ localStorage.setItem(KEY,on?'cyan':'paper'); }catch(e){}
  });
  var menuBtn=tb.querySelector('.tb__menu'); tb.insertBefore(tbtn,menuBtn||null);

  // reading progress: a thin green line under the header
  var prog=d.createElement('i'); prog.className='tb__prog'; prog.setAttribute('aria-hidden','true'); tb.appendChild(prog);
  var pt=false;
  function progress(){ pt=false; var h=d.documentElement.scrollHeight-window.innerHeight; prog.style.transform='scaleX('+(h>0?Math.min(1,window.scrollY/h):0)+')'; }
  window.addEventListener('scroll',function(){ if(!pt){ pt=true; requestAnimationFrame(progress); } },{passive:true});
  window.addEventListener('resize',progress); progress();

  // live Mexico City time in the footer
  var row=d.querySelector('.foot__row');
  if(row&&window.Intl){
    var clk=d.createElement('span'); clk.className='foot__clock';
    var fmt=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hour12:false});
    function tick(){ clk.innerHTML='CDMX <b>'+fmt.format(new Date())+'</b> h'; }
    tick(); setInterval(tick,15000); row.appendChild(clk);
  }

  // drafting readout: cursor position over the hero drawing, in metres from the street line
  (function(){
    var stage=d.querySelector('.hero__draw'), svg=d.querySelector('.elev');
    if(!stage||!svg||window.matchMedia('(pointer:coarse)').matches) return;
    var tag=d.createElement('span'); tag.className='coords'; tag.setAttribute('aria-hidden','true'); stage.appendChild(tag);
    var GROUND=660, PX_PER_M=3.3, pend=null;
    stage.addEventListener('pointermove',function(e){ pend=e; requestAnimationFrame(function(){
      if(!pend) return; var ev=pend; pend=null;
      var m=svg.getScreenCTM(); if(!m) return; var p=svg.createSVGPoint(); p.x=ev.clientX; p.y=ev.clientY; p=p.matrixTransform(m.inverse());
      var r=stage.getBoundingClientRect(), x=ev.clientX-r.left+14, y=ev.clientY-r.top+16;
      if(x>r.width-150) x-=170;
      var hgt=Math.max(0,(GROUND-p.y)/PX_PER_M), east=(p.x-120)/PX_PER_M;
      tag.textContent='E '+east.toFixed(1)+' m · N+ '+hgt.toFixed(1)+' m';
      tag.style.transform='translate('+x+'px,'+y+'px)'; tag.classList.add('on');
    }); });
    stage.addEventListener('pointerleave',function(){ tag.classList.remove('on'); });
  })();
})();
