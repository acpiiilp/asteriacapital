/* "La Obra" — Tower Bloxx-style stacking game in the Asteria drawing-sheet style.
   Mount: <div class="obra" data-obra></div>. A crane swings a floor on a rope; space / ↑ / tap drops it.
   Each floor's misalignment shifts the tower's centre of mass and makes it sway harder as it grows;
   perfect drops steady it. Norma 7: every 5 levels the floor plate steps in (setback). The lot keeps
   20% área libre. If the tower sways too much, Protección Civil steps in: the first time the one-off
   restructuring budget demolishes 30% of the levels; the second time the site is shut down.
   Some games (random) bring a neighbours' strike: pay it off with the same one-off budget, or wait it
   out (work stops and the tower ends up swaying more).
   Colors come from CSS tokens (follows the site theme). No network; best score kept in localStorage. */
(function(){
  "use strict";
  var KEY = "asteria-torre-record", M2 = 120;
  function css(v, el){ return getComputedStyle(el || document.documentElement).getPropertyValue(v).trim() || "#1E211F"; }
  function store(get, val){ try{ if(get) return +localStorage.getItem(KEY) || 0; localStorage.setItem(KEY, String(val)); }catch(e){ return 0; } }

  function Game(root){
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Juego: una grúa balancea pisos y tú los sueltas para armar la torre más alta");
    cv.tabIndex = 0; root.appendChild(cv);
    var hud = document.createElement("p"); hud.className = "obra__hud"; hud.setAttribute("aria-live", "polite"); root.appendChild(hud);

    var W = 0, H = 0, DPR = 1, GY = 0, BW = 80, BH = 26, ROPE = 90;
    var state = "idle", t = 0, last = 0, raf = 0, visible = true, active = false;
    var best = store(true), C = {};
    var tower, hang, fall, debris, lives, cam, camT, phase, swing, com, combo, msg, msgT, shake, collapse, budget, pcT, m2, strikeAt, strikeT, bonus, choice;

    function colors(){ C.ink = css("--ink", root); C.ink2 = css("--ink-2", root); C.pencil = css("--pencil", root);
      C.line = css("--line", root); C.paper = css("--paper", root); C.vellum = css("--vellum", root); C.acc = css("--terra", root); }

    function size(){
      var r = root.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(280, Math.floor(r.width)); H = W < 560 ? 380 : 400; GY = H - 30;
      BW = Math.round(Math.min(96, Math.max(70, W * .2))); BH = W < 560 ? 24 : 26; ROPE = Math.round(H * .17);
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if(!raf) draw();
    }

    function reset(){ tower = []; hang = true; fall = null; debris = []; lives = 3; cam = 0; camT = 0; phase = 0; swing = 0;
      com = 0; combo = 0; msg = ""; msgT = 0; shake = 0; collapse = null; budget = 1; pcT = 0; m2 = 0; strikeT = 0; bonus = 0; choice = null;
      strikeAt = Math.random() < .55 ? 6 + Math.floor(Math.random() * 12) : -1; }

    // ---------- geometry
    function amp(){ var n = tower.length; return n < 2 ? 0 : Math.min(44, (bonus + n * .6 + Math.abs(com) * .2 + (n > 8 ? (n - 8) * .4 : 0)) * Math.min(1, n / 6)); }
    function swayAt(i){ var n = tower.length; if(n < 2) return 0; var k = i / (n - 1); return Math.sin(swing) * amp() * k * k; }
    // Norma 7: the plate steps in 10% every 5 levels (never below 50% of the base)
    function wOf(i){ return Math.round(BW * Math.max(.5, 1 - Math.floor(i / 5) * .1)); }
    function blockX(i){ return W / 2 + tower[i].x + swayAt(i); }            // screen x of floor i (centre)
    function blockY(i){ return GY - (i + 1) * BH + cam; }                   // screen y of floor i (top)
    function hook(){ var th = Math.sin(phase) * (.62 + Math.min(.25, tower.length * .012));
      return { x: W / 2 + Math.sin(th) * ROPE * 1.9, y: 34 + Math.cos(th) * ROPE, th: th }; }

    function drop(){
      if(state === "idle" || state === "over"){ reset(); state = "run"; hud.textContent = ""; start(); return; }
      if(state === "strike"){ return; }
      if(state !== "run" || !hang) return;
      var h = hook(); fall = { x: h.x, y: h.y, vy: 0, vx: Math.cos(phase) * .9 }; hang = false;
    }

    function land(){
      var n = tower.length, topX = n ? blockX(n - 1) : W / 2, wNew = wOf(n), limit = n ? (wNew + wOf(n - 1)) / 2 * .82 : BW * .45;
      var dx = fall.x - topX;
      if(Math.abs(dx) > limit){                                   // missed: the floor tumbles off
        debris.push({ x: fall.x, y: fall.y, vy: fall.vy * .4, vx: dx > 0 ? 2.2 : -2.2, r: 0, vr: dx > 0 ? .06 : -.06, w: wNew });
        lives--; combo = 0; flash(lives > 0 ? "Se cayó el piso" : "", 50); shake = 8;
        fall = null;
        if(lives <= 0){ over("Se acabaron los pisos"); return; }
        hang = true; return;
      }
      var perfect = Math.abs(dx) < Math.max(4, wNew * .06);
      if(perfect){ dx = 0; combo++; com *= .55; flash(combo > 1 ? "¡Perfecto! ×" + combo : "¡Perfecto!", 55); }
      else { combo = 0; }
      var baseRel = n ? tower[n - 1].x : 0;
      tower.push({ x: baseRel + dx, p: perfect });
      settle();
      shake = perfect ? 2 : 4; fall = null; hang = true;
      // Protección Civil: a tower swaying too much gets inspected
      if(tower.length >= 3 && (Math.abs(com) > BW * .5 || amp() > 30)){ civil(); return; }
      if(tower.length === strikeAt){ strike(); return; }
      if(tower.length % 5 === 0 && !perfect) flash("Norma 7: remetimiento en N" + tower.length, 60);
    }

    function settle(){
      var s = 0; m2 = 0;
      for(var i = 0; i < tower.length; i++){ s += tower[i].x; m2 += M2 * wOf(i) / BW; }
      com = tower.length ? s / tower.length : 0;
      camT = Math.max(0, (tower.length + 1) * BH - (GY - 34 - ROPE - 70));
    }
    function civil(){
      if(budget <= 0){ over("Protección Civil clausuró la obra"); collapse = { t: 0, dir: com > 0 ? 1 : -1 }; return; }
      budget = 0; state = "pc"; pcT = 170; hang = false; shake = 10;
      var cut = Math.max(1, Math.ceil(tower.length * .3));
      for(var k = 0; k < cut; k++){ var i = tower.length - 1, fl = tower.pop();
        debris.push({ x: W / 2 + fl.x + swayAt(i), y: blockY(i), vy: -1 - Math.random() * 2, vx: (Math.random() - .5) * 5, r: 0, vr: (Math.random() - .5) * .12, w: wOf(i) }); }
      // the restructuring re-plumbs what is left: offsets halved, sway reset
      for(var j = 0; j < tower.length; j++) tower[j].x *= .5;
      swing = 0; settle(); pcCut = cut;
    }
    var pcCut = 0;
    // neighbours' strike: choose to pay (uses the budget) or wait it out
    function strike(){ strikeAt = -1; state = "strike"; hang = false; strikeT = 0; choice = budget ? "ask" : "wait"; if(choice === "wait") strikeT = 480; }
    function decide(pay){
      if(state !== "strike" || choice !== "ask") return;
      if(pay){ budget = 0; state = "run"; hang = true; choice = null; flash("Huelga resuelta con tu presupuesto", 70); }
      else { choice = "wait"; strikeT = 480; }
    }
    function pl(n){ return n + (n === 1 ? " piso" : " pisos"); }
    function flash(s, d){ msg = s; msgT = d; }
    function over(why){
      state = "over"; var f = tower.length; if(f > best){ best = f; store(false, best); }
      flash(why, 9999);
      hud.textContent = why + ". " + pl(f) + ", " + Math.round(m2) + " m². Récord: " + pl(best) + ".";
    }

    // ---------- loop
    function start(){ if(!raf){ last = 0; raf = requestAnimationFrame(loop); } }
    function loop(ts){
      raf = 0;
      if(!visible || document.hidden) return;
      var dt = last ? Math.min(2.2, (ts - last) / 16.67) : 1; last = ts; t += dt;
      var running = state === "run" || state === "pc" || state === "strike";
      if(state === "strike" && choice === "wait"){ strikeT -= dt; bonus = Math.min(10, bonus + .02 * dt);
        if(strikeT <= 0){ state = "run"; hang = true; choice = null; flash("Fin de la huelga: más balanceo", 80); } }
      if(state === "pc"){ pcT -= dt; if(pcT <= 0){ state = "run"; hang = true; flash("Torre reestructurada", 60); } }
      if(running || collapse){
        phase += (.034 + Math.min(.03, tower.length * .0011)) * dt;
        swing += (.022 + Math.min(.02, tower.length * .0007)) * dt;
      }
      if(fall){ fall.vy += .55 * dt; fall.y += fall.vy * dt; fall.x += fall.vx * dt;
        var surf = tower.length ? blockY(tower.length - 1) : GY;
        if(fall.y + BH >= surf){ fall.y = surf - BH; land(); } }
      for(var i = debris.length - 1; i >= 0; i--){ var d = debris[i]; d.vy += .5 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.r += d.vr * dt; if(d.y > H + 80) debris.splice(i, 1); }
      if(collapse){ collapse.t += dt; }
      cam += (camT - cam) * Math.min(1, .08 * dt);
      shake = Math.max(0, shake - .5 * dt); if(msgT < 9999) msgT = Math.max(0, msgT - dt);
      draw();
      if(running || debris.length || (collapse && collapse.t < 120) || Math.abs(camT - cam) > .5 || fall) raf = requestAnimationFrame(loop);
    }

    // ---------- drawing
    function line(x0, y0, x1, y1){ ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    function floor(x, y, rot, idx, w){
      ctx.save(); ctx.translate(x, y + BH / 2); if(rot) ctx.rotate(rot);
      w = w || wOf(idx); var h = BH, x0 = -w / 2, y0 = -h / 2;
      ctx.fillStyle = C.vellum; ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y0, w, h);
      ctx.lineWidth = .7; ctx.strokeStyle = C.pencil;
      var nw = Math.max(2, Math.round(w / 22)), gw = w / nw;
      for(var k = 0; k < nw; k++) ctx.strokeRect(x0 + k * gw + 4, y0 + 5, gw - 8, h - 11);
      line(x0, y0 + h - 3, x0 + w, y0 + h - 3);
      if(idx % 5 === 4){ ctx.strokeStyle = C.acc; ctx.lineWidth = 2; line(x0 + 1, y0 + 1.5, x0 + w - 1, y0 + 1.5); }
      ctx.restore();
    }
    function draw(){
      colors.done || (colors(), colors.done = 1);
      ctx.clearRect(0, 0, W, H); ctx.lineCap = "round"; ctx.lineJoin = "round";
      var sx = shake ? (Math.random() - .5) * shake : 0;
      ctx.save(); ctx.translate(sx, 0);

      // drafting grid moves with the camera
      ctx.strokeStyle = C.line; ctx.globalAlpha = .45; ctx.lineWidth = .5;
      for(var gx = (W / 2) % 24; gx < W; gx += 24) line(gx, 0, gx, H);
      for(var gy = (GY + cam) % 24; gy < H; gy += 24) line(0, gy, W, gy);
      ctx.globalAlpha = 1;

      // height scale on the left
      ctx.font = "10px 'Geist Mono', ui-monospace, monospace"; ctx.fillStyle = C.pencil; ctx.strokeStyle = C.pencil; ctx.lineWidth = .7;
      line(18, 0, 18, GY + cam);
      for(var lv = 0; lv <= tower.length + 12; lv += 5){ var ly = GY - lv * BH + cam; if(ly < 64 || ly > H) continue;
        line(14, ly, 22, ly); ctx.fillText("N" + lv, 26, ly + 3); }

      // ground + foundation
      var g = GY + cam;
      if(g < H + 20){
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; line(0, g, W, g);
        ctx.lineWidth = .6; ctx.strokeStyle = C.pencil; for(var hx = 0; hx < W; hx += 12) line(hx, g + 2, hx - 7, g + 9);
        // lot: building footprint 80%, área libre 20% (garden on the right)
        var lx0 = W / 2 - BW / 2, lx1 = W / 2 + BW / 2, lx2 = lx1 + BW * .25;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(lx0, g - 4, BW, 4);
        ctx.setLineDash([4, 3]); ctx.strokeStyle = C.pencil; line(lx0, g + 1, lx0, g - 40); line(lx2, g + 1, lx2, g - 40); ctx.setLineDash([]);
        ctx.strokeStyle = C.acc; ctx.lineWidth = .7;
        for(var ax = lx1 + 3; ax < lx2; ax += 5) line(ax, g - 1, ax + 4, g - 5);
        var tx = (lx1 + lx2) / 2; ctx.lineWidth = 1; line(tx, g - 1, tx, g - 16);
        ctx.beginPath(); ctx.arc(tx, g - 21, 7, 0, 6.3); ctx.stroke();
        ctx.fillStyle = C.ink2; ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
        ctx.textAlign = "center"; ctx.fillText("Desplante 80%", W / 2, g + 21);
        ctx.fillStyle = C.acc; ctx.textAlign = "left"; ctx.fillText("Área libre 20%", lx1 + 4, g + 21 + (W < 420 ? 11 : 0));
        ctx.textAlign = "left";
      }

      // the tower (sways; collapses by rotating about its base)
      var rot = collapse ? collapse.dir * Math.min(1.2, collapse.t * collapse.t * .00012) : 0;
      ctx.save();
      if(rot){ ctx.translate(W / 2, g); ctx.rotate(rot); ctx.translate(-W / 2, -g); }
      for(var i = 0; i < tower.length; i++){ var y = blockY(i); if(y > H + BH || y < -BH * 2) continue; floor(blockX(i), y, tower.length > 1 ? Math.sin(swing) * amp() * .003 * (i / (tower.length - 1)) : 0, i); }
      ctx.restore();

      // crane jib, trolley, rope, hanging floor
      var hk = hook();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; line(0, 18, W, 18);
      ctx.lineWidth = .6; ctx.strokeStyle = C.pencil; for(var jx = 0; jx < W; jx += 16){ line(jx, 18, jx + 8, 10); line(jx + 8, 10, jx + 16, 18); } line(0, 10, W, 10);
      ctx.fillStyle = C.ink; ctx.fillRect(W / 2 - 9, 15, 18, 8);
      if(state === "run" && hang){
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1; line(W / 2, 23, hk.x, hk.y);
        floor(hk.x, hk.y, hk.th * .35, tower.length);
      } else if(state !== "run" || !hang){ ctx.strokeStyle = C.ink; ctx.lineWidth = 1; line(W / 2, 23, W / 2, 34); }
      if(fall) floor(fall.x, fall.y, 0, tower.length);
      for(i = 0; i < debris.length; i++) floor(debris[i].x, debris[i].y, debris[i].r, 1, debris[i].w);
      ctx.restore();

      // HUD: two compact lines under the crane jib
      var hy = 38, hx = 40, F = W < 420 ? 11 : 12;
      ctx.font = F + "px 'Geist Mono', ui-monospace, monospace";
      ctx.textAlign = "left"; ctx.fillStyle = C.ink;
      ctx.fillText(pl(tower.length) + " · " + Math.round(m2 || 0).toLocaleString("es-MX") + " m²", hx, hy);
      if(state !== "idle"){ ctx.fillStyle = budget ? C.ink2 : C.acc; ctx.fillText(budget ? "Presupuesto: 1 uso" : "Presupuesto: usado", hx, hy + F + 5); }
      ctx.textAlign = "right";
      var hearts = ""; for(i = 0; i < 3; i++) hearts += i < (lives === undefined ? 3 : lives) ? "■" : "□";
      ctx.fillStyle = C.ink2; ctx.fillText("Récord " + best + "  ", W - 12 - ctx.measureText(hearts).width, hy);
      ctx.fillStyle = C.acc; ctx.fillText(hearts, W - 12, hy);
      if(tower.length > 1 && state === "run"){ var a = amp(); ctx.fillStyle = a > 24 ? C.acc : C.pencil; ctx.fillText("Balanceo " + (a < 8 ? "bajo" : a < 22 ? "medio" : "alto"), W - 12, hy + F + 5); }
      ctx.textAlign = "left";
      if(msgT && msg && state === "run"){ ctx.textAlign = "center"; ctx.font = "700 16px Archivo, 'Helvetica Neue', Arial, sans-serif";
        ctx.fillStyle = C.acc; ctx.globalAlpha = Math.min(1, msgT / 20); ctx.fillText(msg, W / 2, H * .5); ctx.globalAlpha = 1; ctx.textAlign = "left"; }
      if(state === "strike") strikeBanner();
      if(state === "pc") banner("Protección Civil", "Se tambalea de más: −" + pcCut + (pcCut === 1 ? " nivel" : " niveles"));
      if(state === "idle") banner("La Obra", "Toca o presiona espacio para soltar cada piso");
      if(state === "over") banner(msg || "Obra detenida", pl(tower.length) + " · toca para volver a empezar");
    }
    function strikeBanner(){
      var bw = Math.min(380, W - 24), x0 = W / 2 - bw / 2, y0 = H / 2 - 62, bh = choice === "ask" ? 118 : 74;
      ctx.fillStyle = C.vellum; ctx.globalAlpha = .96; ctx.fillRect(x0, y0, bw, bh); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.acc; ctx.lineWidth = 1.4; ctx.strokeRect(x0, y0, bw, bh);
      ctx.textAlign = "center"; ctx.fillStyle = C.ink; ctx.font = "700 18px Archivo, 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText("HUELGA DE VECINOS", W / 2, y0 + 28);
      ctx.font = "12px 'Geist Mono', ui-monospace, monospace"; ctx.fillStyle = C.ink2;
      if(choice === "ask"){
        ctx.fillText("La obra está parada. ¿Qué haces?", W / 2, y0 + 50);
        var bx = (bw - 30) / 2;
        ctx.fillStyle = C.ink; ctx.fillRect(x0 + 10, y0 + 64, bx, 42);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x0 + 20 + bx, y0 + 64, bx, 42);
        ctx.fillStyle = C.vellum; ctx.fillText("1 · Pagar", x0 + 10 + bx / 2, y0 + 82); ctx.fillText("usa el presupuesto", x0 + 10 + bx / 2, y0 + 98);
        ctx.fillStyle = C.ink; ctx.fillText("2 · Esperar", x0 + 20 + bx * 1.5, y0 + 82); ctx.fillStyle = C.ink2; ctx.fillText("8 s, más balanceo", x0 + 20 + bx * 1.5, y0 + 98);
      } else {
        ctx.fillText((budget ? "" : "Sin presupuesto: ") + "obra parada " + Math.ceil(strikeT / 60) + " s", W / 2, y0 + 52);
      }
      ctx.textAlign = "left";
    }
    function fit(txt, font, px, max, y){ do { ctx.font = font.replace("{}", px); px -= .5; } while(ctx.measureText(txt).width > max && px > 8); ctx.fillText(txt, W / 2, y); }
    function banner(a, b){
      var bw = Math.min(360, W - 24), x0 = W / 2 - bw / 2, y0 = H / 2 - 38;
      if(W < 420 && state === "idle") b = "Toca para soltar cada piso";
      ctx.fillStyle = C.vellum; ctx.globalAlpha = .94; ctx.fillRect(x0, y0, bw, 66); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, bw, 66);
      ctx.textAlign = "center"; ctx.fillStyle = C.ink;
      fit(a.toUpperCase(), "700 {}px Archivo, 'Helvetica Neue', Arial, sans-serif", 18, bw - 24, y0 + 28);
      ctx.fillStyle = C.ink2; fit(b, "{}px 'Geist Mono', ui-monospace, monospace", 12, bw - 16, y0 + 50);
      ctx.textAlign = "left";
    }

    // ---------- input
    window.addEventListener("keydown", function(e){
      if(!active) return;
      if(state === "strike" && choice === "ask"){ if(e.key === "1"){ e.preventDefault(); decide(true); } else if(e.key === "2"){ e.preventDefault(); decide(false); } return; }
      if(e.code === "Space" || e.code === "ArrowUp" || e.key === " " || e.code === "Enter"){ e.preventDefault(); if(!e.repeat) drop(); }
    });
    cv.addEventListener("pointerdown", function(e){ e.preventDefault(); active = true; cv.focus({ preventScroll: true });
      if(state === "strike" && choice === "ask"){
        var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, y0 = H / 2 - 62;
        if(y > y0 + 60 && y < y0 + 112) decide(x < W / 2);
        return;
      }
      drop(); });
    cv.addEventListener("focus", function(){ active = true; });
    cv.addEventListener("blur", function(){ active = false; });
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){ visible = es[0].isIntersecting; if(visible && state === "run") start(); }).observe(root);
    }
    document.addEventListener("visibilitychange", function(){ if(!document.hidden && state === "run") start(); });
    window.addEventListener("resize", size);
    document.addEventListener("asteria:theme", function(){ colors(); if(!raf) draw(); });

    colors(); colors.done = 1; reset(); size();
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(!raf) draw(); });
  }

  function init(){ [].forEach.call(document.querySelectorAll("[data-obra]"), function(el){ if(!el.__obra){ el.__obra = 1; Game(el); } }); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
