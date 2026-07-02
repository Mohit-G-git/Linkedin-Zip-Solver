/**
 * ============================================================
 *  LinkedIn ZIP Solver - Content Script
 *  Runs on: https://www.linkedin.com/games/zip/*
 *
 *  Responsibilities:
 *    1. Parse the puzzle grid from the DOM
 *    2. Send grid data to the background service worker
 *    3. Animate the returned solution path
 * ============================================================
 */

// ------------------------------------------------------------
//  SMART GRID FINDER
//  Detects the game grid by scanning for CSS Grid containers
//  with uniform children -- no hardcoded class names needed.
// ------------------------------------------------------------
function findGrid() {
  const allEls = Array.from(document.querySelectorAll('*'));

  for (const el of allEls) {
    const style   = window.getComputedStyle(el);
    const display = style.display;
    if (display !== 'grid' && display !== 'inline-grid') continue;

    const children = Array.from(el.children).filter(c => {
      const cs = window.getComputedStyle(c);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

    const n = children.length;
    if (n < 9 || n > 100) continue;

    // Check that children have similar widths (true grid cells)
    const widths = children.slice(0, 4).map(c => c.getBoundingClientRect().width).filter(w => w > 5);
    if (widths.length < 2) continue;
    const avg    = widths.reduce((a, b) => a + b, 0) / widths.length;
    if (!widths.every(w => Math.abs(w - avg) < avg * 0.3)) continue;

    // Infer columns from grid-template-columns
    const tpl  = style.getPropertyValue('grid-template-columns');
    const cols = tpl.trim().split(/\s+/).filter(Boolean).length || Math.round(Math.sqrt(n));
    const rows = Math.ceil(n / cols);

    console.log(`[ZIP Solver] Grid found: ${rows}x${cols}, ${n} cells`);
    return { cellEls: children, rows, cols };
  }

  throw new Error('ZIP grid not found. Is the puzzle fully loaded?');
}

// ------------------------------------------------------------
//  GRID PARSER
// ------------------------------------------------------------
function parseGrid() {
  const { cellEls, rows, cols } = findGrid();

  // Build 2-D array
  const cellEls2D = [];
  for (let r = 0; r < rows; r++)
    cellEls2D.push(Array.from(cellEls).slice(r * cols, r * cols + cols));

  // Extract numbers  (0 = empty cell)
  const numbers = new Int32Array(rows * cols);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const num = parseInt(cellEls2D[r][c].textContent.trim(), 10);
      numbers[r * cols + c] = isNaN(num) ? 0 : num;
    }

  const numCount = Array.from(numbers).filter(n => n > 0).length;
  console.log(`[ZIP Solver] Numbers found: ${numCount}`, Array.from(numbers));

  // Extract walls (thick borders = walls)
  const hWalls = new Uint8Array(rows * cols).fill(0);
  const vWalls = new Uint8Array(rows * cols).fill(0);
  const WALL   = 3; // px threshold

  function bpx(el, side) {
    return parseFloat(window.getComputedStyle(el)[`border-${side}-width`]) || 0;
  }

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const el = cellEls2D[r][c];
      if (r < rows - 1 && Math.max(bpx(el, 'bottom'), bpx(cellEls2D[r+1][c], 'top')) >= WALL)
        hWalls[r * cols + c] = 1;
      if (c < cols - 1 && Math.max(bpx(el, 'right'), bpx(cellEls2D[r][c+1], 'left')) >= WALL)
        vWalls[r * cols + c] = 1;
    }

  return { rows, cols, numbers, hWalls, vWalls, cellEls2D, numCount };
}

// ------------------------------------------------------------
//  PATH ANIMATOR
//  Delegates to background.js to use the Chrome Debugger API (CDP).
//  Injects genuine, trusted mouse events at the OS level,
//  bypassing all overlapping elements, pointer-capture loss,
//  and React event delegation issues.
// ------------------------------------------------------------
async function animatePath(path, cellEls2D, cols) {
  if (path.length === 0) { showOverlay('No solution found', 'error'); return; }

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Collect screen coordinates for the entire path
  const points = path.map(idx => {
    const el = cellEls2D[Math.floor(idx / cols)][idx % cols];
    return center(el);
  });

  const res = await chrome.runtime.sendMessage({
    action: 'ANIMATE_CDP',
    points
  });

  if (!res.ok) {
    throw new Error(res.error || 'CDP animation failed');
  }

  await delay(400);
  showOverlay('Solved', 'success');
}

// ------------------------------------------------------------
//  HELPERS
// ------------------------------------------------------------
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function showOverlay(msg, type = 'info') {
  let el = document.getElementById('zip-solver-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zip-solver-overlay';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className   = `zip-solver-overlay zip-solver-overlay--${type}`;
  setTimeout(() => el.remove(), 3500);
}

// ------------------------------------------------------------
//  MESSAGE LISTENER
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // GET_INFO: popup asks for grid stats
  if (msg.action === 'GET_INFO') {
    try {
      const { rows, cols, numCount } = parseGrid();
      sendResponse({ ok: true, rows, cols, numCount });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }

  // SOLVE: parse grid -> send to background worker -> animate
  if (msg.action === 'SOLVE') {
    (async () => {
      try {
        showOverlay('Reading puzzle...', 'info');
        const { rows, cols, numbers, hWalls, vWalls, cellEls2D } = parseGrid();

        showOverlay('Solving...', 'info');

        // Send plain arrays (structured-clone safe) to background service worker
        const result = await chrome.runtime.sendMessage({
          action  : 'SOLVE_WASM',
          rows,
          cols,
          numbers : Array.from(numbers),
          hWalls  : Array.from(hWalls),
          vWalls  : Array.from(vWalls)
        });

        if (!result.ok) throw new Error(result.error || 'Solver failed');

        showOverlay('Drawing solution...', 'info');
        await animatePath(result.path, cellEls2D, cols);

        sendResponse({ ok: true, steps: result.path.length });
      } catch (err) {
        console.error('[ZIP Solver]', err);
        showOverlay(err.message, 'error');
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});
