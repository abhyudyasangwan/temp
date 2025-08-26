(function introController() {
  const intro = document.getElementById('intro');
  const vid   = document.getElementById('introVid');
  const skip  = document.getElementById('skipIntro');
  if (!intro || !vid) return;

  // Config
  const ZOOM_SCALE = 1.12;  // how much the video zooms out at the end
  const END_LEAD   = 0.8;   // seconds before end to start the transition
  const FADE_MS    = 600;   // overlay fade duration (match CSS)
  const ZOOM_MS    = 800;   // zoom duration (match CSS)

  // Lock interactions until we finish
  document.body.classList.add('lock-scroll');

  // In case autoplay is blocked, try play() on user gesture; also show skip
  const ensurePlaying = () => {
    if (vid.readyState >= 2) {
      vid.play().catch(() => {/* ignored, user gesture needed */});
    }
  };

  // Start transition (zoom + fade) -> then remove overlay
  let transitioning = false;
  function startOutro() {
    if (transitioning) return;
    transitioning = true;

    // Zoom out and slightly fade video
    vid.style.transform = `scale(${ZOOM_SCALE})`;
    vid.style.opacity = '0.85';

    // Cross-fade overlay out
    intro.style.opacity = '0';

    // After the CSS transitions, clean up
    const doneAfter = Math.max(FADE_MS, ZOOM_MS) + 80;
    setTimeout(() => {
      // remove video to free memory
      try {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      } catch(e) {}

      // reveal app
      document.body.classList.add('app-ready');

      // allow interactions/scroll
      document.body.classList.remove('lock-scroll');

      // remove overlay from DOM
      intro.remove();
    }, doneAfter);
  }

  // Begin outro slightly before the video ends
  function maybeScheduleOutro() {
    if (!Number.isFinite(vid.duration) || vid.duration <= 0) return;
    const remaining = vid.duration - vid.currentTime;
    if (remaining <= END_LEAD) {
      startOutro();
    }
  }

  // Events
  vid.addEventListener('loadeddata', ensurePlaying, { once: true });
  vid.addEventListener('play', ensurePlaying);
  vid.addEventListener('timeupdate', maybeScheduleOutro);
  vid.addEventListener('ended', startOutro);

  // Allow user to skip anytime
  const skipNow = (e) => {
    e && e.preventDefault();
    startOutro();
  };
  if (skip) skip.addEventListener('click', skipNow);
  // also allow keyboard skip (Space/Enter/Escape)
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('app-ready')) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        skipNow(e);
      }
    }
  }, { passive: false });

  // As a safety, if the video fails to load, skip after 2s
  vid.addEventListener('error', () => {
    setTimeout(startOutro, 2000);
  });
})();


const PROJECTS = [
  { label: 'Resume',     url: 'https://drive.google.com/drive/folders/1TiXYe-oBep44RfTCTqjNOQPcQJZ8eogf',    planet: 'resumeplanet.png',    reveal: 'resume4.png'     },
  { label: 'Contact Me',    url: 'contact.html',   planet: 'contactplanet.png',   reveal: 'contact1.png'    },
  { label: 'About Me',      url: 'about.html',  planet: 'aboutplanet.png',  reveal: 'about3.png'   },
  { label: 'My Work',  url: 'work.html', planet: 'workplanet.png', reveal: 'work1.png'  },
];


const HFOV = Math.PI/2;                  // 90° horizontal FOV
const EDGE_FADE_INNER = HFOV * 0.92;     // for smooth fade near edges
const EDGE_FADE_OUTER = HFOV * 0.995;    // clamp
const PILLAR_COUNT = 4;                  // fixed circular layout
let yaw = 0;                             // camera heading
let autoSpeed = 0.32;     // radians per second (2π / 0.08 ≈ 78s per full turn)
let bgPhase = 0; 
let autoDir   = 1;        // +1 or -1; updated after drag ends
let lastDX    = 0;        // to remember last drag direction
let prevTs    = 0;        // rAF timestamp for dt
let dragStartTotal = 0; // background phase observed at drag start
let pressX = 0, pressY = 0;
let dragDist = 0;
const CLICK_SLOP = 6; // px threshold
let autoYawDir = -1;   // +1 = keep turning right after release, -1 = left
let dragSum    = 0;   // accumulate pixels during the current drag
let hoverFreeze = false; 
let prevYawForBg = 0;

