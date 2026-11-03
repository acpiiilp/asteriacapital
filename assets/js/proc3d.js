/* Proceso en 3D — escena de obra que avanza con el scroll, en el mismo estilo de plano de la portada.
   Etapas: 1 terreno · 2 permisos (envolvente de zonificación H 6/20) · 3 diseño (plantas) · 4 construcción (losas + grúa)
   · 5 venta y entrega (fachada, árboles, luces). El avance es continuo: cada etapa se arma mientras bajas.
   Colores: tokens CSS de la figura (--ink, --vellum, --terra, --pencil, --line); sigue el tema "plano azul".
   Si no hay WebGL o falla la carga, se queda el dibujo SVG original. Three.js se carga solo al acercarse a la sección. */
(function(){
  "use strict";
  var fig = document.querySelector(".proc__fig"), sect = fig && fig.querySelector(".sect");
  if(!fig || !sect || !window.requestAnimationFrame) return;
  var steps = [].slice.call(document.querySelectorAll(".step"));
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  try{ var t = document.createElement("canvas"); if(!(t.getContext("webgl") || t.getContext("experimental-webgl"))) return; }catch(e){ return; }

  function load(){
    if(window.THREE) return start();
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = start; s.onerror = function(){}; document.head.appendChild(s);
  }
  if("IntersectionObserver" in window){
    var io = new IntersectionObserver(function(es){ if(es.some(function(e){ return e.isIntersecting; })){ io.disconnect(); load(); } }, { rootMargin: "600px 0px" });
    io.observe(fig);
  } else load();

  function start(){
    var T = window.THREE; if(!T) return;
    var wrap = document.createElement("div"); wrap.className = "p3d";
    var tag = document.createElement("div"); tag.className = "p3d__tag"; wrap.appendChild(tag);
    var renderer;
    try{ renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }catch(e){ return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.insertBefore(renderer.domElement, tag);
    sect.parentNode.insertBefore(wrap, sect);
    fig.classList.add("is3d");

    var scene = new T.Scene();
    var cam = new T.PerspectiveCamera(30, 600 / 540, 1, 2000);
    var C = {};
    function css(v){ return getComputedStyle(fig).getPropertyValue(v).trim() || "#222"; }
    var mats = { line: [], ghost: [], acc: [], fill: [], glass: [], warm: [] };
    function L(kind, o){ var m = new T.LineBasicMaterial({ transparent: true, opacity: o == null ? 1 : o, depthWrite: false }); mats[kind].push(m); return m; }
    function F(kind, o){ var m = new T.MeshBasicMaterial({ transparent: true, opacity: o == null ? 1 : o, side: T.DoubleSide, depthWrite: kind !== "glass" && kind !== "warm",
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); mats[kind].push(m); return m; }
    function paint(){
      C.ink = new T.Color(css("--ink")); C.pencil = new T.Color(css("--pencil")); C.terra = new T.Color(css("--terra"));
      C.vellum = new T.Color(css("--vellum")); C.line = new T.Color(css("--line"));
      mats.line.forEach(function(m){ m.color.copy(C.ink); }); mats.ghost.forEach(function(m){ m.color.copy(C.pencil); });
      mats.acc.forEach(function(m){ m.color.copy(C.terra); }); mats.fill.forEach(function(m){ m.color.copy(C.vellum); });
      mats.glass.forEach(function(m){ m.color.copy(C.line); }); mats.warm.forEach(function(m){ m.color.copy(C.terra); });
      need = true;
    }

    // ---------- helpers
    function edges(geo, mat){ return new T.LineSegments(new T.EdgesGeometry(geo), mat); }
    function seg(pts, mat){ var g = new T.BufferGeometry().setFromPoints(pts.map(function(p){ return new T.Vector3(p[0], p[1], p[2]); })); return new T.LineSegments(g, mat); }
    function box(w, h, d, x, y, z, fillMat, lineMat){
      var g = new T.BoxGeometry(w, h, d), grp = new T.Group();
      if(fillMat) grp.add(new T.Mesh(g, fillMat));
      if(lineMat) grp.add(edges(g, lineMat));
      grp.position.set(x, y + h / 2, z); return grp;
    }
    var ease = function(x){ x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

    // site: lot 26 x 32 m; building footprint 22 x 24 (Norma 4: área libre al fondo); 6 levels x 3 m (H 6/20)
    var LW = 26, LD = 32, BW = 22, BD = 24, FH = 3, NF = 6, BZ = -3;   // BZ: building shifted to the front, garden at the back
    var root = new T.Group(); scene.add(root);

    // stage 1 · terreno
    var s1 = new T.Group(); root.add(s1);
    var grid = new T.GridHelper(140, 35); grid.material = L("ghost", .35); s1.add(grid);
    var lot = seg([[-LW/2,0,-LD/2],[LW/2,0,-LD/2],[LW/2,0,-LD/2],[LW/2,0,LD/2],[LW/2,0,LD/2],[-LW/2,0,LD/2],[-LW/2,0,LD/2],[-LW/2,0,-LD/2]], L("line"));
    lot.position.y = .02; s1.add(lot);
    var stakes = new T.Group(); s1.add(stakes);
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(c){ var st = box(.35, 1.6, .35, c[0] * LW / 2, 0, c[1] * LD / 2, F("acc"), null); stakes.add(st); });
    var dimL = seg([[-LW/2,0,LD/2+3],[LW/2,0,LD/2+3],[-LW/2,0,LD/2+2.2],[-LW/2,0,LD/2+3.8],[LW/2,0,LD/2+2.2],[LW/2,0,LD/2+3.8]], L("line", .8)); s1.add(dimL);
    var neigh = new T.Group(); s1.add(neigh);                          // neighbours, ghosted
    [[-LW/2-11, 9, 14, 26, -4],[LW/2+10, 7.5, 12, 26, -4],[-LW/2-12, 12, 14, 18, -LD-4],[LW/2+11, 15, 14, 24, -LD-2],[0, 6, 18, 14, -LD-6]].forEach(function(n){
      neigh.add(box(n[2], n[1], n[3], n[0], 0, n[4], F("fill", .55), L("ghost", .9))); });
    // street in front
    var street = seg([[-70,0,LD/2+8],[70,0,LD/2+8],[-70,0,LD/2+20],[70,0,LD/2+20]], L("ghost", .9)); s1.add(street);
    var curb = []; for(var i = -66; i < 70; i += 6) curb.push([i,0,LD/2+14],[i+3,0,LD/2+14]);
    s1.add(seg(curb, L("ghost", .7)));

    // stage 2 · envolvente de zonificación + área libre
    var s2 = new T.Group(); root.add(s2);
    var env = box(BW, NF * FH, BD, 0, 0, BZ, F("acc", .08), L("acc", .9)); s2.add(env);
    var libre = new T.Mesh(new T.PlaneGeometry(LW - 1, LD / 2 + BZ - BD / 2 + LD / 2 - 1), F("acc", .16));
    libre.rotation.x = -Math.PI / 2; libre.position.set(0, .03, (BZ + BD / 2 + LD / 2) / 2); s2.add(libre);
    var hatch = []; for(var hx = -LW/2 + 1; hx < LW/2; hx += 1.6) hatch.push([hx, .04, BZ + BD/2 + .5], [hx + 2.2, .04, LD/2 - .5]);
    var hatchL = seg(hatch, L("acc", .45)); s2.add(hatchL);
    var hdim = seg([[BW/2+3,0,BZ],[BW/2+3,NF*FH,BZ],[BW/2+2.3,0,BZ],[BW/2+3.7,0,BZ],[BW/2+2.3,NF*FH,BZ],[BW/2+3.7,NF*FH,BZ]], L("acc", .9)); s2.add(hdim);

    // stage 3 · diseño: plantas, ejes y muros interiores (line work)
    var s3 = new T.Group(); root.add(s3);
    var plates = [];
    for(var f = 0; f < NF; f++){
      var pg = new T.Group(); pg.position.y = f * FH + .02;
      var o = [[-BW/2,0,BZ-BD/2],[BW/2,0,BZ-BD/2],[BW/2,0,BZ-BD/2],[BW/2,0,BZ+BD/2],[BW/2,0,BZ+BD/2],[-BW/2,0,BZ+BD/2],[-BW/2,0,BZ+BD/2],[-BW/2,0,BZ-BD/2]];
      pg.add(seg(o, L("line", .9)));
      var w = [[0,0,BZ-BD/2],[0,0,BZ+BD/2],[-BW/2,0,BZ-2],[BW/2,0,BZ-2],[-BW/2,0,BZ+3],[-3,0,BZ+3],[3,0,BZ+3],[BW/2,0,BZ+3],[-5,0,BZ-2],[-5,0,BZ-BD/2],[5,0,BZ-2],[5,0,BZ-BD/2],[-6,0,BZ+3],[-6,0,BZ+BD/2],[6,0,BZ+3],[6,0,BZ+BD/2]];
      pg.add(seg(w, L("ghost", .9)));
      s3.add(pg); plates.push(pg);
    }
    var axes = []; [-BW/2, -BW/6, BW/6, BW/2].forEach(function(x){ [BZ-BD/2, BZ, BZ+BD/2].forEach(function(z){ axes.push([x,0,z],[x,NF*FH,z]); }); });
    var axesL = seg(axes, L("ghost", .8)); s3.add(axesL);

    // stage 4 · construcción: losas por nivel, columnas, grúa
    var s4 = new T.Group(); root.add(s4);
    var slabs = [];
    for(f = 0; f <= NF; f++){
      var sl = box(BW + .6, .35, BD + .6, 0, f * FH - (f ? .35 : 0), BZ, F("fill"), L("line")); s4.add(sl); slabs.push(sl);
    }
    var cols = new T.Group(); s4.add(cols);
    [-BW/2+.3, -BW/6, BW/6, BW/2-.3].forEach(function(x){ [BZ-BD/2+.3, BZ, BZ+BD/2-.3].forEach(function(z){ cols.add(box(.5, NF*FH, .5, x, 0, z, F("fill"), L("line", .9))); }); });
    var crane = new T.Group(); s4.add(crane);
    var CX = -BW/2 - 5, CZ = BZ - BD/2 - 2, CH = NF*FH + 14;
    var mast = []; for(var y = 0; y < CH; y += 1.6){ mast.push([CX-.8,y,CZ-.8],[CX+.8,y+1.6,CZ+.8],[CX+.8,y,CZ-.8],[CX-.8,y+1.6,CZ+.8]); }
    [[-.8,-.8],[.8,-.8],[.8,.8],[-.8,.8]].forEach(function(c){ mast.push([CX+c[0],0,CZ+c[1]],[CX+c[0],CH,CZ+c[1]]); });
    crane.add(seg(mast, L("line", .9)));
    var jib = new T.Group(); jib.position.set(CX, CH, CZ); crane.add(jib);
    var jl = []; for(var x = -8; x < 30; x += 2){ jl.push([x,0,0],[x+2,1.6,0],[x+2,1.6,0],[x+2,0,0]); }
    jl.push([-8,0,0],[30,0,0],[-6,1.6,0],[30,1.6,0],[0,1.6,0],[0,5,0],[0,5,0],[30,1.6,0],[0,5,0],[-8,1.6,0]);
    jib.add(seg(jl, L("line", .9)));
    jib.add(box(4, 2.2, 2.4, -7, -2.2, 0, F("acc"), L("line")));          // counterweight
    var hookLine = new T.Group(); jib.add(hookLine);
    var cable = seg([[0,0,0],[0,-1,0]], L("line", .8)); hookLine.add(cable);
    var load_ = box(3, .5, 1.6, 0, -1, 0, F("acc"), L("line")); hookLine.add(load_);

    // stage 5 · venta y entrega: fachada, balcones, árboles, luces
    var s5 = new T.Group(); root.add(s5);
    var panes = [], warm = [];
    function facade(len, axis, sign){
      for(var f2 = 0; f2 < NF; f2++){
        for(var k = 0; k < Math.floor(len / 3.4); k++){
          var w = 2.2, h = FH - 1.1, u = -len/2 + 1.7 + k * 3.4, g = new T.Group();
          var p = new T.Mesh(new T.PlaneGeometry(w, h), F("glass", .55)); g.add(p); g.add(edges(new T.PlaneGeometry(w, h), L("line", .9)));
          var lit = new T.Mesh(new T.PlaneGeometry(w * .9, h * .9), F("warm", 0)); lit.position.z = .01; g.add(lit);
          if(axis === "z"){ g.position.set(u, f2 * FH + FH / 2 + .1, BZ + sign * (BD / 2 + .32)); if(sign < 0) g.rotation.y = Math.PI; }
          else { g.position.set(sign * (BW / 2 + .32), f2 * FH + FH / 2 + .1, BZ + u); g.rotation.y = sign * Math.PI / 2; }
          g.userData.f = f2; g.userData.r = Math.random(); s5.add(g); panes.push(g); warm.push(lit.material);
          lit.material.userData.on = Math.random() < .45;
        }
      }
    }
    facade(BW, "z", 1); facade(BW, "z", -1); facade(BD, "x", 1); facade(BD, "x", -1);
    var balc = []; for(f = 1; f < NF; f++) balc.push([-BW/2,f*FH+1.05,BZ+BD/2+1.3],[BW/2,f*FH+1.05,BZ+BD/2+1.3],[-BW/2,f*FH,BZ+BD/2+1.3],[-BW/2,f*FH+1.05,BZ+BD/2+1.3],[BW/2,f*FH,BZ+BD/2+1.3],[BW/2,f*FH+1.05,BZ+BD/2+1.3]);
    var balcL = seg(balc, L("line", .9)); s5.add(balcL);
    var roof = box(BW - 6, 2.4, 6, 0, NF*FH, BZ - 3, F("fill"), L("line")); s5.add(roof);
    var trees = new T.Group(); s5.add(trees);
    [[-8, LD/2-3.5, 4.2],[1, LD/2-2.5, 5],[9, LD/2-4, 3.6],[-LW/2-2, LD/2+11, 4.4],[LW/2+3, LD/2+11, 4.8],[-3, LD/2+11, 3.8]].forEach(function(tp){
      var tg = new T.Group(); tg.position.set(tp[0], 0, tp[1]);
      tg.add(seg([[0,0,0],[0,tp[2]*.55,0]], L("line")));
      var cr = new T.IcosahedronGeometry(tp[2] * .42, 1);
      var m = new T.Mesh(cr, F("acc", .22)); m.position.y = tp[2] * .75; tg.add(m);
      var e = edges(cr, L("acc", .8)); e.position.y = tp[2] * .75; tg.add(e);
      trees.add(tg);
    });
    // the "key": a little marker over the entrance
    var key = new T.Group(); s5.add(key); key.position.set(0, 1.5, BZ + BD / 2 + 2.6);
    key.add(new T.Mesh(new T.TorusGeometry(.6, .14, 6, 18), F("acc"))); var kb = box(.22, 1.6, .22, 0, -2.1, 0, F("acc"), null); key.add(kb);

    // ---------- scroll → continuous stage s in [0,5]
    var S = 0, St = 0, need = true, visible = true, t0 = performance.now();
    function target(){
      if(!steps.length) return 5;
      var mid = window.innerHeight * .5, a = steps[0].getBoundingClientRect().top;
      var gap = steps.length > 1 ? (steps[steps.length - 1].getBoundingClientRect().top - a) / (steps.length - 1) : window.innerHeight * .6;
      return Math.max(0, Math.min(5, .5 + (mid - a) / Math.max(1, gap)));      // step k centred on screen -> s = k
    }
    var TAGS = ["", "El terreno", "H 6/20 · 6 niveles · 20% libre", "Diseño: plantas y estructura", "Obra en proceso", "Entrega de llaves"];
    function stage(p, k){ return ease(p - (k - 1)); }

    function apply(s, tt){
      var p1 = stage(s, 1), p2 = stage(s, 2), p3 = stage(s, 3), p4 = stage(s, 4), p5 = stage(s, 5);
      // 1
      s1.visible = p1 > 0; grid.material.opacity = .35 * p1; lot.scale.set(p1, 1, p1);
      stakes.children.forEach(function(st, i){ st.scale.y = Math.max(.001, ease(p1 * 4 - i * .6)); });
      neigh.children.forEach(function(n, i){ n.scale.y = Math.max(.001, ease(p1 * 1.6 - i * .12)); n.position.y = n.scale.y * n.children[0].geometry.parameters.height / 2; });
      dimL.visible = p1 > .7 && p4 < .5;
      neigh.children.forEach(function(n){ n.children[0].material.opacity = .55 * (1 - .45 * p4); n.children[1].material.opacity = .9 * (1 - .4 * p4); });
      // 2
      s2.visible = p2 > 0 && p4 < 1;
      env.scale.y = Math.max(.001, p2); env.position.y = NF * FH * env.scale.y / 2;
      var envFade = 1 - .75 * p3 - .25 * p4;
      env.children[0].material.opacity = .08 * envFade; env.children[1].material.opacity = .9 * envFade * (p2 > 0 ? 1 : 0);
      libre.material.opacity = .16 * p2 * (1 - p5 * .6); hatchL.material.opacity = .45 * p2 * (1 - p5 * .6);
      hdim.visible = p2 > .9 && p3 < .5;
      // 3
      s3.visible = p3 > 0 && p5 < 1;
      plates.forEach(function(pg, i){ var q = ease(p3 * (NF + 1) - i); pg.visible = q > 0; pg.scale.set(q, 1, q); pg.children.forEach(function(c){ c.material.opacity = .9 * (1 - p4 * .7); }); });
      axesL.material.opacity = .8 * p3 * (1 - p4);
      // 4
      s4.visible = p4 > 0;
      var built = p4 * (NF + 1);
      slabs.forEach(function(sl, i){ var q = ease(built - i); sl.visible = q > 0; sl.scale.set(1, 1, 1); sl.position.y = i * FH - (i ? .35 : 0) + (1 - q) * 6; sl.children.forEach(function(c){ c.material.opacity = q; }); });
      cols.children.forEach(function(c){ var h = Math.min(1, Math.max(.001, built / (NF + 1))); c.scale.y = h; c.position.y = NF * FH * h / 2; });
      crane.visible = p4 > 0 && p5 < 1; crane.position.y = -p5 * 40;
      jib.rotation.y = -.9 + Math.sin(tt * .00035) * .6 + p4 * 1.2;
      var reach = 8 + 10 * (.5 + .5 * Math.sin(tt * .0006)), drop = 4 + 8 * (.5 + .5 * Math.cos(tt * .0005));
      hookLine.position.x = reach; cable.scale.y = drop; load_.position.y = -drop - .25;
      // 5
      s5.visible = p5 > 0;
      panes.forEach(function(g){ var q = ease(p5 * (NF + 2) - g.userData.f - g.userData.r); g.visible = q > 0; g.scale.set(q, q, 1); });
      var dusk = ease(p5 * 1.4 - .4);
      warm.forEach(function(m){ m.opacity = m.userData.on ? .55 * dusk * (.85 + .15 * Math.sin(tt * .002 + m.id)) : 0; });
      balcL.material.opacity = p5; roof.visible = p5 > .3; roof.scale.y = Math.max(.001, ease(p5 * 2 - .6));
      trees.children.forEach(function(tg, i){ var q = ease(p5 * 2.2 - i * .18); tg.scale.setScalar(Math.max(.001, q)); });
      key.visible = p5 > .8; key.position.y = 6 + Math.sin(tt * .003) * .35; key.rotation.y = tt * .0015;
      // camera: orbit around the lot, rising as the building grows
      var ang = -.62 + s * .2 + (reduce ? 0 : Math.sin(tt * .00012) * .06), R = 80 - s * 2.5, H = 24 + s * 5.5;   // stays on the street side
      cam.position.set(Math.sin(ang) * R, H, Math.cos(ang) * R + BZ);
      cam.lookAt(0, 4 + s * 1.6, BZ);
      // tag follows the top of the building
      var k = Math.min(5, Math.max(1, Math.round(s + .2)));
      if(tag.textContent !== TAGS[k]) tag.textContent = TAGS[k];
      var top = new T.Vector3(0, k >= 2 ? NF * FH + (k >= 5 ? 2.4 : 0) : 1.5, BZ).project(cam);
      tag.style.left = ((top.x + 1) / 2 * 100).toFixed(2) + "%"; tag.style.top = ((1 - top.y) / 2 * 100).toFixed(2) + "%";
      tag.style.opacity = s > .6 ? 1 : 0;
    }

    function size(){
      var w = wrap.clientWidth, h = wrap.clientHeight;
      if(!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); need = true;
    }
    function frame(tt){
      raf = 0; if(!visible || document.hidden) return;
      St = target(); S += (St - S) * (reduce ? 1 : .12);
      apply(S, reduce ? 0 : tt - t0);
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    }
    var raf = 0;
    function go(){ if(!raf) raf = requestAnimationFrame(frame); }
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){ visible = es[0].isIntersecting; if(visible) go(); }).observe(wrap);
    }
    document.addEventListener("visibilitychange", go);
    window.addEventListener("resize", size);
    if(window.ResizeObserver) new ResizeObserver(size).observe(wrap);
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    paint(); size(); S = target(); go();
  }
})();
