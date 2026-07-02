/* ============================================================
   LinkedIn ZIP Solver - Popup Script
   Checks whether the active tab is a LinkedIn ZIP page,
   then dispatches the SOLVE message to the content script.
   ============================================================ */

const ZIP_URL_PATTERN = /linkedin\.com\/games\/zip/i;

// DOM references
const gameDetectedEl = document.getElementById('game-detected');
const gridSizeEl     = document.getElementById('grid-size');
const numCountEl     = document.getElementById('num-count');
const statusBadge    = document.getElementById('status-badge');
const btnSolve       = document.getElementById('btn-solve');
const btnLabel       = document.getElementById('btn-label');
const stepsWrap      = document.getElementById('steps-wrap');
const stepsValue     = document.getElementById('steps-value');

// Detect active tab and initialise the popup
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !ZIP_URL_PATTERN.test(tab.url || '')) {
    gameDetectedEl.textContent = 'Not on ZIP page';
    gameDetectedEl.style.color = '#f87171';
    return;
  }

  gameDetectedEl.textContent = 'ZIP detected';
  gameDetectedEl.style.color = '#4ade80';

  // Query the content script for live grid info
  try {
    const info = await chrome.tabs.sendMessage(tab.id, { action: 'GET_INFO' });
    if (info && info.ok) {
      gridSizeEl.textContent = `${info.rows} x ${info.cols}`;
      numCountEl.textContent = info.numCount;
    } else {
      gridSizeEl.textContent = 'Load puzzle and retry';
      numCountEl.textContent = '-';
    }
  } catch {
    // Content script not yet injected or puzzle not loaded
    gridSizeEl.textContent = 'Load puzzle and retry';
    numCountEl.textContent = '-';
  }

  btnSolve.disabled = false;

  btnSolve.addEventListener('click', async () => {
    setWorking(true);

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'SOLVE' });
      if (response?.ok) {
        setStatus('Solved', 'success');
        stepsWrap.hidden = false;
        stepsValue.textContent = response.steps + ' steps';
      } else {
        setStatus('Error', 'error');
      }
    } catch (err) {
      setStatus('Error', 'error');
      console.error('[ZIP Solver Popup]', err);
    } finally {
      setWorking(false);
    }
  });
}

function setWorking(on) {
  btnSolve.disabled = on;
  if (on) {
    btnLabel.textContent = 'Solving...';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.id = 'popup-spinner';
    btnSolve.prepend(spinner);
    setStatus('Working', 'working');
  } else {
    btnLabel.textContent = 'Solve Puzzle';
    document.getElementById('popup-spinner')?.remove();
  }
}

function setStatus(text, type) {
  statusBadge.textContent = text;
  statusBadge.className = `badge badge--${type}`;
}

init();