// --- DROP IN THIS HELPER NEAR YOUR OTHER UTILS ---

// 10 organic shards (clip-path polygons) arranged in a circle.
// You can tweak/add more polygons for denser cracks.
const SHARD_POLYS = [
  'polygon(50% 0%, 62% 8%, 58% 24%, 42% 22%)',
  'polygon(62% 8%, 78% 16%, 74% 34%, 58% 24%)',
  'polygon(78% 16%, 92% 30%, 84% 46%, 74% 34%)',
  'polygon(92% 30%, 100% 50%, 86% 58%, 84% 46%)',
  'polygon(86% 58%, 74% 66%, 76% 84%, 94% 70%)',
  'polygon(74% 66%, 58% 72%, 56% 88%, 76% 84%)',
  'polygon(58% 72%, 42% 70%, 36% 88%, 56% 88%)',
  'polygon(42% 70%, 26% 64%, 16% 82%, 36% 88%)',
  'polygon(26% 64%, 14% 52%, 0% 66%, 16% 82%)',
  'polygon(14% 52%, 8% 36%, 0% 50%, 0% 66%)',
  // center cap (tiny piece so the image reveal feels “peeking through”)
  'polygon(40% 40%, 60% 40%, 60% 60%, 40% 60%)'
];

// outward offsets for each shard (in px). Tuned for your sphere size (~220px).
// Each shard gets CSS vars --tx/--ty/--rz and --i (stagger index).
const SHARD_OFFSETS = [
  {tx:  '0px',  ty: '-36px', rz:  '-8deg'},
  {tx: '22px',  ty: '-30px', rz: '-10deg'},
  {tx: '34px',  ty: '-12px', rz:  '-6deg'},
  {tx: '38px',  ty:   '8px', rz:   '4deg'},
  {tx: '28px',  ty:  '24px', rz:  '10deg'},
  {tx:  '6px',  ty:  '34px', rz:  '12deg'},
  {tx: '-10px', ty:  '32px', rz:   '8deg'},
  {tx: '-26px', ty:  '20px', rz:   '2deg'},
  {tx: '-34px', ty:   '2px', rz:  '-6deg'},
  {tx: '-28px', ty: '-18px', rz: '-10deg'},
  {tx:   '0px', ty:  '-8px', rz:   '0deg'}, // tiny center cap
];

// --- Cinematic zoom parameters ---
let zooming = false;
let zoomStart = 0;
let zoomDur = 800;            // ms (longer = more dramatic)
let zoomPillar = null;
let zoomTargetYaw = 0;
let zoomStartYaw = 0;
let zoomUrl = "";
let autoDirPillars = 0;
let pillarPhase = 0;            // world-rotation for pillars
let pillarDir   = -1;           // keep opposite to bg by default
const pillarSpeed = autoSpeed*0.000001;  // same speed as bg (tweak if you want)
const PILLAR_SPREAD = 0.55; 
// Narrow rim fade to prevent overlap/pops at the FOV edge
const EDGE_INNER_NARROW = HFOV * 0.985;   // start fading ~98.5% of FOV
const EDGE_OUTER_NARROW = HFOV * 0.9995;  // fully faded right at the rim

// depth & scale targets
const ZOOM_MAX_Z = 900;       // px toward camera (needs #viewer { perspective })
const ZOOM_MAX_SCALE = 3.8;   // multiplies your computed 'scale' at peak zoom
const ZOOM_DIM_OTHERS = 0.06; // how much others fade out by the end

function lerp(a,b,t){ return a + (b-a)*t; }
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function shortestAngleTo(a, b){ return angDelta(b, a); }
function lerpAngle(a, b, t){ return norm(a + shortestAngleTo(a, b) * t); }


