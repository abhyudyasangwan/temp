// ===== CONFIG =====
const HFOV = Math.PI/2;                 // 90° horizontal FOV
const PILLAR_COUNT = 8;                 // fixed circular layout
let yaw = 0;                            // camera heading (only thing that changes)

const viewer = document.getElementById('viewer');
const bg = document.getElementById('bg');
const pillarsLayer = document.getElementById('pillars');
const ctx = bg.getContext('2d');

// Put your stitched panorama as pano.jpg in the repo root
const panoImg = new Image();
panoImg.src = 'pano.jpg';

// Build a capsule pillar element (purely visual; no yaw-driven scaling/rotation)
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

// Create pillars at fixed world angles
aaa:
const pillars = [];
for (let i = 0; i < PILLAR_COUNT; i++) {
  const el = createPillarEl('Project ' + (i+1));
  pillarsLayer.appendChild(el);
  pillars.push({ el, baseYaw: (i/PILLAR_COUNT)*Math.PI*2, pitch: -0.05 });
}

const TAU = Math.PI*2;
function norm(a){ a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

// Draw panorama and return mapping details
function drawPanorama(){
  const w = bg.width = viewer.clientWidth;
  const h = bg.height = viewer.clientHeight;

  if (!panoImg.complete || panoImg.naturalWidth === 0) {
    // fallback gradient (so never pure black)
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#0e1a3a'); g.addColorStop(0.5,'#132656'); g.addColorStop(1,'#0b1230');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    return {w,h,drawW:w,pxPerRadian:w/TAU,offset:0};
  }

  // Scale pano to viewport height
  const scale = h / panoImg.naturalHeight;
  const drawW = Math.ceil(panoImg.naturalWidth * scale);
  const drawH = h;

  // Pixels per radian along the pano
  const pxPerRadian = drawW / TAU;

  // Horizontal offset based on camera yaw (wrap seamlessly)
  let offset = Math.round(-yaw * pxPerRadian) % drawW; if (offset < 0) offset += drawW;

  // Tile to cover viewport
  let x = -offset;
  while (x < w) {
    ctx.drawImage(panoImg, 0,0, panoImg.naturalWidth, panoImg.naturalHeight, x, 0, drawW, drawH);
    x += drawW;
  }
  return {w,h,drawW,pxPerRadian,offset};
}

function render(){
  const map = drawPanorama();
  const {w,h,drawW,pxPerRadian,offset} = map;
  const horizonY = h * 0.66;

  // Position each pillar using the SAME mapping as the pano: x = -offset + baseYaw*px/rad (wrapped)
  pillars.forEach(({el, baseYaw, pitch}) => {
    let x = -offset + baseYaw * pxPerRadian;
    // wrap into viewport neighborhood
    while (x < -50) x += drawW;
    while (x > w+50) x -= drawW;

    const y = horizonY + pitch * (h*1.2);
    el.style.left = x + 'px';
    el.style.top  = y + 'px';

    // Keep appearance constant (no yaw-based scaling/rotation)
    el.style.opacity = '1';
    el.style.zIndex = '2';
    el.style.transform = 'translate(-50%,-100%)';
  });

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

// Start loop
function start(){ requestAnimationFrame(render); }
if (panoImg.complete) start(); else { panoImg.onload = start; panoImg.onerror = start; }
