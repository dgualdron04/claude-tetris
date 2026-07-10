'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // 8 - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // tuerca (anillo 3x3, centro hueco)
];

const NUT_TYPE = 8;
const NUT_CHANCE = 0.06; // probabilidad de que salga la tuerca (reto raro)

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Skins visuales ----
// Cada skin define su propia paleta de 9 colores (índice 0 = null, 1-7 piezas, 8 = tuerca)
// y un fondo opcional de canvas (null = usa var(--board-bg) del tema actual).
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    background: null,
  },
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00fff2', // I - cyan neón
      '#faff00', // O - amarillo neón
      '#ff00f7', // T - magenta neón
      '#00ff5e', // S - verde neón
      '#ff2d55', // Z - rojo neón
      '#2979ff', // J - azul neón
      '#ff9100', // L - naranja neón
      '#e0e0e0', // 8 - tuerca (gris brillante)
    ],
    background: '#000000',
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#a8dadc', // I - celeste pastel
      '#ffe8a3', // O - amarillo pastel
      '#d8bfd8', // T - lila pastel
      '#b5e5c8', // S - verde pastel
      '#f7b8b8', // Z - rosa pastel
      '#bcd4f7', // J - azul pastel
      '#ffd6a5', // L - naranja pastel
      '#d9d9e3', // 8 - tuerca (gris pastel)
    ],
    background: null,
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS,
    background: null,
  },
};

let currentSkin = 'retro';
const SKIN_KEY = 'tetris-skin';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  themeToggle.checked = isLight;
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) === 'light');
}

themeToggle.addEventListener('change', () => {
  const isLight = themeToggle.checked;
  applyTheme(isLight);
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
});

function populateSkinSelect() {
  skinSelect.innerHTML = '';
  for (const key of Object.keys(SKINS)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = SKINS[key].label;
    skinSelect.appendChild(option);
  }
}

function applySkin(skinName) {
  currentSkin = SKINS[skinName] ? skinName : 'retro';
  skinSelect.value = currentSkin;
}

function initSkin() {
  populateSkinSelect();
  applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem(SKIN_KEY, currentSkin);
  draw();
  drawNext();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < NUT_CHANCE ? NUT_TYPE : Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin] || SKINS.retro;
  const color = skin.colors[colorIndex];
  const a = alpha ?? 1;
  switch (currentSkin) {
    case 'neon':
      drawBlockNeon(context, x, y, color, size, a);
      break;
    case 'pastel':
      drawBlockPastel(context, x, y, color, size, a);
      break;
    case 'pixel':
      drawBlockPixel(context, x, y, color, size, a);
      break;
    default:
      drawBlockRetro(context, x, y, color, size, a);
  }
}

function drawBlockRetro(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.shadowBlur = size * 0.4;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  // segundo paso sin sombra para reforzar el color del núcleo
  context.shadowBlur = 0;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  context.restore();
}

function drawRoundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlockPastel(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  const r = Math.min(6, w / 3, h / 3);
  drawRoundedRectPath(context, px, py, w, h, r);
  context.fillStyle = color;
  context.fill();
  // highlight superior recortado a la forma redondeada
  context.clip();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, w, h / 3);
  context.restore();
}

function drawBlockPixel(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, w, h);
  // dithering 4x4 simulando textura pixel art
  const sub = 4;
  const subW = w / sub;
  const subH = h / sub;
  for (let sr = 0; sr < sub; sr++) {
    for (let sc = 0; sc < sub; sc++) {
      const light = (sr + sc) % 2 === 0;
      context.fillStyle = light ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      context.fillRect(px + sc * subW, py + sr * subH, subW, subH);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  context.restore();
}

function drawNutHole(context, cellX, cellY, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.beginPath();
  context.arc(cellX * size + size / 2, cellY * size + size / 2, size * 0.32, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const skinBg = (SKINS[currentSkin] || SKINS.retro).background;
  if (skinBg) {
    ctx.fillStyle = skinBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      if (isNutHole(r, c)) drawNutHole(ctx, c, r, BLOCK);
    }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT_TYPE) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT_TYPE) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
}

function isNutHole(r, c) {
  if (board[r][c] !== 0) return false;
  return (
    r > 0 && board[r - 1][c] === NUT_TYPE &&
    r < ROWS - 1 && board[r + 1][c] === NUT_TYPE &&
    c > 0 && board[r][c - 1] === NUT_TYPE &&
    c < COLS - 1 && board[r][c + 1] === NUT_TYPE
  );
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const skinBg = (SKINS[currentSkin] || SKINS.retro).background;
  if (skinBg) {
    nextCtx.fillStyle = skinBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT_TYPE) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) {
        draw();
        return;
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  initTheme();
  initSkin();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