function angDelta(a, b) {
  // shortest signed difference a - b in [-π, π]
  let d = a - b;
  d = (d + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

const viewer = document.getElementById('viewer');
// Large arrows fade-away control
const arrowsEl = document.getElementById('drag-arrows');
let arrowsHidden = false;
function hideArrowsOnce(){
  if (arrowsHidden || !arrowsEl) return;
  arrowsHidden = true;
  arrowsEl.classList.add('fade-out');
  setTimeout(() => arrowsEl.remove(), 500); // keep DOM clean
}

const bg = document.getElementById('bg');
const ctx = bg.getContext('2d');

const panoImg = new Image();
panoImg.crossOrigin = "anonymous"; // helps avoid canvas tainting if the server sends CORS headers
panoImg.src = "backpano.png"

// --- Round an image URL into a new PNG (cached) ---
const _roundedCache = new Map();

function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';           // safe if files are same-origin; keeps canvas untainted if CORS is allowed
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

async function roundedImageURL(src, radiusPx = 100){
  const key = `${src}::${radiusPx}`;
  if (_roundedCache.has(key)) return _roundedCache.get(key);

  const img = await loadImage(src);
  const c   = document.createElement('canvas');
  c.width   = img.naturalWidth;
  c.height  = img.naturalHeight;
  const g   = c.getContext('2d');

  // clip to rounded rectangle and draw the original image
  roundRectPath(g, 0, 0, c.width, c.height, radiusPx);
  g.clip();
  g.drawImage(img, 0, 0, c.width, c.height);

  const outURL = c.toDataURL('image/png');   // or toBlob if you prefer object URLs
  _roundedCache.set(key, outURL);
  return outURL;
}


// Build a curved capsule pillar element
function createPillarEl(label, url, planetUrl, revealUrl){
  const wrap = document.createElement('div');
  wrap.className = 'pillar';
  wrap.style.setProperty('--w','220px');
  wrap.style.setProperty('--h','300px');
  wrap.dataset.url = url || '';
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('tabindex', '0');

  // Inner rotator gets 3D transforms
  const rot = document.createElement('div');
  rot.className = 'pillar-rot';

  // Planet PNG
  const planetWrap = document.createElement('div');
  planetWrap.className = 'planet-wrap';
  const planetImg = new Image();
  planetImg.className = 'planet-img';
  planetImg.alt = '';
  planetImg.src = planetUrl || '';
  planetWrap.appendChild(planetImg);

  // Reveal image (overlay) shown on hover
  const reveal = document.createElement('div');
  reveal.className = 'reveal';
  const rimg = new Image();
  rimg.alt = '';
  rimg.src = revealUrl || '';
  reveal.appendChild(rimg);
  planetWrap.appendChild(reveal);

  // Optional plinth (if you still want it)
  const plinth = document.createElement('div');
  plinth.className = 'plinth';

  // Compose rotator
  rot.appendChild(planetWrap);
  rot.appendChild(plinth);

  // Label outside rotator so it never rotates
  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;

  // Compose pillar
  wrap.appendChild(rot);
  wrap.appendChild(labelEl);

  return wrap;
}







// Create pillars
const pillars = [];
for (let i = 0; i < PILLAR_COUNT; i++) {
  const { label, url, planet, reveal } = PROJECTS[i % PROJECTS.length];
  const el = createPillarEl(label, url, planet, reveal);
  viewer.appendChild(el);

  el.addEventListener('mouseenter', () => { el.classList.add('hover'); hoverFreeze = true; });
  el.addEventListener('mouseleave', () => { el.classList.remove('hover'); hoverFreeze = false; });

  pillars.push({ el, baseYaw: (i/PILLAR_COUNT)*Math.PI*2, pitch: -0.05 });
}




const TAU = Math.PI*2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function norm(a){ a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function smoothstep(edge0, edge1, x){ const t = clamp((x-edge0)/(edge1-edge0), 0, 1); return t*t*(3-2*t); }

// Perspective projection for yaw→x. Clamp near the FOV edges to avoid tan() explosion
function projectYawToX(relYaw, w){
  const half  = w / 2;
  const limit = Math.tan(HFOV / 2);
  if (Math.abs(relYaw) >= EDGE_OUTER_NARROW) return relYaw > 0 ? w : 0;
  const nx = Math.tan(relYaw) / limit; // -1..1 within FOV
  return half + nx * half;
}



// Draw the panorama by horizontally panning the image based on yaw
function drawPanorama(){
  const w = bg.width = viewer.clientWidth;
  const h = bg.height = viewer.clientHeight;

  if (!panoImg.complete || panoImg.naturalWidth === 0) {
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'#0a1220'); grad.addColorStop(1,'#0b0f18');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    return { w, h };                // <-- keep this
  }

  const scale = h / panoImg.naturalHeight;
  const drawW = Math.ceil(panoImg.naturalWidth * scale);
  const drawH = h;

  const pxPerRadian = drawW / TAU;
  const total = -bgPhase;    // invert background response to yaw
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

  return { w, h };                  // <-- add this back
}


function render(ts){
  if (!prevTs) prevTs = ts;
  const dt = (ts - prevTs) / 1000; // seconds since last frame
  prevTs = ts;

  if (!dragging && !zooming) {
    if (!hoverFreeze) {
      // pillars keep auto-rotating
      yaw = norm(yaw + autoYawDir * autoSpeed * dt);
    }
  }

  // keep pano strictly opposite to yaw changes
  const dyaw = norm(yaw - prevYawForBg);
  bgPhase = norm(bgPhase - dyaw);
  prevYawForBg = yaw;

  // If pillars are frozen on hover, still let the background drift
  if (!dragging && !zooming && hoverFreeze) {
    bgPhase = norm(bgPhase - autoYawDir * autoSpeed * dt);
  }



  const {w, h} = drawPanorama();

  // Zoom steering + background treatment
  let zoomT = 0;
  if (zooming) {
    zoomT = easeOutCubic(Math.min(1, (performance.now() - zoomStart) / zoomDur));
    // Rotate camera to center the chosen pillar
    yaw = lerpAngle(zoomStartYaw, zoomTargetYaw, zoomT);

    // Cinematic: blur/darken the pano a bit as we dive in
    const blurPx = lerp(0, 6, zoomT);
    const bright = lerp(1, 0.65, zoomT);
    bg.style.filter = `blur(${blurPx}px) brightness(${bright})`;

    // Fade to black in the last 150ms to make the cut seamless
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

    // Navigate when zoom completes
    if (zoomT >= 1 && zoomUrl) {
        const url = zoomUrl; zoomUrl = "";
        window.location.href = url;
        return;
    }
  } else {
    // reset pano filter if not zooming
    bg.style.filter = '';
    const f = document.getElementById('zoom-fader'); if (f) f.style.opacity = '0';
  }

  pillars.forEach(({el, baseYaw, pitch}) => {
    const relRaw    = norm(yaw - (baseYaw + pillarPhase));
    const relScreen = relRaw * PILLAR_SPREAD;

    // Screen placement
    const x = projectYawToX(relScreen, w);
    const y = h * 0.72 + pitch * (h * 1.2);
    el.style.left = x + 'px';
    el.style.top  = y + 'px';

    // Use SCREEN angle for all depth-ish calcs so everything agrees near the rim
    const edgeFrac  = clamp(Math.abs(relScreen)/HFOV, 0, 1);
    const depth     = Math.sin(edgeFrac * Math.PI/2); // 0=centre, 1=edge (your old "depth")
    const frontness = 1 - depth;                      // 1=centre (closest), 0=edge (farthest)

    // Keep your old scale feel (bigger toward edges)
    const scaleBase = 1.1 + 0.5 * depth;

    // ---- Zoom vars (must exist every frame) ----
    let zScaleBoost   = 1.0;
    let zOpacityBoost = 1.0;
    let zTranslateZ   = 0;
    let zZIndexBoost  = 0;

    if (zooming) {
      if (el === zoomPillar) {
        zScaleBoost   = lerp(1.0, ZOOM_MAX_SCALE, zoomT);
        zTranslateZ   = lerp(0,   ZOOM_MAX_Z,     zoomT);
        zZIndexBoost  = 8000;
        zOpacityBoost = 1.0;
      } else {
        zOpacityBoost = lerp(1.0, ZOOM_DIM_OTHERS, zoomT);
      }
    }

    // Rim-only fade to avoid edge popping
    const edgeFade = 1 - smoothstep(EDGE_INNER_NARROW, EDGE_OUTER_NARROW, Math.abs(relScreen));

    // ✨ Constant opacity across FOV; only rim-fade + zoom dim apply
    el.style.opacity = String(edgeFade * zOpacityBoost);

    // Hide completely just outside the clamp rim to avoid “stuck at edge” artifacts
    const outOfRim = Math.abs(relScreen) >= EDGE_OUTER_NARROW;
    el.style.visibility    = outOfRim ? 'hidden' : 'visible';
    el.style.pointerEvents = outOfRim ? 'none'   : '';

    // Stable front-to-back order: centre should be on top.
    // Multiply high so ties are rare, then break ties by side (sign) consistently.
    const rank = Math.round(frontness * 10000) * 2 + (relScreen > 0 ? 1 : 0);
    el.style.zIndex = String(1000 + zZIndexBoost + rank);

    // Transform
    const isHover    = el.classList.contains('hover') && !zooming;
    const hoverBoost = isHover ? 1.08 : 1.0;
    const rotYdeg    = (-relScreen * 180 / Math.PI) * 0.55;

    el.style.transform =
      `translate(-50%,-100%) rotateY(${rotYdeg.toFixed(2)}deg) ` +
      `translateZ(${zTranslateZ.toFixed(1)}px) ` +
      `scale(${(scaleBase * hoverBoost * zScaleBoost).toFixed(3)})`;

    // Plinth: follow the same rim fade (and your old width feel)
    const plinth = el.querySelector('.plinth');
    plinth.style.width   = (220 + 120 * depth) + 'px';
    plinth.style.opacity = (0.25 + 0.55 * depth) * edgeFade;
  });



  requestAnimationFrame(render);
}

// Drag to rotate yaw (horizontal only)
// Drag to rotate yaw (horizontal only)
let dragging = false, lastX = 0;

viewer.addEventListener('mousedown', e=>{
  dragging = true;
  lastX = e.clientX;
  pressX = e.clientX; pressY = e.clientY;  // NEW
  dragDist = 0;                             // NEW
  dragSum = 0;
  viewer.classList.add('dragging');
  dragStartTotal = bgPhase - yaw;
});


window.addEventListener('mouseup', ()=>{
  dragging = false;
  viewer.classList.remove('dragging');

  // decide auto-rotation direction from how much we dragged
  let s;
  if (Math.abs(dragSum) > 2) {
    s = Math.sign(dragSum);        // if we dragged enough, use that direction
  } else if (lastDX !== 0) {
    s = Math.sign(lastDX);         // fallback: last movement direction
  } else {
    s = autoYawDir;                // fallback: keep whatever it was
  }

  autoYawDir = s;   // pillars keep moving in this direction
  autoDir    = -s;  // background keeps moving opposite

  lastDX = 0;
});


window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  lastDX = dx;
  dragDist += Math.abs(dx);                // NEW
  dragSum  += dx;   
  if (!arrowsHidden && Math.abs(dragSum) > CLICK_SLOP) hideArrowsOnce();  // <-- add this line
  yaw = norm(yaw + dx*0.0006);
});

