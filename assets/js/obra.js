/* "La Obra" — runner game in the Asteria drawing-sheet style.
   Mount: <div class="obra" data-obra></div>. Space / ↑ / tap to jump. Score is m² built;
   every 120 m² a new floor rises on the tower in the background. Colors come from CSS tokens,
   so it follows the site theme. No network, no tracking; best score kept in localStorage. */
(function(){
  "use strict";
  var KEY = "asteria-obra-record";
  function css(v, el){ return getComputedStyle(el || document.documentElement).getPropertyValue(v).trim() || "#1E211F"; }
  function store(get, val){ try{ if(get) return +localStorage.getItem(KEY) || 0; localStorage.setItem(KEY, String(val)); }catch(e){ return 0; } }

  function Game(root){
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Juego: un trabajador corre por la obra y salta obstáculos");
    cv.tabIndex = 0;
    root.appendChild(cv);
    var hud = document.createElement("p"); hud.className = "obra__hud"; hud.setAttribute("aria-live", "polite");
    root.appendChild(hud);

    var W = 0, H = 0, DPR = 1, GY = 0;                // canvas size, ground y
    var state = "idle", t = 0, last = 0, raf = 0, visible = true, active = false;
    var speed, dist, score, best = store(true), floors, nextObs, nextBrick, flash = 0;
    var obs = [], bricks = [], puffs = [];
    var p = { x: 70, y: 0, vy: 0, on: true, leg: 0 };
    var C = {};

    function colors(){ C.ink = css("--ink", root); C.ink2 = css("--ink-2", root); C.pencil = css("--pencil", root);
      C.line = css("--line", root); C.paper = css("--paper", root); C.vellum = css("--vellum", root); C.acc = css("--terra", root); C.leaf = css("--leaf", root) || C.acc; }

    function size(){
      var r = root.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(280, Math.floor(r.width)); H = W < 560 ? 200 : 240; GY = H - 34;
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if(state !== "run") draw();
    }

    function reset(){ speed = 5.2; dist = 0; score = 0; floors = 0; nextObs = 60; nextBrick = 120; obs = []; bricks = []; puffs = [];
      p.y = GY; p.vy = 0; p.on = true; }

    function jump(){
      if(state === "idle" || state === "over"){ reset(); state = "run"; last = 0; loop(0); hud.textContent = ""; return; }
      if(p.on){ p.vy = -11.2; p.on = false; puffs.push({ x: p.x - 4, y: GY, r: 2, a: 1 }); }
    }

    // ---------- obstacles ----------
    var TYPES = [
      { k: "cono", w: 18, h: 26 }, { k: "costal", w: 30, h: 20 }, { k: "tramite", w: 22, h: 34 },
      { k: "valla", w: 42, h: 24 }, { k: "dron", w: 30, h: 12, fly: true }
    ];
    function spawn(){
      var pool = score < 150 ? TYPES.slice(0, 2) : score < 400 ? TYPES.slice(0, 4) : TYPES;
      var o = Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
      o.x = W + 20; o.y = o.fly ? GY - (Math.random() < .5 ? 46 : 26) : GY;
      obs.push(o);
      var gap = 46 + Math.random() * 70 - Math.min(18, speed * 1.2);
      nextObs = gap;
    }

    // ---------- loop ----------
    function loop(ts){
      if(state !== "run") return;
      if(!visible){ raf = 0; return; }
      var dt = last ? Math.min(2.2, (ts - last) / 16.67) : 1; last = ts;
      t += dt; speed = Math.min(12.5, speed + .0025 * dt);
      var dx = speed * dt; dist += dx; score += dx * .1; flash = Math.max(0, flash - dt);
      floors = Math.min(34, Math.floor(score / 120));

      // player physics
      p.vy += .62 * dt; p.y += p.vy * dt;
      if(p.y >= GY){ if(!p.on) puffs.push({ x: p.x, y: GY, r: 2, a: 1 }); p.y = GY; p.vy = 0; p.on = true; }
      p.leg += dx * .09;

      nextObs -= dx / 6; if(nextObs <= 0) spawn();
      nextBrick -= dx / 6;
      if(nextBrick <= 0){ bricks.push({ x: W + 10, y: GY - 58 - Math.random() * 30, got: false }); nextBrick = 90 + Math.random() * 120; }

      for(var i = obs.length - 1; i >= 0; i--){ var o = obs[i]; o.x -= dx * (o.fly ? 1.15 : 1); if(o.x < -60) obs.splice(i, 1); }
      for(i = bricks.length - 1; i >= 0; i--){ var b = bricks[i]; b.x -= dx; if(b.x < -20) bricks.splice(i, 1); }
      for(i = puffs.length - 1; i >= 0; i--){ var q = puffs[i]; q.r += .5 * dt; q.a -= .05 * dt; q.x -= dx * .5; if(q.a <= 0) puffs.splice(i, 1); }

      // collisions (player box is a bit forgiving)
      var px0 = p.x - 6, px1 = p.x + 7, py0 = p.y - 30, py1 = p.y;
      for(i = 0; i < obs.length; i++){
        o = obs[i]; var ox0 = o.x + 3, ox1 = o.x + o.w - 3, oy1 = o.y, oy0 = o.y - o.h + 3;
        if(px1 > ox0 && px0 < ox1 && py1 > oy0 && py0 < oy1){ over(); return; }
      }
      for(i = 0; i < bricks.length; i++){
        b = bricks[i]; if(!b.got && px1 > b.x && px0 < b.x + 16 && py0 < b.y + 8 && py1 > b.y){ b.got = true; score += 25; flash = 10; }
      }
      draw(); raf = requestAnimationFrame(loop);
    }

    function over(){
      state = "over"; cancelAnimationFrame(raf); raf = 0;
      var s = Math.floor(score); if(s > best){ best = s; store(false, best); }
      draw();
      hud.textContent = "Obra detenida en " + s + " m². Récord: " + best + " m².";
    }

    // ---------- drawing ----------
    function line(x0, y0, x1, y1){ ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    function draw(){
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // drafting grid
      ctx.strokeStyle = C.line; ctx.globalAlpha = .45; ctx.lineWidth = .5;
      var off = (dist * .25) % 24;
      for(var gx = -off; gx < W; gx += 24) line(gx, 0, gx, GY);
      for(var gy = GY; gy > 0; gy -= 24) line(0, gy, W, gy);
      ctx.globalAlpha = 1;

      // the tower that rises with your m²
      var tx = W - Math.min(170, W * .3), tw = Math.min(110, W * .2), fh = Math.max(4, (GY - 30) / 36);
      ctx.strokeStyle = C.pencil; ctx.lineWidth = .9;
      ctx.strokeRect(tx, GY - floors * fh, tw, floors * fh);
      ctx.lineWidth = .5;
      for(var f = 1; f < floors; f++) line(tx, GY - f * fh, tx + tw, GY - f * fh);
      for(var m = 1; m < 6; m++) line(tx + m * tw / 6, GY, tx + m * tw / 6, GY - floors * fh);
      // crane on top of the tower
      var cy = GY - floors * fh, cx = tx + tw * .7;
      ctx.lineWidth = .8;
      line(cx, cy, cx, cy - 46); line(cx - 70, cy - 42, cx + 26, cy - 42); line(cx, cy - 52, cx - 70, cy - 42); line(cx, cy - 52, cx + 26, cy - 42);
      var hook = cx - 30 - Math.sin(t * .05) * 12; line(hook, cy - 42, hook, cy - 22);
      ctx.fillStyle = C.pencil; ctx.fillRect(hook - 4, cy - 22, 8, 4);
      ctx.font = "11px 'Geist Mono', ui-monospace, monospace"; ctx.fillStyle = C.pencil;
      ctx.fillText("Nivel " + floors, tx, Math.max(12, cy - 60));

      // ground + scrolling hatch
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; line(0, GY, W, GY);
      ctx.lineWidth = .6; ctx.strokeStyle = C.pencil;
      var ho = dist % 14; for(var hx = -ho; hx < W; hx += 14) line(hx, GY + 2, hx - 7, GY + 9);

      // bricks
      for(var i = 0; i < bricks.length; i++){ var b = bricks[i]; if(b.got) continue;
        ctx.strokeStyle = C.acc; ctx.lineWidth = 1.2; ctx.strokeRect(b.x, b.y, 16, 8); line(b.x + 8, b.y, b.x + 8, b.y + 4); line(b.x + 4, b.y + 4, b.x + 4, b.y + 8); line(b.x + 12, b.y + 4, b.x + 12, b.y + 8); line(b.x, b.y + 4, b.x + 16, b.y + 4); }

      // obstacles
      ctx.lineWidth = 1.3;
      for(i = 0; i < obs.length; i++) drawObs(obs[i]);

      // dust puffs
      ctx.strokeStyle = C.pencil; ctx.lineWidth = .7;
      for(i = 0; i < puffs.length; i++){ var q = puffs[i]; ctx.globalAlpha = Math.max(0, q.a); ctx.beginPath(); ctx.arc(q.x, q.y - 2, q.r, 0, 6.3); ctx.stroke(); }
      ctx.globalAlpha = 1;

      drawWorker();

      // HUD
      ctx.font = "12px 'Geist Mono', ui-monospace, monospace"; ctx.textAlign = "right";
      ctx.fillStyle = C.ink2; ctx.fillText("Récord " + pad(best) + " m²", W - 12, 20);
      ctx.fillStyle = flash > 0 ? C.acc : C.ink; ctx.fillText(pad(Math.floor(score || 0)) + " m² construidos", W - 12, 38);
      ctx.textAlign = "left";
      if(state === "idle") banner("La Obra", "Toca o presiona espacio para empezar");
      if(state === "over") banner("Obra detenida", "Toca o presiona espacio para seguir construyendo");
    }
    function pad(n){ n = String(n); while(n.length < 5) n = "0" + n; return n; }
    function banner(a, b){
      var bw = Math.min(340, W - 24), x0 = W / 2 - bw / 2;
      if(W < 420) b = state === "idle" ? "Toca para empezar" : "Toca para seguir construyendo";
      ctx.fillStyle = C.vellum; ctx.globalAlpha = .92; ctx.fillRect(x0, H / 2 - 44, bw, 66); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x0, H / 2 - 44, bw, 66);
      ctx.textAlign = "center"; ctx.fillStyle = C.ink; ctx.font = "700 20px Archivo, 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(a.toUpperCase(), W / 2, H / 2 - 16);
      ctx.font = "12px 'Geist Mono', ui-monospace, monospace"; ctx.fillStyle = C.ink2; ctx.fillText(b, W / 2, H / 2 + 6);
      ctx.textAlign = "left";
    }
    function drawObs(o){
      var x = o.x, y = o.y; ctx.strokeStyle = C.ink; ctx.fillStyle = C.vellum;
      if(o.k === "cono"){
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y - 26); ctx.lineTo(x + 18, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.acc; ctx.lineWidth = 2.2; line(x + 4.5, y - 9, x + 13.5, y - 9); line(x + 6.6, y - 16, x + 11.4, y - 16); ctx.lineWidth = 1.3;
        ctx.strokeStyle = C.ink; line(x - 3, y, x + 21, y);
      } else if(o.k === "costal"){
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.quadraticCurveTo(x - 2, y - 18, x + 6, y - 20); ctx.lineTo(x + 24, y - 20); ctx.quadraticCurveTo(x + 32, y - 18, x + 28, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font = "7px 'Geist Mono', monospace"; ctx.fillStyle = C.ink2; ctx.fillText("CEMENTO", x + 2, y - 8);
      } else if(o.k === "tramite"){
        for(var k = 0; k < 5; k++){ ctx.fillStyle = C.vellum; ctx.fillRect(x + (k % 2), y - 7 * (k + 1), 22, 7); ctx.strokeRect(x + (k % 2), y - 7 * (k + 1), 22, 7); }
        ctx.strokeStyle = C.acc; ctx.beginPath(); ctx.arc(x + 12, y - 28, 6, 0, 6.3); ctx.stroke();
        ctx.font = "6px 'Geist Mono', monospace"; ctx.fillStyle = C.acc; ctx.fillText("SELLO", x + 3.5, y - 26);
      } else if(o.k === "valla"){
        line(x, y, x + 8, y - 24); line(x + 16, y, x + 8, y - 24); line(x + 26, y, x + 34, y - 24); line(x + 42, y, x + 34, y - 24);
        ctx.fillRect(x + 4, y - 22, 34, 7); ctx.strokeRect(x + 4, y - 22, 34, 7);
        ctx.strokeStyle = C.acc; ctx.lineWidth = 2; for(var s = 0; s < 4; s++) line(x + 8 + s * 8, y - 16, x + 12 + s * 8, y - 21); ctx.lineWidth = 1.3;
      } else if(o.k === "dron"){
        var bob = Math.sin((t + x) * .15) * 2; y += bob;
        ctx.fillRect(x + 9, y - 8, 12, 6); ctx.strokeRect(x + 9, y - 8, 12, 6);
        line(x + 2, y - 10, x + 28, y - 10); line(x + 9, y - 8, x + 4, y - 10); line(x + 21, y - 8, x + 26, y - 10);
        var sp = Math.abs(Math.sin(t * .9)) * 6; line(x + 4 - sp, y - 12, x + 4 + sp, y - 12); line(x + 26 - sp, y - 12, x + 26 + sp, y - 12);
        ctx.fillStyle = C.acc; ctx.fillRect(x + 13, y - 2, 4, 4);
      }
    }
    function drawWorker(){
      var x = p.x, y = p.y, run = state === "run" && p.on, a = run ? Math.sin(p.leg) * .65 : (p.on ? 0 : .5);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      var hip = y - 14, sh = y - 26;
      line(x, hip, x + Math.sin(a) * 9, y - Math.cos(a) * 1 - (1 - Math.cos(a)) * 2);
      line(x, hip, x - Math.sin(a) * 9, y - (p.on ? 0 : 6));
      line(x, hip, x + 1, sh);
      line(x + 1, sh + 3, x + 1 + Math.sin(-a) * 8, sh + 11);
      line(x + 1, sh + 3, x + 1 + Math.sin(a) * 8, sh + 11);
      // vest band
      ctx.strokeStyle = C.acc; ctx.lineWidth = 2.6; line(x - 1, sh + 6, x + 3, sh + 6); ctx.lineWidth = 2;
      // head + hard hat
      ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(x + 1.5, sh - 5, 4, 0, 6.3); ctx.stroke();
      ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(x + 1.5, sh - 6.5, 5, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 4.5, sh - 7, 13, 2);
    }

    // ---------- input ----------
    function onKey(e){
      if(!active) return;
      if(e.code === "Space" || e.code === "ArrowUp" || e.key === " "){ e.preventDefault(); jump(); }
    }
    cv.addEventListener("pointerdown", function(e){ e.preventDefault(); active = true; cv.focus({ preventScroll: true }); jump(); });
    cv.addEventListener("focus", function(){ active = true; });
    cv.addEventListener("blur", function(){ active = false; });
    window.addEventListener("keydown", onKey);
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){ visible = es[0].isIntersecting;
        if(visible && state === "run" && !raf){ last = 0; raf = requestAnimationFrame(loop); } }).observe(root);
    }
    document.addEventListener("visibilitychange", function(){ if(document.hidden && state === "run"){ cancelAnimationFrame(raf); raf = 0; } else if(!document.hidden && state === "run" && !raf){ last = 0; raf = requestAnimationFrame(loop); } });
    window.addEventListener("resize", size);
    document.addEventListener("asteria:theme", function(){ colors(); if(state !== "run") draw(); });

    colors(); reset(); size();
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(state !== "run") draw(); });
  }

  function init(){ [].forEach.call(document.querySelectorAll("[data-obra]"), function(el){ if(!el.__obra){ el.__obra = 1; Game(el); } }); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
