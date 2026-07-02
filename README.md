# LinkedIn ZIP Solver — Chrome Extension

A Chrome extension that automatically solves the [LinkedIn ZIP puzzle](https://www.linkedin.com/games/zip) using a **C++ solver compiled to WebAssembly**.

---

## 📁 Project Structure

```
zip Solver/
├── manifest.json              ← Chrome Extension Manifest v3
│
├── content/
│   ├── content.js             ← Injected into linkedin.com/games/zip
│   │                             Parses the DOM, calls WASM, animates path
│   └── content.css            ← Overlay notification styles
│
├── popup/
│   ├── popup.html             ← Extension toolbar popup UI
│   ├── popup.css              ← Premium dark-mode popup styles
│   └── popup.js               ← Popup logic (tab detection, solve trigger)
│
├── solver/
│   ├── zip_solver.cpp         ← ★ YOUR SOLVER GOES HERE ★
│   └── compile_wasm.bat       ← Compiles .cpp → WASM (Windows, Emscripten)
│
├── wasm/                      ← Auto-generated after compilation
│   ├── zip_solver.wasm        ← (generated)
│   └── zip_solver.js          ← (generated, Emscripten glue)
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Getting Started

### Step 1 — Write your solver

Open [`solver/zip_solver.cpp`](solver/zip_solver.cpp) and fill in the body of the `zip_solve()` function.

All parameters are documented in detail inside the file. Quick summary:

| Parameter | Type | Meaning |
|-----------|------|---------|
| `rows` | `int` | Number of grid rows |
| `cols` | `int` | Number of grid columns |
| `numbers` | `int*` | Flat array: `numbers[r*cols+c]` = number in cell (r,c), or 0 if empty |
| `hWalls` | `uint8_t*` | Bottom-edge walls: `hWalls[r*cols+c]=1` means wall between row r and r+1 at col c |
| `vWalls` | `uint8_t*` | Right-edge walls: `vWalls[r*cols+c]=1` means wall between col c and c+1 at row r |
| `outPath` | `int*` | **Output**: write the solution path as flat indices (`r*cols+c`) |
| `outLen` | `int*` | **Output**: write the path length here (must equal `rows*cols`) |

Return `0` on success, `-1` if no solution.

---

### Step 2 — Compile to WebAssembly

1. Install [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
2. Activate the SDK environment:
   ```bat
   call "C:\path\to\emsdk\emsdk_env.bat"
   ```
3. Run the compile script from the `solver/` directory:
   ```bat
   cd solver
   compile_wasm.bat
   ```
   This generates `wasm/zip_solver.wasm` and `wasm/zip_solver.js`.

---

### Step 3 — Load the extension in Chrome

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `zip Solver` folder

---

### Step 4 — Use it!

1. Navigate to [linkedin.com/games/zip](https://www.linkedin.com/games/zip)
2. Click the **ZIP Solver** icon in your Chrome toolbar
3. Click **⚡ Solve Puzzle** — the extension will parse the grid, run your solver, and draw the path automatically

---

## 🔧 DOM Selector Notes

If LinkedIn changes their HTML structure, update the `SELECTORS` object at the top of [`content/content.js`](content/content.js):

```js
const SELECTORS = {
  gameBoard : '.zip-game-board, ...',
  cell      : '[class*="cell"], ...',
  cellLabel : '[class*="label"], ...',
};
```

Use Chrome DevTools (F12 → Inspector) on the ZIP game page to find the correct selectors.

---

## 📐 Game Rules

1. Draw **one continuous path** connecting all numbered cells **in order** (1 → 2 → 3 → …)
2. The path must visit **every cell exactly once**
3. Movement is **horizontal or vertical only** (no diagonals)
4. The path **cannot cross walls** (thick borders between cells)

---

## 🛠️ Tech Stack

- **Chrome Extension** Manifest v3
- **C++** solver compiled with **Emscripten** → **WebAssembly**
- **Vanilla JS** content/popup scripts
- **CSS** glassmorphism dark-mode UI
