const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const result = document.getElementById('result');
const roseRain = document.getElementById('roseRain');
const roseContainer = document.querySelector('.rose-container');

// Function to create a rotating rose
function createRose() {
  const rose = document.createElement('div');
  rose.innerHTML = '🌹';
  rose.classList.add('rose-3d');
  
  // Random position for the rose
  const x = Math.random() * 80 + 10; // Avoid edges
  const y = Math.random() * 80 + 10; // Avoid edges
  rose.style.left = `${x}%`;
  rose.style.top = `${y}%`;
  
  // Random size for variety
  const size = Math.random() * 4 + 4; // Between 4rem and 8rem
  rose.style.fontSize = `${size}rem`;
  
  roseContainer.appendChild(rose);
}

// Create multiple roses
for (let i = 0; i < 70; i++) { // Adjust the number of roses as needed
  createRose();
}

// Rest of your existing JavaScript
yesBtn.addEventListener('click', () => {
  result.textContent = "YAYYY! Love You Jaan 🌹";
  document.body.style.background = "#ffd1dc";
  
  const rainInterval = setInterval(createPetal, 100);
  document.body.classList.add('sparkle');
  setTimeout(() => clearInterval(rainInterval), 5000);
});

noBtn.addEventListener('click', () => {
  const darkPage = document.createElement('div');
  darkPage.classList.add('dark-page');
  darkPage.innerHTML = '💔 The Rose Wilted... 💔';
  document.body.innerHTML = '';
  document.body.appendChild(darkPage);
});

function createPetal() {
  const petal = document.createElement('div');
  petal.innerHTML = '🌸';
  petal.classList.add('rose-petal');
  petal.style.left = Math.random() * 100 + 'vw';
  petal.style.animationDuration = Math.random() * 3 + 2 + 's';
  roseRain.appendChild(petal);
  
  setTimeout(() => petal.remove(), 5000);
}