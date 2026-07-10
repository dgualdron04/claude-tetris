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

const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const startScoresList = document.getElementById('start-scores-list');
const startBestCombo = document.getElementById('start-best-combo');
const startBestLines = document.getElementById('start-best-lines');
const startResetScoresBtn = document.getElementById('start-reset-scores-btn');

const newRecordForm = document.getElementById('new-record-form');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayScoresPanel = document.getElementById('overlay-scores-panel');
const overlayScoresList = document.getElementById('overlay-scores-list');
const overlayBestCombo = document.getElementById('overlay-best-combo');
const overlayBestLines = document.getElementById('overlay-best-lines');
const overlayResetScoresBtn = document.getElementById('overlay-reset-scores-btn');

const THEME_KEY = 'tetris-theme';
const SCORES_KEY = 'tetris-scores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const BEST_LINES_KEY = 'tetris-best-lines';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;

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

function loadScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScoresList(list) {
  localStorage.setItem(SCORES_KEY, JSON.stringify(list));
}

function loadBestCombo() {
  return Number(localStorage.getItem(BEST_COMBO_KEY)) || 0;
}

function loadBestLines() {
  return Number(localStorage.getItem(BEST_LINES_KEY)) || 0;
}

function updateBestStats() {
  if (maxCombo > loadBestCombo()) localStorage.setItem(BEST_COMBO_KEY, String(maxCombo));
  if (lines > loadBestLines()) localStorage.setItem(BEST_LINES_KEY, String(lines));
}

// Devuelve la posición (0-indexed) que ocuparía scoreVal en la lista ordenada
// desc si entra en el top 5, o -1 si no entra.
function computeTopIndex(list, scoreVal) {
  let idx = list.findIndex(e => scoreVal > e.score);
  if (idx === -1) idx = list.length;
  return idx < MAX_SCORES ? idx : -1;
}

function insertScore(name, scoreVal) {
  const list = loadScores();
  const idx = computeTopIndex(list, scoreVal);
  if (idx === -1) return { list, idx: -1 };
  list.splice(idx, 0, { name, score: scoreVal });
  const trimmed = list.slice(0, MAX_SCORES);
  saveScoresList(trimmed);
  return { list: trimmed, idx };
}

function resetScores() {
  localStorage.removeItem(SCORES_KEY);
  localStorage.removeItem(BEST_COMBO_KEY);
  localStorage.removeItem(BEST_LINES_KEY);
  refreshScoresUI();
}

function renderScoresList(listEl, list, highlightIdx) {
  listEl.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'scores-empty';
    li.textContent = 'Sin puntuaciones aún';
    listEl.appendChild(li);
    return;
  }
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'scores-row' + (i === highlightIdx ? ' highlight' : '');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'scores-name';
    nameSpan.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'scores-value';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    listEl.appendChild(li);
  });
}

function refreshScoresUI(highlightIdx = -1) {
  const list = loadScores();
  renderScoresList(startScoresList, list, highlightIdx);
  renderScoresList(overlayScoresList, list, highlightIdx);
  const bestCombo = loadBestCombo();
  const bestLines = loadBestLines();
  startBestCombo.textContent = bestCombo;
  startBestLines.textContent = bestLines;
  overlayBestCombo.textContent = bestCombo;
  overlayBestLines.textContent = bestLines;
}

startResetScoresBtn.addEventListener('click', resetScores);
overlayResetScoresBtn.addEventListener('click', resetScores);

saveScoreBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim().slice(0, 12) || 'Jugador';
  const { idx } = insertScore(name, score);
  newRecordForm.classList.add('hidden');
  refreshScoresUI(idx);
});

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScoreBtn.click();
});

playBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

  updateBestStats();

  const list = loadScores();
  const idx = computeTopIndex(list, score);
  if (idx !== -1) {
    newRecordForm.classList.remove('hidden');
    playerNameInput.value = '';
  } else {
    newRecordForm.classList.add('hidden');
  }
  overlayScoresPanel.classList.remove('hidden');
  refreshScoresUI(-1);

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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  newRecordForm.classList.add('hidden');
  overlayScoresPanel.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (!current) return; // el juego aún no ha arrancado (pantalla de inicio)
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

initTheme();
refreshScoresUI();
