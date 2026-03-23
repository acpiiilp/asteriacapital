(function(){
  // Mobile nav
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel  = document.querySelector('[data-nav-panel]');
  if(toggle && panel){
    toggle.addEventListener('click',()=>{ panel.classList.toggle('open'); toggle.setAttribute('aria-expanded', panel.classList.contains('open')); });
    panel.querySelectorAll('a').forEach(a => a.addEventListener('click',()=>{ panel.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); }));
  }

  // Footer year
  const yr = document.querySelector('[data-year]');
  if(yr) yr.textContent = new Date().getFullYear();

  // Reveal on scroll
  const els = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && els.length){
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }});
    },{threshold:0.06, rootMargin:'0px 0px -30px 0px'});
    els.forEach(el=>io.observe(el));
  } else {
    els.forEach(el=>el.classList.add('visible'));
  }

  // Animate bars on scroll
  const bars = document.querySelectorAll('.bar-col[data-h]');
  if(bars.length){
    bars.forEach(b=>{ b.style.height='0'; b.style.transition='height 0.9s cubic-bezier(.4,0,.2,1)'; });
    const barIO = new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          setTimeout(()=>{ e.target.style.height = e.target.dataset.h; }, 150);
          barIO.unobserve(e.target);
        }
      });
    },{threshold:0.1});
    bars.forEach(b=>barIO.observe(b));
  }

  // Active nav link
  const path = window.location.pathname.split('/').pop() || 'index.htm';
  document.querySelectorAll('.nav-links a, .nav__panel a').forEach(a=>{
    const href = (a.getAttribute('href')||'').split('#')[0];
    if(href && href !== '' && (href === path || (href === 'index.htm' && (path === '' || path === 'asteriacapital')))) {
      a.classList.add('active');
    }
  });
})();