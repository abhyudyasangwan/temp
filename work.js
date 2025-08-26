const PROJECTS = [
  { label: 'P1', url: 'proj1.html', imageUrl: 'p1.png' },
  { label: 'P2', url: 'proj2.html', imageUrl: 'p2.png' },
  { label: 'P3', url: 'proj3.html', imageUrl: 'p4.png' },
  { label: 'P4', url: 'proj4.html', imageUrl: 'p5.png' },
  { label: 'P5', url: 'proj5.html', imageUrl: 'p1.png' },
  { label: 'P6', url: 'proj6.html', imageUrl: 'p1.png' },
  { label: 'P7', url: 'proj1.html', imageUrl: 'p6.png' },
  { label: 'P8', url: 'proj1.html', imageUrl: 'p3.png' },
];

const HFOV = Math.PI/2;
const EDGE_FADE_INNER = HFOV * 0.92;
const EDGE_FADE_OUTER = HFOV * 0.995;
const PILLAR_COUNT = 8;

const CLICK_SLOP = 6;

const TAU = Math.PI*2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function norm(a){ a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function smoothstep(e0, e1, x){ const t = clamp((x-e0)/(e1-e0), 0, 1); return t*t*(3-2*t); }
function lerp(a,b,t){ return a + (b-a)*t; }
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function shortestAngleTo(a, b){ return angDelta(b, a); }
function lerpAngle(a, b, t){ return norm(a + shortestAngleTo(a, b) * t); }
function angDelta(a, b) { let d = a - b; d = (d + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d - Math.PI; }


function initScene(root) {
  // --------- Scene-scoped DOM ----------
  const viewer = root.querySelector('.viewer');
  const bg = root.querySelector('.bg');
  const ctx = bg.getContext('2d');

  // --------- Scene-scoped state ----------
  let yaw = 0;
  let bgPhase = 0;
  let autoSpeed = 0.32;
  let autoDir = 1;
  let pillarPhase = 0;
  let pillarDir = -1;
  const pillarSpeed = autoSpeed * 0; // 0 = pillars fixed relative to bg

  let zooming = false;
  let zoomStart = 0;
  let zoomDur = 800;
  let zoomPillar = null;
  let zoomTargetYaw = 0;
  let zoomStartYaw = 0;
  let zoomUrl = "";

  const ZOOM_MAX_Z = 900;
  const ZOOM_MAX_SCALE = 3.8;
  const ZOOM_DIM_OTHERS = 0.06;

  let dragging = false, lastX = 0, lastDX = 0, prevTs = 0;
  let dragStartTotal = 0, pressX = 0, pressY = 0, dragDist = 0;

  // build image per scene (can be shared too if you want)
  const panoImg = new Image();
  panoImg.crossOrigin = "anonymous";
  panoImg.src = "backpano.png";

  // --------- Pillars ----------
  function createPillarEl(label, url, imageUrl){
    const wrap = document.createElement('div');
    wrap.className = 'pillar';
    wrap.style.setProperty('--w','300px');
    wrap.style.setProperty('--h','300px');

    wrap.dataset.url = url || '';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');

    const cap = document.createElement('div');
    cap.className = 'capsule';

    const img = document.createElement('img');
    img.className = 'sprite';
    img.src = imageUrl || 'assets/pillars/default.png';
    img.alt = label || 'pillar';

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const plinth = document.createElement('div');
    plinth.className = 'plinth';

    cap.appendChild(img);
    wrap.appendChild(cap);
    wrap.appendChild(labelEl);
    wrap.appendChild(plinth);
    return wrap;
  }

  const pillars = [];
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const { label, url, imageUrl } = PROJECTS[i % PROJECTS.length];
    const el = createPillarEl(label, url, imageUrl);
    viewer.appendChild(el);
    el.addEventListener('mouseenter', () => el.classList.add('hover'));
    el.addEventListener('mouseleave', () => el.classList.remove('hover'));
    pillars.push({ el, baseYaw: (i/PILLAR_COUNT)*Math.PI*2, pitch: -0.05 });
  }

  // --------- Helpers ----------
  function projectYawToX(relYaw, w){
    const half = w/2;
    const limit = Math.tan(HFOV/2);
    if (Math.abs(relYaw) >= EDGE_FADE_OUTER) return relYaw > 0 ? w : 0;
    const nx = Math.tan(relYaw)/limit; // -1..1 within FOV
    return half + nx*half;
  }

  function drawPanorama(){
    const w = bg.width = viewer.clientWidth;
    const h = bg.height = viewer.clientHeight;

    if (!panoImg.complete || panoImg.naturalWidth === 0) {
      const grad = ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,'#0a1220'); grad.addColorStop(1,'#0b0f18');
      ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
      return { w, h };
    }

    const scale = h / panoImg.naturalHeight;
    const drawW = Math.ceil(panoImg.naturalWidth * scale);
    const drawH = h;

    const pxPerRadian = drawW / TAU;
    const total = bgPhase - yaw; // background scroll
    let offset = Math.round(total * pxPerRadian) % drawW;
    if (offset < 0) offset += drawW;

    let x = -offset;
    while (x < w) {
      ctx.drawImage(
        panoImg, 0, 0, panoImg.naturalWidth, panoImg.naturalHeight,
        x, 0, drawW, drawH
      );
      x += drawW;
    }
    return { w, h };
  }

  // --------- Render loop ----------
  function render(ts){
    if (!prevTs) prevTs = ts;
    const dt = (ts - prevTs) / 1000;
    prevTs = ts;

    if (!dragging && !zooming) {
      bgPhase = norm(bgPhase + autoDir * autoSpeed * dt);
      pillarPhase = norm(pillarPhase + pillarDir * pillarSpeed * dt);
    }

    const {w, h} = drawPanorama();

    // Zoom steering + pano treatment
    let zoomT = 0;
    if (zooming) {
      zoomT = easeOutCubic(Math.min(1, (performance.now() - zoomStart) / zoomDur));
      yaw = lerpAngle(zoomStartYaw, zoomTargetYaw, zoomT);

      const blurPx = lerp(0, 6, zoomT);
      const bright = lerp(1, 0.65, zoomT);
      bg.style.filter = `blur(${blurPx}px) brightness(${bright})`;

      if (!document.getElementById('zoom-fader')) {
        const fader = document.createElement('div');
        fader.id = 'zoom-fader';
        Object.assign(fader.style, {
          position:'fixed', inset:'0', background:'#000', opacity:'0',
          transition:'opacity 120ms linear', pointerEvents:'none', zIndex:'9998'
        });
        document.body.appendChild(fader);
      }
      const fader = document.getElementById('zoom-fader');
      if (zoomT > 0.82) fader.style.opacity = String((zoomT - 0.82) / 0.18);

      if (zoomT >= 1 && zoomUrl) {
        const url = zoomUrl; zoomUrl = "";
        window.location.href = url;
        return;
      }
    } else {
      bg.style.filter = '';
      const f = document.getElementById('zoom-fader'); if (f) f.style.opacity = '0';
    }

    pillars.forEach(({el, baseYaw, pitch}) => {
      const rel = norm((baseYaw + pillarPhase) - yaw);

      // position
      const x = projectYawToX(rel, w);
      const y = h*0.78 + pitch * (h*1.2);
      el.style.left = x + 'px';
      el.style.top  = y + 'px';

      // depth/opacity/rotation
      const edgeFrac = clamp(Math.abs(rel)/HFOV, 0, 1);
      const depth = Math.sin(edgeFrac * Math.PI/2);
      const scale = 0.8 + 0.5*depth;
      const fade = 1 - smoothstep(EDGE_FADE_INNER, EDGE_FADE_OUTER, Math.abs(rel));
      const opacity = (0.6 + 0.4*depth) * fade;
      const rotYdeg = (-rel*180/Math.PI) * 0.55;

      let zScaleBoost = 1.0;
      let zOpacityBoost = 1.0;
      let zTranslateZ = 0;
      let zZIndexBoost = 0;

      if (zooming) {
        if (el === zoomPillar) {
          zScaleBoost = lerp(1.0, ZOOM_MAX_SCALE, zoomT);
          zTranslateZ = lerp(0, ZOOM_MAX_Z, zoomT);
          zZIndexBoost = 8000;
          zOpacityBoost = 1.0;
        } else {
          zOpacityBoost = lerp(1.0, ZOOM_DIM_OTHERS, zoomT);
        }
      }

      el.style.opacity = (opacity * zOpacityBoost).toFixed(3);
      el.style.zIndex = String(1000 + zZIndexBoost + Math.round(depth*200));

      const isHover = el.classList.contains('hover') && !zooming;
      const hoverBoost = isHover ? 1.08 : 1.0;

      el.style.transform =
        `translate(-50%,-100%) rotateY(${rotYdeg.toFixed(2)}deg) translateZ(${zTranslateZ.toFixed(1)}px) scale(${(scale * hoverBoost * zScaleBoost).toFixed(3)})`;

      const plinth = el.querySelector('.plinth');
      plinth.style.width = (220 + 120*depth) + 'px';
      plinth.style.opacity = (0.25 + 0.55*depth) * fade;
    });

    requestAnimationFrame(render);
  }

  // --------- Input handlers (scene-scoped) ----------
  viewer.addEventListener('mousedown', e=>{
    dragging = true;
    lastX = e.clientX;
    pressX = e.clientX; pressY = e.clientY;
    dragDist = 0;
    dragStartTotal = bgPhase - yaw;
    viewer.classList.add('dragging');
  });

  window.addEventListener('mouseup', ()=>{
    if (!dragging) return;
    dragging = false;
    viewer.classList.remove('dragging');

    const endTotal = bgPhase - yaw;
    const d = angDelta(endTotal, dragStartTotal);
    if (Math.abs(d) > 0.002) autoDir = Math.sign(d);
    else if (lastDX !== 0)    autoDir = Math.sign(lastDX);
    pillarDir = -autoDir;
    lastDX = 0;
  });

  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    lastDX = dx;
    dragDist += Math.abs(dx);
    yaw = norm(yaw - dx*0.0006);
  });

  viewer.addEventListener('click', e=>{
    if (dragDist > CLICK_SLOP || zooming) return;
    const pillar = e.target.closest('.pillar');
    if (!pillar) return;
    const url = pillar.dataset.url;
    if (!url) return;

    const rec = pillars.find(p => p.el === pillar);
    if (!rec) return;
    document.body.classList.add('zooming');
    zooming = true;
    zoomPillar = pillar;
    zoomUrl = url;
    zoomStart = performance.now();
    zoomStartYaw = yaw;
    zoomTargetYaw = norm(rec.baseYaw + pillarPhase);

    viewer.style.pointerEvents = 'none';
    setTimeout(() => { viewer.style.pointerEvents = ''; }, zoomDur + 100);
  });

  // Touch
  viewer.addEventListener('touchstart', e=>{
    const t=e.touches[0]; if(!t) return;
    dragging = true; lastX = t.clientX;
    pressX = t.clientX; pressY = t.clientY;
    dragDist = 0;
    dragStartTotal = bgPhase - yaw;
  }, {passive:true});

  function endTouch(){
    if (!dragging) return;
    dragging = false;

    const endTotal = bgPhase - yaw;
    const d = angDelta(endTotal, dragStartTotal);
    if (Math.abs(d) > 0.002) autoDir = Math.sign(d);
    else if (lastDX !== 0)    autoDir = Math.sign(lastDX);
    pillarDir = -autoDir;
    lastDX = 0;
  }

  window.addEventListener('touchend', e=>{
    const wasDragging = dragging;
    endTouch();
    if (!wasDragging) return;

    if (dragDist <= CLICK_SLOP) {
      const touch = e.changedTouches && e.changedTouches[0];
      const target = document.elementFromPoint(
        touch ? touch.clientX : pressX,
        touch ? touch.clientY : pressY
      );
      const pillar = target && target.closest('.pillar');
      if (pillar && pillar.dataset.url) window.location.href = pillar.dataset.url;
    }
  }, {passive:true});

  window.addEventListener('touchcancel', endTouch, {passive:true});

  window.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const t=e.touches[0]; if(!t) return;
    const dx = t.clientX - lastX;
    lastX = t.clientX;
    lastDX = dx;
    dragDist += Math.abs(dx);
    yaw = norm(yaw - dx*0.0003);
  }, {passive:true});

  // start the scene’s loop when the image is ready
  panoImg.onload = () => requestAnimationFrame(render);
  panoImg.onerror = () => requestAnimationFrame(render);
}

