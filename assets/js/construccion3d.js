/* Construcción 3D — hero oscuro de /construccion.htm.
   Un local comercial de dos niveles se arma solo: trazo → cimentación → estructura → losas → fachada
   → instalaciones → entrega (luces encendidas), con grúa trabajando, escaneo de avance, polvo y la ciudad al fondo.
   Ciclo: arma (~9 s), se queda encendido, se rebobina rápido y vuelve a empezar.
   Three.js r128 (mismo CDN que proc3d.js) se carga después de que la página terminó de cargar, para no frenar
   el primer pintado. Sin WebGL o con "reducir movimiento" queda el fondo oscuro / la escena fija ya construida.
   Se pausa fuera de pantalla y con la pestaña oculta. */
(function(){
  "use strict";
  var host = document.querySelector(".chero"), cv = host && host.querySelector(".chero__cv");
  if(!cv || !window.requestAnimationFrame) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  try{ var tc = document.createElement("canvas"); if(!(tc.getContext("webgl") || tc.getContext("experimental-webgl"))) return; }catch(e){ return; }

  function idle(f){ (window.requestIdleCallback || function(c){ setTimeout(c, 150); })(f, {timeout:1200}); }
  function boot(){
    if(window.THREE) return start();
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = start; s.onerror = function(){}; document.head.appendChild(s);
  }
  if(document.readyState === "complete") idle(boot); else window.addEventListener("load", function(){ idle(boot); });

  function clamp(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
  function eo(p){ return 1 - Math.pow(1 - p, 3); }
  function eb(p){ var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }

  function start(){
    var T = window.THREE; if(!T) return;
    var mobile = window.innerWidth < 900;
    var renderer;
    try{ renderer = new T.WebGLRenderer({canvas:cv, antialias:true, powerPreference:"high-performance"}); }catch(e){ return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x0B0E0D, 1);

    var scene = new T.Scene(); scene.fog = new T.FogExp2(0x0B0E0D, 0.017);
    var cam = new T.PerspectiveCamera(32, 1, 0.1, 400);
    var MINT = 0x8FD1B4, WARM = 0xFFB874;

    /* ---------- texturas y materiales ---------- */
    function radial(){
      var c = document.createElement("canvas"); c.width = c.height = 128;
      var g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.22, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c);
    }
    var RT = radial();
    var mConc  = new T.MeshStandardMaterial({color:0x1a1f1d, roughness:.92, metalness:.05});
    var mSteel = new T.MeshStandardMaterial({color:0x202a27, roughness:.45, metalness:.75});
    var mFin   = new T.MeshStandardMaterial({color:0x121816, roughness:.6, metalness:.4});
    var mGlass = new T.MeshStandardMaterial({color:0x7fb8a6, roughness:.08, metalness:.9, transparent:true, opacity:.2, emissive:WARM, emissiveIntensity:0, depthWrite:false});
    var mLeaf  = new T.MeshStandardMaterial({color:0x22382f, roughness:.8, flatShading:true});
    var mEdge  = new T.LineBasicMaterial({color:MINT, transparent:true, opacity:.8});
    var mEdgeG = new T.LineBasicMaterial({color:MINT, transparent:true, opacity:.45});
    var mEdgeF = new T.LineBasicMaterial({color:MINT, transparent:true, opacity:.1});
    var mLamp  = new T.MeshBasicMaterial({color:WARM, transparent:true, opacity:0});
    var mBack  = new T.MeshBasicMaterial({color:0xC9884F, transparent:true, opacity:0});
    var mSign  = new T.MeshBasicMaterial({color:MINT, transparent:true, opacity:0});

    function box(w, h, d, mat, edge, anchor){
      var g = new T.BoxGeometry(w, h, d);
      if(anchor === "y") g.translate(0, h / 2, 0); else if(anchor === "z") g.translate(0, 0, d / 2);
      var grp = new T.Group(); grp.add(new T.Mesh(g, mat));
      if(edge) grp.add(new T.LineSegments(new T.EdgesGeometry(g), edge));
      return grp;
    }
    function glow(color, sx, sy){
      var s = new T.Sprite(new T.SpriteMaterial({map:RT, color:color, blending:T.AdditiveBlending, transparent:true, depthWrite:false, opacity:0}));
      s.scale.set(sx, sy || sx, 1); return s;
    }

    /* ---------- línea de tiempo ---------- */
    var A = [];
    function anim(o, t0, d, type, fn){ A.push({o:o, t0:t0, d:d, type:type, fn:fn, by:o.position ? o.position.y : 0}); if(o.visible !== undefined && type !== "fn") o.visible = false; return o; }
    function fade(mat, to, t0, d){ anim({}, t0, d, "fn", function(p){ mat.opacity = to * eo(p); }); }
    function update(bt){
      for(var i = 0; i < A.length; i++){
        var a = A[i], p = clamp((bt - a.t0) / a.d), e = eo(p), o = a.o;
        switch(a.type){
          case "y": o.visible = p > 0; o.scale.y = Math.max(e, 1e-3); break;
          case "x": o.visible = p > 0; o.scale.x = Math.max(e, 1e-3); break;
          case "z": o.visible = p > 0; o.scale.z = Math.max(e, 1e-3); break;
          case "drop": o.visible = p > 0; o.position.y = a.by + (1 - e) * 7; break;
          case "rise": o.visible = p > 0; o.position.y = a.by - (1 - e) * 1.5; o.scale.y = Math.max(e, 1e-3); break;
          case "pop": o.visible = p > 0; var s = Math.max(eb(p), 1e-3); o.scale.set(s, s, s); break;
          case "fn": a.fn(p); break;
        }
      }
    }

    /* ---------- luces ---------- */
    scene.add(new T.HemisphereLight(0x6f8f86, 0x0b0e0d, .3));
    var moon = new T.DirectionalLight(0x9fc7ff, .55); moon.position.set(-20, 30, 18); scene.add(moon);
    var rim = new T.DirectionalLight(MINT, .55); rim.position.set(25, 12, -20); scene.add(rim);
    var warmL = [[-4, 2.6, 2], [4, 2.6, 2], [0, 7.6, 0]].map(function(p){
      var l = new T.PointLight(WARM, 0, 26, 2); l.position.set(p[0], p[1], p[2]); scene.add(l); return l;
    });

    /* ---------- piso, retícula y trazo ---------- */
    var ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({color:0x0d1211, roughness:1}));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    var grid = new T.GridHelper(120, 60, MINT, 0x24332e); grid.material.transparent = true; grid.material.opacity = 0; grid.position.y = .01; scene.add(grid);
    var gridF = new T.GridHelper(40, 80, 0x1c2925, 0x1c2925); gridF.material.transparent = true; gridF.material.opacity = 0; gridF.position.y = .015; scene.add(gridF);
    fade(grid.material, .32, 0, 1); fade(gridF.material, .5, .2, 1);
    var lotG = new T.BufferGeometry().setFromPoints([new T.Vector3(-10, .03, -7), new T.Vector3(10, .03, -7), new T.Vector3(10, .03, 9), new T.Vector3(-10, .03, 9), new T.Vector3(-10, .03, -7)]);
    var lotM = new T.LineDashedMaterial({color:MINT, dashSize:.6, gapSize:.4, transparent:true, opacity:0});
    var lot = new T.Line(lotG, lotM); lot.computeLineDistances(); scene.add(lot); fade(lotM, .9, 0, .8);

    /* ---------- edificio ---------- */
    var B = new T.Group(); scene.add(B);
    var W = 16, D = 10, L0 = .4, L1 = 5.4, L1t = 5.75, L2 = 9.35;
    var xs = [-7.6, -2.53, 2.53, 7.6], zs = [-4.6, 0, 4.6];
    function at(o, x, y, z){ o.position.set(x, y, z); B.add(o); return o; }

    anim(at(box(W + 1, .4, D + 1, mConc, mEdge, "y"), 0, 0, 0), .6, .9, "y");
    var k = 0;
    xs.forEach(function(x){ zs.forEach(function(z){ anim(at(box(.45, 5, .45, mSteel, mEdge, "y"), x, L0, z), 1.4 + (k++) * .07, .6, "y"); }); });
    zs.forEach(function(z, i){ anim(at(box(W - .75, .5, .35, mSteel, mEdge, "y"), 0, L1 - .5, z), 3 + i * .1, .6, "x"); });
    xs.forEach(function(x, i){ anim(at(box(.35, .5, D - .75, mSteel, mEdge, "y"), x, L1 - .5, 0), 3.1 + i * .08, .6, "z"); });
    anim(at(box(W + .4, .35, D + .4, mConc, mEdge, "y"), 0, L1, 0), 3.6, .7, "drop");
    k = 0;
    xs.forEach(function(x){ zs.forEach(function(z){ anim(at(box(.4, 3.6, .4, mSteel, mEdge, "y"), x, L1t, z), 4.2 + (k++) * .06, .5, "y"); }); });
    zs.forEach(function(z, i){ anim(at(box(W - .75, .45, .3, mSteel, mEdge, "y"), 0, L2 - .45, z), 5.2 + i * .08, .5, "x"); });
    anim(at(box(W + .4, .35, D + .4, mConc, mEdge, "y"), 0, L2, 0), 5.6, .7, "drop");
    [[0, D / 2 + .1, W + .4, .2], [0, -D / 2 - .1, W + .4, .2]].forEach(function(p){ anim(at(box(p[2], .6, p[3], mConc, mEdge, "y"), p[0], L2 + .35, p[1]), 6, .4, "y"); });
    [[W / 2 + .1, 0], [-W / 2 - .1, 0]].forEach(function(p){ anim(at(box(.2, .6, D + .4, mConc, mEdge, "y"), p[0], L2 + .35, p[1]), 6, .4, "y"); });
    anim(at(box(W - .4, 5, .2, mConc, mEdge, "y"), 0, L0, -4.6), 5.8, .5, "y");

    // planta baja: cortina de vidrio al frente y a los lados
    var j = 0;
    for(var b = 0; b < 3; b++){
      var x0 = xs[b] + .25, x1 = xs[b + 1] - .25, w = (x1 - x0) / 2;
      [x0 + w / 2, x0 + 1.5 * w].forEach(function(cx){ anim(at(box(w - .06, 4.5, .06, mGlass, mEdgeG, "y"), cx, L0, 4.65), 6 + (j++) * .07, .5, "rise"); });
    }
    [-7.75, 7.75].forEach(function(x){
      for(var q = 0; q < 2; q++){ var z0 = zs[q] + .25, z1 = zs[q + 1] - .25;
        anim(at(box(.06, 4.5, z1 - z0, mGlass, mEdgeG, "y"), x, L0, (z0 + z1) / 2), 6.2 + q * .1, .5, "rise"); }
    });
    // planta alta: banda de vidrio + parteluces verticales
    anim(at(box(W - .6, 3.4, .06, mGlass, mEdgeG, "y"), 0, L1t, 4.4), 6.5, .5, "rise");
    [-7.5, 7.5].forEach(function(x){ anim(at(box(.06, 3.4, D - .8, mGlass, mEdgeG, "y"), x, L1t, 0), 6.55, .5, "rise"); });
    k = 0;
    for(var fx = -7.4; fx <= 7.41; fx += .6) anim(at(box(.08, 3.4, .5, mFin, null, "y"), fx, L1t, 4.85), 6.8 + (k++) * .022, .4, "y");
    for(var fz = -4.2; fz <= 4.21; fz += .6){
      anim(at(box(.5, 3.4, .08, mFin, null, "y"), 7.85, L1t, fz), 6.9 + (fz + 4.2) * .03, .4, "y");
      anim(at(box(.5, 3.4, .08, mFin, null, "y"), -7.85, L1t, fz), 6.9 + (fz + 4.2) * .03, .4, "y");
    }
    // marquesina, letrero y equipos de azotea
    anim(at(box(W + 1, .18, 2.2, mSteel, mEdge, "z"), 0, L0 + 4.2, 4.95), 7.4, .6, "z");
    var sign = at(new T.Mesh(new T.BoxGeometry(W + 1, .1, .1), mSign), 0, L0 + 4.25, 7.17); fade(mSign, .95, 8.2, .5);
    [[-4.5, -1.8], [-1.6, 1.5], [3.8, -1]].forEach(function(p, i){ anim(at(box(1.6, 1, 1.2, mSteel, mEdge, "y"), p[0], L2 + .35, p[1]), 7.8 + i * .12, .5, "pop"); });
    // interiores encendidos
    at(new T.Mesh(new T.BoxGeometry(W - 1, 4.4, .05), mBack), 0, L0 + 2.2, -4.4); fade(mBack, .75, 8, .8);
    for(var r = 0; r < 4; r++){ at(new T.Mesh(new T.BoxGeometry(W - 2, .05, .16), mLamp), 0, L1 - .6, -3.4 + r * 2.3); at(new T.Mesh(new T.BoxGeometry(W - 2, .05, .16), mLamp), 0, L2 - .5, -3.4 + r * 2.3); }
    fade(mLamp, 1, 8, .6);
    anim({}, 8, .8, "fn", function(p){ mGlass.emissiveIntensity = .45 * p; warmL[0].intensity = warmL[1].intensity = 3.2 * p; warmL[2].intensity = 2.2 * p; });
    var gl = [];
    [-5, 0, 5].forEach(function(x){ gl.push(at(glow(WARM, 9, 6), x, 2.6, 5.6)); });
    gl.push(at(glow(MINT, 20, 2.2), 0, L0 + 4.25, 7.3));
    anim({}, 8.1, .8, "fn", function(p){ for(var i = 0; i < gl.length; i++) gl[i].material.opacity = (i === 3 ? .5 : .42) * eo(p); });
    var spillM = new T.MeshBasicMaterial({map:RT, color:WARM, blending:T.AdditiveBlending, transparent:true, depthWrite:false, opacity:0});
    var spill = new T.Mesh(new T.PlaneGeometry(22, 9), spillM); spill.rotation.x = -Math.PI / 2; at(spill, 0, .45, 8.5); fade(spillM, .35, 8.1, .8);
    // árboles de entrega
    [[-9, 9.5], [-4.5, 10.2], [4.5, 10.2], [9, 9.5]].forEach(function(p, i){
      var t = new T.Group();
      t.add(new T.Mesh(new T.CylinderGeometry(.08, .12, 1.4, 6).translate(0, .7, 0), mSteel));
      var crown = new T.IcosahedronGeometry(.6, 0).translate(0, 1.7, 0);
      t.add(new T.Mesh(crown, mLeaf)); t.add(new T.LineSegments(new T.EdgesGeometry(crown), mEdgeG));
      anim(at(t, p[0], 0, p[1]), 8.4 + i * .1, .6, "pop");
    });

    /* ---------- escaneo de avance ---------- */
    var scanM = new T.LineBasicMaterial({color:MINT, transparent:true, opacity:0});
    var scan = new T.LineLoop(new T.BufferGeometry().setFromPoints([new T.Vector3(-9, 0, -6), new T.Vector3(9, 0, -6), new T.Vector3(9, 0, 6), new T.Vector3(-9, 0, 6)]), scanM);
    var scanFM = new T.MeshBasicMaterial({color:MINT, transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide});
    var scanF = new T.Mesh(new T.PlaneGeometry(18, 12), scanFM); scanF.rotation.x = -Math.PI / 2;
    scene.add(scan); scene.add(scanF);

    /* ---------- grúa ---------- */
    var mCr = new T.LineBasicMaterial({color:MINT, transparent:true, opacity:.5});
    function lattice(len, s, axis){
      var v = [], n = Math.round(len / s), h = s / 2;
      for(var i = 0; i < n; i++){
        var a = i * s, c = a + s;
        var P = axis === "y" ? function(u, x, z){ return [x, u, z]; } : function(u, y, z){ return [u, y, z]; };
        [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(function(q, qi, Q){
          var nq = Q[(qi + 1) % 4];
          v.push.apply(v, P(a, q[0], q[1])); v.push.apply(v, P(c, q[0], q[1]));
          v.push.apply(v, P(a, q[0], q[1])); v.push.apply(v, P(c, nq[0], nq[1]));
          v.push.apply(v, P(c, q[0], q[1])); v.push.apply(v, P(c, nq[0], nq[1]));
        });
      }
      var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
      return new T.LineSegments(g, mCr);
    }
    var crane = new T.Group(); crane.position.set(14, 0, -8); scene.add(crane);
    var mast = lattice(20.4, 1.2, "y"); crane.add(mast); anim(mast, 0, 1.2, "y");
    var top = new T.Group(); top.position.y = 20.4; crane.add(top);
    var jib = lattice(24, 1, "x"); jib.position.x = -6; top.add(jib);
    var cw = box(2.2, 1.2, 1.4, mSteel, mEdge); cw.position.set(-5, -.2, 0); top.add(cw);
    var cab = box(1.4, 1.2, 1.4, mSteel, mEdge); cab.position.set(.8, -1.1, .9); top.add(cab);
    var stay = new T.BufferGeometry().setFromPoints([new T.Vector3(-6, .5, 0), new T.Vector3(0, 4, 0), new T.Vector3(18, .5, 0), new T.Vector3(0, 4, 0), new T.Vector3(0, 4, 0), new T.Vector3(0, .5, 0)]);
    top.add(new T.LineSegments(stay, mCr));
    anim(top, .8, .9, "x");
    var trolley = box(.8, .4, 1, mSteel, mEdge); top.add(trolley);
    var cableG = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
    var cable = new T.Line(cableG, mCr); top.add(cable);
    var load = box(4, .3, .5, mSteel, mEdge); top.add(load);
    var beacon = glow(0xff5a45, 1.6); beacon.position.y = 4.3; top.add(beacon);
    var baseAng = Math.atan2(-8, -14) + Math.PI * 0; // apunta hacia el edificio

    /* ---------- ciudad al fondo ---------- */
    var city = new T.Group(); scene.add(city);
    var mCity = new T.MeshStandardMaterial({color:0x111816, roughness:1});
    var wins = [], seed = 7; function rnd(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for(var c = 0; c < (mobile ? 40 : 70); c++){
      var ang = rnd() * Math.PI * 2, rad = 55 + rnd() * 65, bw = 5 + rnd() * 9, bh = 6 + Math.pow(rnd(), 1.8) * 34, bd = 5 + rnd() * 9;
      var bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
      var bld = box(bw, bh, bd, mCity, mEdgeF, "y"); bld.position.set(bx, 0, bz); bld.rotation.y = rnd() * Math.PI; city.add(bld);
      for(var wv = 0; wv < 10; wv++){ if(rnd() < .55){ var wy = 1 + rnd() * (bh - 2); wins.push(bx + (rnd() - .5) * bw, wy, bz + (rnd() - .5) * bd); } }
    }
    var wg = new T.BufferGeometry(); wg.setAttribute("position", new T.Float32BufferAttribute(wins, 3));
    city.add(new T.Points(wg, new T.PointsMaterial({color:WARM, size:.9, map:RT, transparent:true, opacity:.75, depthWrite:false, blending:T.AdditiveBlending})));

    /* ---------- polvo ---------- */
    var N = mobile ? 220 : 480, dp = new Float32Array(N * 3);
    for(var d = 0; d < N; d++){ dp[d * 3] = (rnd() - .5) * 60; dp[d * 3 + 1] = rnd() * 18; dp[d * 3 + 2] = (rnd() - .5) * 50; }
    var dg = new T.BufferGeometry(); dg.setAttribute("position", new T.BufferAttribute(dp, 3));
    var dust = new T.Points(dg, new T.PointsMaterial({color:0xbfe8d6, size:.16, map:RT, transparent:true, opacity:.55, depthWrite:false, blending:T.AdditiveBlending}));
    scene.add(dust);

    /* ---------- HUD ---------- */
    var hS = host.querySelector(".chero__stage"), hP = host.querySelector(".chero__pct"), hB = host.querySelector(".chero__bar b");
    var stages = [[0, "Trazo del terreno"], [.6, "Cimentación"], [1.4, "Estructura"], [3.6, "Losas"], [5.8, "Fachada"], [7.4, "Instalaciones"], [8.4, "Entrega"]], lastS = "";
    function hud(bt){
      var s = stages[0][1]; for(var i = 0; i < stages.length; i++) if(bt >= stages[i][0]) s = stages[i][1];
      var pc = Math.round(clamp(bt / 9) * 100);
      if(hS && s !== lastS){ hS.textContent = s; lastS = s; }
      if(hP) hP.textContent = (pc < 10 ? "0" : "") + pc + "%";
      if(hB) hB.style.transform = "scaleX(" + (pc / 100) + ")";
    }

    /* ---------- cámara, tamaño, puntero ---------- */
    var R = 52, mx = 0, my = 0, tx = 0, ty = 0;
    function resize(){
      var w = host.clientWidth, h = host.clientHeight; if(!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; scene.fog.density = w >= 900 ? .017 : .007;
      if(w >= 900){ cam.setViewOffset(w, h, -w * .2, -h * .02, w, h); R = 52; } else { cam.setViewOffset(w, h, 0, h * .2, w, h); R = w / h < .7 ? 92 : 78; }
      cam.updateProjectionMatrix();
    }
    resize(); window.addEventListener("resize", function(){ resize(); if(reduce) draw(9.4, 0); });
    host.addEventListener("pointermove", function(e){ var r = host.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width * 2 - 1; ty = (e.clientY - r.top) / r.height * 2 - 1; });
    host.addEventListener("pointerleave", function(){ tx = ty = 0; });

    function draw(bt, time){
      update(bt); hud(bt);
      // escaneo
      var sp = clamp((bt - .6) / 7.6); scan.position.y = scanF.position.y = .2 + sp * 10.2;
      var so = bt < .6 ? 0 : bt < 8.2 ? 1 : clamp(1 - (bt - 8.2) / .6);
      scanM.opacity = .9 * so; scanFM.opacity = .07 * so;
      // grúa
      var ja = baseAng + .55 * Math.sin(time * .22);
      top.rotation.y = ja;
      var tr = 9 + 4.5 * Math.sin(time * .37), len = 9 + 5 * Math.sin(time * .29 + 1);
      trolley.position.set(tr, -.5, 0); load.position.set(tr, -len, 0); load.rotation.y = Math.sin(time * .5) * .3;
      var cp = cableG.attributes.position; cp.setXYZ(0, tr, -.7, 0); cp.setXYZ(1, tr, -len + .15, 0); cp.needsUpdate = true;
      beacon.material.opacity = (Math.sin(time * 3.2) > .55 ? .9 : .08);
      // polvo
      var pa = dg.attributes.position;
      for(var i = 0; i < N; i++){ var y = pa.getY(i) + .006 + .004 * Math.sin(time + i); if(y > 18) y = 0; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(time * .3 + i) * .004); }
      pa.needsUpdate = true;
      // cámara
      mx += (tx - mx) * .04; my += (ty - my) * .04;
      var a = .55 + .45 * Math.sin(time * .07) + mx * .25;
      cam.position.set(Math.sin(a) * R, R * .36 - my * 3, Math.cos(a) * R);
      cam.lookAt(0, 6.5, 0);
      renderer.render(scene, cam);
    }

    if(reduce){ draw(9.4, 0); host.classList.add("is-3d"); return; }

    var running = false, raf = 0, t0 = performance.now(), paused = 0, pauseAt = 0, L = 24;
    function frame(now){
      if(!running){ raf = 0; return; }
      raf = requestAnimationFrame(frame);
      var time = (now - t0 - paused) / 1000, c = time % L;
      var bt = c < 21.6 ? Math.min(c, 9.4) : 9.4 * (1 - (c - 21.6) / 2.4);
      draw(bt, time);
    }
    function play(){ if(running) return; running = true; if(pauseAt){ paused += performance.now() - pauseAt; pauseAt = 0; } raf = requestAnimationFrame(frame); }
    function stop(){ if(!running) return; running = false; pauseAt = performance.now(); if(raf) cancelAnimationFrame(raf); raf = 0; }
    var inView = true;
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){ inView = es[0].isIntersecting; if(inView && !document.hidden) play(); else stop(); }).observe(host);
    }
    document.addEventListener("visibilitychange", function(){ if(document.hidden) stop(); else if(inView) play(); });
    host.classList.add("is-3d");
    play();
  }
})();