viewer.addEventListener('click', e=>{
  if (dragDist > CLICK_SLOP || zooming) return;

  const pillar = e.target.closest('.pillar');
  if (!pillar) return;
  const url = pillar.dataset.url;
  if (!url) return;

  const rec = pillars.find(p => p.el === pillar);
  if (!rec) return;

  zooming = true;
  document.body.classList.add('zooming');
  zoomPillar = pillar;
  zoomUrl = url;
  zoomStart = performance.now();
  zoomStartYaw = yaw;
  zoomTargetYaw = norm(rec.baseYaw + pillarPhase); // account for pillar rotation

  // prevent stray clicks during the zoom
  viewer.style.pointerEvents = 'none';
  setTimeout(() => { viewer.style.pointerEvents = ''; }, zoomDur + 100);
});



// Touch
viewer.addEventListener('touchstart', e=>{
  const t=e.touches[0]; if(!t) return;
  dragging = true; lastX = t.clientX;
  pressX = t.clientX; pressY = t.clientY;  // NEW
  dragDist = 0;                             // NEW
  dragSum = 0;
  dragStartTotal = bgPhase - yaw;
}, {passive:true});


function endTouch(){
  dragging = false;

  let s;
  if (Math.abs(dragSum) > 2) {
    s = Math.sign(dragSum);
  } else if (lastDX !== 0) {
    s = Math.sign(lastDX);
  } else {
    s = autoYawDir;
  }

  autoYawDir = s;
  autoDir    = -s;

  lastDX = 0;
}

window.addEventListener('touchend', e=>{
  endTouch();

  // NEW: tap-to-open if not a drag
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
  dragDist += Math.abs(dx);                // NEW
  dragSum  += dx;   
  if (!arrowsHidden && Math.abs(dragSum) > CLICK_SLOP) hideArrowsOnce();  // <-- add this line
  yaw = norm(yaw + dx*0.0003);
}, {passive:true});


// Start
panoImg.onload = () => requestAnimationFrame(render);
panoImg.onerror = () => requestAnimationFrame(render);
requestAnimationFrame(render);


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