// Initialize every .scene on the page
document.querySelectorAll('.scene').forEach(initScene);

// ===== First-scroll snap: from absolute top -> jump to next .scene, then normal scrolling =====
(function setupFirstScrollSnap(){
  const scenes = Array.from(document.querySelectorAll('.scene'));
  if (scenes.length < 2) return;

  let isAnimating = false;
  let snapTarget = null;

  // Use an IntersectionObserver to know when the snap finishes
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === snapTarget && entry.isIntersecting && entry.intersectionRatio >= 0.95) {
        isAnimating = false;
        io.unobserve(entry.target);
        snapTarget = null;
      }
    }
  }, { threshold: [0.95] });

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 1;

  function snapTo(el, duration = 600) {   // duration in ms, lower = faster
    if (!el) return;
    isAnimating = true;
    snapTarget = el;
    io.observe(el);

    const targetY = el.getBoundingClientRect().top + window.pageYOffset;
    const startY = window.pageYOffset;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      // easeInOutCubic
      const eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
      window.scrollTo(0, startY + (targetY - startY) * eased);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        isAnimating = false;
        snapTarget = null;
      }
    }

    requestAnimationFrame(step);

    // Safety unlock
    setTimeout(() => { isAnimating = false; snapTarget = null; }, duration + 400);
  }


  // Wheel (desktop/trackpad)
  function onWheel(e){
    if (isAnimating) { e.preventDefault(); return; }
    if (e.deltaY > 0 && atTop()) {
      e.preventDefault();              // stop tiny default scroll before snapping
      snapTo(scenes[1]);               // jump to the second scene
    }
  }
  window.addEventListener('wheel', onWheel, { passive: false });

  // Touch (mobile)
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    touchStartY = t ? t.clientY : null;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (isAnimating || touchStartY == null) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dy = t.clientY - touchStartY;   // swipe up => dy < 0 (scroll down)
    if (atTop() && dy < -30) snapTo(scenes[1]);
    touchStartY = null;
  }, { passive: true });

  // Keyboard (optional: Space / PageDown from top)
  function onKey(e){
    if (isAnimating) { e.preventDefault(); return; }
    if (!atTop()) return;
    if (e.code === 'Space' || e.code === 'PageDown') {
      e.preventDefault();
      snapTo(scenes[1]);
    }
  }
  window.addEventListener('keydown', onKey, { passive: false });
})();


