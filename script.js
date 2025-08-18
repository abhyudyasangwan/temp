const HFOV = Math.PI/2;                  // 90° horizontal FOV
const EDGE_FADE_INNER = HFOV * 0.92;     // for smooth fade near edges
const EDGE_FADE_OUTER = HFOV * 0.995;    // clamp
const PILLAR_COUNT = 8;                  // fixed circular layout
let yaw = 0;                             // camera heading

const viewer = document.getElementById('viewer');
const bg = document.getElementById('bg');
const ctx = bg.getContext('2d');

// Load panorama (fixed background)
const panoImg = new Image();
panoImg.crossOrigin = "anonymous"; // helps avoid canvas tainting if the server sends CORS headers
panoImg.src = "https://raw.githubusercontent.com/abhyudyasangwan/temp/main/yruh.jpg";

// Build a curved capsule pillar element
function createPillarEl(label){
  const wrap = document.createElement('div');
  wrap.className = 'pillar';
  wrap.style.setProperty('--w','170px');
  wrap.style.setProperty('--h','260px');

  const cap = document.createElement('div');
  cap.className = 'capsule';

  const body = document.createElement('div'); body.className = 'body';
  const topDome = document.createElement('div'); topDome.className = 'top-dome';
  const edgeL = document.createElement('div'); edgeL.className = 'edgeL';
  const edgeR = document.createElement('div'); edgeR.className = 'edgeR';
  const bottomShade = document.createElement('div'); bottomShade.className = 'bottom-shade';

  const labelEl = document.createElement('div'); labelEl.className='label'; labelEl.textContent = label;
  const plinth = document.createElement('div'); plinth.className='plinth';

  cap.appendChild(body); cap.appendChild(topDome); cap.appendChild(edgeL); cap.appendChild(edgeR); cap.appendChild(bottomShade);
  wrap.appendChild(cap); wrap.appendChild(labelEl); wrap.appendChild(plinth);
  return wrap;
}

// Create pillars
const pillars = [];
for (let i = 0; i < PILLAR_COUNT; i++) {
  const el = createPillarEl('P' + (i+1));
  viewer.appendChild(el);
  pillars.push({ el, baseYaw: (i/PILLAR_COUNT)*Math.PI*2, pitch: -0.05 });
}

const TAU = Math.PI*2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function norm(a){ a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function smoothstep(edge0, edge1, x){ const t = clamp((x-edge0)/(edge1-edge0), 0, 1); return t*t*(3-2*t); }

// Perspective projection for yaw→x. Clamp near the FOV edges to avoid tan() explosion
function projectYawToX(relYaw, w){
  const half = w/2;
  const limit = Math.tan(HFOV/2);
  if (Math.abs(relYaw) >= EDGE_FADE_OUTER) return relYaw > 0 ? w : 0;
  const nx = Math.tan(relYaw)/limit; // -1..1 within FOV
  return half + nx*half;
}

// Draw the panorama — FIXED background (no horizontal panning with yaw)
function drawPanorama(){
  const w = bg.width = viewer.clientWidth;
  const h = bg.height = viewer.clientHeight;
  if (!panoImg.complete || panoImg.naturalWidth === 0) {
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'#0a1220'); grad.addColorStop(1,'#0b0f18');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    return {w, h};
  }
  // Scale to fit height (like before), but DO NOT offset by yaw; just center it
  const scale = h / panoImg.naturalHeight;
  const drawW = Math.ceil(panoImg.naturalWidth * scale);
  const drawH = h;
  const x0 = Math.floor((w - drawW) / 2);
  ctx.clearRect(0,0,w,h);
  ctx.drawImage(panoImg, 0,0, panoImg.naturalWidth, panoImg.naturalHeight, x0, 0, drawW, drawH);
  return {w, h};
}

function render(){
  const {w, h} = drawPanorama();

  pillars.forEach(({el, baseYaw, pitch}) => {
    const rel = norm(baseYaw - yaw);

    // Screen placement
    const x = projectYawToX(rel, w);
    const y = h*0.66 + pitch * (h*1.2); // slightly above horizon
    el.style.left = x + 'px';
    el.style.top  = y + 'px';

    // Depth cues (center far, edges close)
    const edgeFrac = clamp(Math.abs(rel)/HFOV, 0, 1);
    const depth = Math.sin(edgeFrac * Math.PI/2);
    const scale = 0.72 + 0.58*depth;
    const fade = 1 - smoothstep(EDGE_FADE_INNER, EDGE_FADE_OUTER, Math.abs(rel));
    const opacity = (0.6 + 0.4*depth) * fade;
    const rotYdeg = (-rel*180/Math.PI) * 0.55; // keep same turning look

    el.style.opacity = opacity.toFixed(3);
    el.style.zIndex = String(1000 + Math.round(depth*200));
    el.style.transform = `translate(-50%,-100%) scale(${scale.toFixed(3)}) rotateY(${rotYdeg.toFixed(2)}deg)`;

    // Adjust plinth size + darkness with proximity
    const plinth = el.querySelector('.plinth');
    plinth.style.width = (220 + 120*depth) + 'px';
    plinth.style.opacity = (0.25 + 0.55*depth) * fade;

    // Top-dome highlight intensity tracks proximity for punchy specular
    const topDome = el.querySelector('.top-dome');
    topDome.style.opacity = (0.75 + 0.25*depth).toFixed(2);

    // Bottom shading slightly deepens with depth
    const bottomShade = el.querySelector('.bottom-shade');
    bottomShade.style.opacity = (0.75 + 0.25*depth).toFixed(2);
  });

  requestAnimationFrame(render);
}

// Drag to rotate yaw — VERY SLOW sensitivity
let dragging = false, lastX = 0;
const DRAG_SENS = 0.0000006; // was 0.003 → ~5x slower

viewer.addEventListener('mousedown', e=>{ dragging = true; lastX = e.clientX; viewer.classList.add('dragging'); });
window.addEventListener('mouseup', ()=>{ dragging = false; viewer.classList.remove('dragging'); });
window.addEventListener('mousemove', e=>{ if(!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw = norm(yaw - dx*DRAG_SENS); });

// Touch
viewer.addEventListener('touchstart', e=>{ const t=e.touches[0]; if(!t) return; dragging=true; lastX=t.clientX; }, {passive:true});
window.addEventListener('touchend', ()=>{ dragging=false; }, {passive:true});
window.addEventListener('touchcancel', ()=>{ dragging=false; }, {passive:true});
window.addEventListener('touchmove', e=>{ if(!dragging) return; const t=e.touches[0]; if(!t) return; const dx=t.clientX-lastX; lastX=t.clientX; yaw = norm(yaw - dx*DRAG_SENS); }, {passive:true});

// Start
panoImg.onload = () => requestAnimationFrame(render);
panoImg.onerror = () => requestAnimationFrame(render);
requestAnimationFrame(render);
