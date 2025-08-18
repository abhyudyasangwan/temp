// ===== CONFIG =====
const HFOV = Math.PI/2;
const EDGE_FADE_INNER = HFOV * 0.92;
const EDGE_FADE_OUTER = HFOV * 0.995;
const PILLAR_COUNT = 8;
let yaw = 0;

const viewer = document.getElementById('viewer');
const bg = document.getElementById('bg');
const pillarsLayer = document.getElementById('pillars');
const ctx = bg.getContext('2d');

// Status banner (helps diagnose on Pages)
const banner = document.createElement('div');
banner.style.cssText = `
  position:fixed;left:50%;top:10px;transform:translateX(-50%);
  background:rgba(20,24,40,.85);color:#e6edff;border:1px solid #31406a;
  padding:6px 10px;border-radius:10px;font:600 12px system-ui;z-index:5;display:none`;
document.body.appendChild(banner);
function say(msg){ banner.textContent = msg; banner.style.display = 'inline-block'; }

// IMPORTANT: put your stitched panorama as pano.jpg in the repo root
const panoImg = new Image();
panoImg.onload = () => { say(''); banner.style.display='none'; start(); };
panoImg.onerror = () => { say('pano.jpg not found — using fallback background'); start(); };
panoImg.src = 'pano.jpg';

// Build a curved capsule pillar element
function createPillarEl(label){
  const wrap = document.createElement('div');
  wrap.className = 'pillar';
  wrap.style.setProperty('--w','170px');
  wrap.style.setProperty('--h','260px');

  const cap = document.createElement('div'); cap.className = 'capsule';
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
  const el = createPillarEl('Project ' + (i+1));
  pillarsLayer.appendChild(el);
  pillars.push({ el, baseYaw: (i/PILLAR_COUNT)*Math.PI*2, pitch: -0.05 });
}

const TAU = Math.PI*2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function norm(a){ a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function smoothstep(edge0, edge1, x){ const t = clamp((x-edge0)/(edge1-edge0), 0, 1); return t*t*(3-2*t); }

// Perspective projection for yaw→x
function projectYawToX(relYaw, w){
  const half = w/2;
  const limit = Math.tan(HFOV/2);
  if (Math.abs(relYaw) >= EDGE_FADE_OUTER) return relYaw > 0 ? w : 0;
  const nx = Math.tan(relYaw)/limit; // -1..1 within FOV
  return half + nx*half;
}

// Draw the panorama by horizontally panning the image based on yaw
function drawPanorama(){
  const w = bg.width = viewer.clientWidth;
  const h = bg.height = viewer.clientHeight;

  if (!panoImg.complete || panoImg.naturalWidth === 0) {
    // BRIGHT fallback so it never looks pure black
    const g1 = ctx.createLinearGradient(0,0,0,h);
    g1.addColorStop(0,'#0e1a3a');
    g1.addColorStop(0.5,'#12224e');
    g1.addColorStop(1,'#0b1230');
    ctx.fillStyle = g1; ctx.fillRect(0,0,w,h);
    return {w, h};
  }

  const scale = h / panoImg.naturalHeight;
  const drawW = Math.ceil(panoImg.naturalWidth * scale);
  const drawH = h;
  const pxPerRadian = drawW / TAU;

  let offset = Math.round(-yaw * pxPerRadian) % drawW;
  if (offset < 0) offset += drawW;

  let x = -offset;
  while (x < w) {
    ctx.drawImage(panoImg, 0,0, panoImg.naturalWidth, panoImg.naturalHeight, x, 0, drawW, drawH);
    x += drawW;
  }
  return {w, h};
}

function render(){
  const {w, h} = drawPanorama();

  pillars.forEach(({el, baseYaw, pitch}) => {
    const rel = norm(baseYaw - yaw);

    const x = projectYawToX(rel, w);
    const y = h*0.66 + pitch * (h*1.2);
    el.style.left = x + 'px';
    el.style.top  = y + 'px';

    const edgeFrac = clamp(Math.abs(rel)/HFOV, 0, 1);
    const depth = Math.sin(edgeFrac * Math.PI/2);
    const scale = 0.72 + 0.58*depth;
    const fade = 1 - smoothstep(EDGE_FADE_INNER, EDGE_FADE_OUTER, Math.abs(rel));
    const opacity = (0.6 + 0.4*depth) * fade;
    const rotYdeg = (-rel*180/Math.PI) * 0.55;

    el.style.opacity = opacity.toFixed(3);
    el.style.zIndex = String(1000 + Math.round(depth*200));
    el.style.transform = `translate(-50%,-100%) scale(${scale.toFixed(3)}) rotateY(${rotYdeg.toFixed(2)}deg)`;

    const plinth = el.querySelector('.plinth');
    plinth.style.width = (220 + 120*depth) + 'px';
    plinth.style.opacity = (0.25 + 0.55*depth) * fade;

    el.querySelector('.top-dome').style.opacity = (0.75 + 0.25*depth).toFixed(2);
    el.querySelector('.bottom-shade').style.opacity = (0.75 + 0.25*depth).toFixed(2);
  });

  requestAnimationFrame(render);
}

function start(){
  requestAnimationFrame(render);
}

// Drag to rotate yaw (horizontal only)
let dragging = false, lastX = 0;
viewer.addEventListener('mousedown', e=>{ dragging = true; lastX = e.clientX; viewer.classList.add('dragging'); });
window.addEventListener('mouseup', ()=>{ dragging = false; viewer.classList.remove('dragging'); });
window.addEventListener('mousemove', e=>{ if(!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw = norm(yaw - dx*0.003); });

// Touch
viewer.addEventListener('touchstart', e=>{ const t=e.touches[0]; if(!t) return; dragging=true; lastX=t.clientX; }, {passive:true});
window.addEventListener('touchend', ()=>{ dragging=false; }, {passive:true});
window.addEventListener('touchcancel', ()=>{ dragging=false; }, {passive:true});
window.addEventListener('touchmove', e=>{ if(!dragging) return; const t=e.touches[0]; if(!t) return; const dx=t.clientX-lastX; lastX=t.clientX; yaw = norm(yaw - dx*0.003); }, {passive:true});