(function customCursor(){
  if (window.matchMedia && !window.matchMedia('(pointer:fine)').matches) return;

  const root = document.getElementById('cursor');
  const ring = root.querySelector('.cursor-ring');
  const dot  = root.querySelector('.cursor-dot');

  let x = window.innerWidth/2, y = window.innerHeight/2;
  let rx = x, ry = y;                 // ring lerp
  const ease = 0.2;                   // follow smoothness
  const ghosts = [];                  // trailing nodes
  const MAX_GHOSTS = 10;              // trail length
  const GHOST_SPACING = 2;            // frames between spawns

  let frame = 0;

  // Create ghost pool
  for (let i=0; i<MAX_GHOSTS; i++){
    const g = document.createElement('div');
    g.className = 'cursor-ghost';
    g.style.opacity = '0';
    root.appendChild(g);
    ghosts.push({el:g, life:0});
  }

  function move(e){
    x = e.clientX; y = e.clientY;
  }
  function touch(e){
    const t = e.touches && e.touches[0]; if(!t) return;
    x = t.clientX; y = t.clientY;
  }

  window.addEventListener('mousemove', move, {passive:true});
  window.addEventListener('touchstart', touch, {passive:true});
  window.addEventListener('touchmove', touch, {passive:true});

  // Click blink
  // Click blink
  function clickPulse(){
    dot.classList.add('click');                     // target .cursor-dot
    setTimeout(() => dot.classList.remove('click'), 240);
  }
  window.addEventListener('mousedown', clickPulse, { passive: true });
  window.addEventListener('touchend', clickPulse, { passive: true });

  // Avoid covering text inputs: briefly hide when hovering interactive things if you want
  document.addEventListener('mouseover', (e) => {
    const isInteractive = e.target.closest('input, textarea, [contenteditable="true"]');
    root.style.display = isInteractive ? 'none' : '';
  });


  function raf(){
    // lerp ring towards target, dot snaps to target
    rx += (x - rx) * ease;
    ry += (y - ry) * ease;

    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    dot.style.transform  = `translate(${x}px, ${y}px) translate(-50%,-50%)`;

    // spawn / update ghosts
    if ((frame++ % GHOST_SPACING) === 0) {
      // pick the oldest ghost
      const g = ghosts.reduce((a,b)=> a.life<=b.life ? a : b);
      g.life = 1.0;
      g.el.style.opacity = '0.6';
      g.x = x; g.y = y;
      g.el.style.transform = `translate(${g.x}px, ${g.y}px) translate(-50%,-50%)`;
    }
    ghosts.forEach(g=>{
      if (g.life > 0){
        g.life -= 0.05; // fade speed
        g.el.style.opacity = Math.max(0, g.life).toFixed(3);
        // optional: expand slightly as it fades
        const s = 1 + (1-g.life)*0.6;
        g.el.style.transform = `translate(${g.x}px, ${g.y}px) translate(-50%,-50%) scale(${s})`;
      }
    });

    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
})();
