const canvas = document.getElementById("pano");
const ctx = canvas.getContext("2d");
const pillarsDiv = document.getElementById("pillars");

let panoImg = new Image();
panoImg.src = "pano.jpg"; // <--- place your stitched panorama here

const PILLAR_COUNT = 8;
const HFOV = Math.PI / 2; // horizontal FOV
let yaw = 0;

let dragging = false, lastX = 0, yawVel = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Create pillar elements
let pillars = [];
for (let i = 0; i < PILLAR_COUNT; i++) {
  let pillar = document.createElement("div");
  pillar.className = "pillar";
  pillar.innerHTML = `<div class="capsule"></div><div class="label">Project ${i+1}</div>`;
  pillarsDiv.appendChild(pillar);
  pillars.push({el: pillar, baseYaw: i / PILLAR_COUNT * 2 * Math.PI});
}

// Normalize angle into [-π, π]
function norm(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function drawPanorama() {
  let w = canvas.width, h = canvas.height;
  let imgW = panoImg.width, imgH = panoImg.height;
  if (!imgW) return;

  let drawH = h;
  let drawW = imgW * (drawH / imgH);

  let pxPerRad = drawW / (2 * Math.PI);
  let offset = Math.round(-(yaw) * pxPerRad) % drawW;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(panoImg, offset, 0, drawW, drawH);
  if (offset > 0) ctx.drawImage(panoImg, offset - drawW, 0, drawW, drawH);
  if (offset + drawW < w) ctx.drawImage(panoImg, offset + drawW, 0, drawW, drawH);
}

function updatePillars() {
  let w = window.innerWidth, h = window.innerHeight, horizon = h * 0.65;

  pillars.forEach((p, i) => {
    let rel = norm(p.baseYaw - yaw);
    if (Math.abs(rel) > Math.PI / 2) {
      p.el.style.display = "none";
      return;
    }
    p.el.style.display = "block";

    let x = w / 2 + (w/2) * Math.tan(rel) / Math.tan(HFOV/2);
    let depth = Math.sin(Math.min(Math.abs(rel) / HFOV, 1) * Math.PI / 2);
    let scale = 0.72 + 0.58 * depth;
    let zIndex = 100 + Math.round(depth * 100);

    p.el.style.transform = `translateX(${x - 40}px) translateY(${horizon - 200*scale}px) scale(${scale})`;
    p.el.style.zIndex = zIndex;
    p.el.style.opacity = 0.3 + 0.7 * depth;
  });
}

function animate() {
  drawPanorama();
  updatePillars();

  yaw += yawVel;
  yawVel *= 0.95; // inertia decay
  requestAnimationFrame(animate);
}
animate();

// Dragging controls
canvas.addEventListener("mousedown", e => { dragging = true; lastX = e.clientX; });
canvas.addEventListener("mouseup", () => dragging = false);
canvas.addEventListener("mouseleave", () => dragging = false);
canvas.addEventListener("mousemove", e => {
  if (dragging) {
    let dx = e.clientX - lastX;
    yaw -= dx / 500;
    yawVel = -(dx / 500);
    lastX = e.clientX;
  }
});

// Touch
canvas.addEventListener("touchstart", e => { dragging = true; lastX = e.touches[0].clientX; });
canvas.addEventListener("touchend", () => dragging = false);
canvas.addEventListener("touchmove", e => {
  if (dragging) {
    let dx = e.touches[0].clientX - lastX;
    yaw -= dx / 500;
    yawVel = -(dx / 500);
    lastX = e.touches[0].clientX;
  }
});
