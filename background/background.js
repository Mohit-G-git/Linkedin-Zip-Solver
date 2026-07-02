/**
 * ============================================================
 *  ZIP Solver - Background Service Worker
 *  Loads the WASM module once and caches it.
 *  Runs completely isolated from LinkedIn's page context.
 * ============================================================
 */

let wasmExports = null; // cached WASM exports after first load

// ------------------------------------------------------------
//  WASM Loader (only runs once; subsequent calls use the cache)
// ------------------------------------------------------------
async function getWasm() {
  if (wasmExports) return wasmExports;

  const url    = chrome.runtime.getURL('wasm/zip_solver.wasm');
  const buffer = await fetch(url).then(r => r.arrayBuffer());

  // Inspect exactly which imports the binary needs
  const mod    = await WebAssembly.compile(buffer);
  const needed = WebAssembly.Module.imports(mod);
  console.log('[ZIP BG] WASM imports needed:', needed.map(i => `${i.module}.${i.name}(${i.kind})`));

  // Build the import object dynamically
  const imports   = {};
  const sharedMem = new WebAssembly.Memory({ initial: 256, maximum: 65536 });
  const sharedTbl = new WebAssembly.Table({ initial: 512, maximum: 65536, element: 'anyfunc' });

  for (const { module: m, name, kind } of needed) {
    if (!imports[m]) imports[m] = {};
    switch (kind) {
      case 'memory':   imports[m][name] = sharedMem; break;
      case 'table':    imports[m][name] = sharedTbl; break;
      case 'global':   imports[m][name] = new WebAssembly.Global({ value: 'i32', mutable: true }, 0); break;
      case 'function': imports[m][name] = () => 0;   break; // WASI stub
    }
  }

  // NOTE: instantiate(compiledModule, imports) returns the instance directly,
  //       NOT { instance, module } -- that form is only for buffer input.
  const instance = await WebAssembly.instantiate(mod, imports);
  const exp = instance.exports;

  // Call C++ global constructors / WASI init
  if (typeof exp._initialize       === 'function') exp._initialize();
  if (typeof exp.__wasm_call_ctors === 'function') exp.__wasm_call_ctors();

  console.log('[ZIP BG] WASM loaded. Exports:', Object.keys(exp).join(', '));
  wasmExports = exp;
  return exp;
}

// ------------------------------------------------------------
//  Solver Runner
// ------------------------------------------------------------
function runSolver(exp, rows, cols, numbersArr, hWallsArr, vWallsArr) {
  const n = rows * cols;

  const numPtr  = exp.malloc(n * 4);
  const hWPtr   = exp.malloc(n);
  const vWPtr   = exp.malloc(n);
  const outPtr  = exp.malloc(n * 4);
  const outLenP = exp.malloc(4);

  // Write inputs into WASM memory
  new Int32Array(exp.memory.buffer).set(new Int32Array(numbersArr), numPtr >> 2);
  new Uint8Array(exp.memory.buffer).set(new Uint8Array(hWallsArr),  hWPtr);
  new Uint8Array(exp.memory.buffer).set(new Uint8Array(vWallsArr),  vWPtr);

  const status = exp.zip_solve(rows, cols, numPtr, hWPtr, vWPtr, outPtr, outLenP);

  // Re-read memory (may have grown)
  const heap32 = new Int32Array(exp.memory.buffer);
  const len    = heap32[outLenP >> 2];
  const path   = (status === 0)
    ? Array.from({ length: len }, (_, i) => heap32[(outPtr >> 2) + i])
    : [];

  exp.free(numPtr); exp.free(hWPtr); exp.free(vWPtr);
  exp.free(outPtr); exp.free(outLenP);

  if (status === 0) {
    console.log(`[ZIP BG] Solved: ${len} steps`);
  } else {
    console.warn('[ZIP BG] No solution found');
  }

  return path;
}

// ------------------------------------------------------------
//  CDP Path Injector - Maximum Speed
//
//  Key insight: Chrome's CDP session processes commands in strict
//  FIFO order -- so we can dispatch ALL touchMove events without
//  awaiting each one. We fire them all concurrently, then do a
//  single Promise.all() to wait for the batch to finish.
//
//  Old approach: await each of N*2 commands sequentially
//    -> total = N * 2 * ~15 ms  (e.g. 36 cells = ~1080 ms)
//
//  New approach: fire all N*2 commands concurrently, await once
//    -> total ~ max(one_round_trip) ~ 15 ms  (any grid size)
// ------------------------------------------------------------
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function injectCdpPath(tabId, points) {
  const target = { tabId };

  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (e) {
    if (e.message.includes('attached')) {
      throw new Error(
        'Close Chrome DevTools before solving. ' +
        'The animation requires exclusive debugger access.'
      );
    }
    throw e;
  }

  // Helper: fire a touch event and return its promise (not awaited individually)
  const send = (type, pts) =>
    chrome.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
      type,
      touchPoints: pts
    });

  try {
    // 1. Touch-Start -- must settle before moves begin
    await send('touchStart', [{
      x: Math.round(points[0].x),
      y: Math.round(points[0].y)
    }]);

    // One browser frame so the game registers the press
    await delay(16);

    // 2. Fire all move events concurrently
    //    No await inside the loop -- every send() call is queued
    //    to the same CDP session which guarantees FIFO ordering.
    const movePromises = [];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // Midpoint keeps the touch path dense enough that the
      // game's hit-test never skips an adjacent cell.
      movePromises.push(send('touchMove', [{
        x: Math.round((prev.x + curr.x) / 2),
        y: Math.round((prev.y + curr.y) / 2)
      }]));

      movePromises.push(send('touchMove', [{
        x: Math.round(curr.x),
        y: Math.round(curr.y)
      }]));
    }

    // Wait for every move to be acknowledged by Chrome
    await Promise.all(movePromises);

    // One browser frame so the game registers the last cell
    await delay(16);

    // 3. Touch-End
    await send('touchEnd', []);

  } finally {
    await chrome.debugger.detach(target);
  }
}

// ------------------------------------------------------------
//  Message Handler
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SOLVE_WASM') {
    (async () => {
      try {
        const exp  = await getWasm();
        const path = runSolver(exp, msg.rows, msg.cols,
                               msg.numbers, msg.hWalls, msg.vWalls);
        sendResponse({ ok: true, path });
      } catch (err) {
        console.error('[ZIP BG] Error:', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // keep channel open for async response
  }

  if (msg.action === 'ANIMATE_CDP') {
    (async () => {
      try {
        await injectCdpPath(sender.tab.id, msg.points);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[ZIP BG] CDP error:', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
