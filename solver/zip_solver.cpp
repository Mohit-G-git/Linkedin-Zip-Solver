/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          LinkedIn ZIP Solver — C++ Solver (YOUR CODE)        ║
 * ║                                                              ║
 * ║  Fill in the body of  zip_solve()  below with your logic.   ║
 * ║  Everything else (WASM export, memory layout, helpers) is    ║
 * ║  already set up.                                             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * HOW TO COMPILE TO WASM  (requires Emscripten SDK)
 * ──────────────────────────────────────────────────
 *  1. Install Emscripten: https://emscripten.org/docs/getting_started/downloads.html
 *  2. Open an Emscripten-activated terminal (run `emsdk_env.bat`)
 *  3. Run:
 *       em++ -O2 zip_solver.cpp -o ../wasm/zip_solver.js         \
 *            -s WASM=1                                           \
 *            -s EXPORTED_FUNCTIONS='["_zip_solve","_malloc","_free"]' \
 *            -s EXPORTED_RUNTIME_METHODS='["HEAP32","HEAPU8"]'   \
 *            -s MODULARIZE=1                                      \
 *            -s EXPORT_NAME="ZipSolverModule"                    \
 *            -s ALLOW_MEMORY_GROWTH=1
 *
 *     This will produce:
 *       wasm/zip_solver.js    ← Emscripten glue script
 *       wasm/zip_solver.wasm  ← Binary WASM module
 *
 *  4. Both files are already referenced in manifest.json.
 *     Load the unpacked extension in Chrome and you're done.
 *
 * ──────────────────────────────────────────────────────────────
 */

#include <cstdint>
#include <cstring>
#include <vector>
#include <functional>

// ── EXTERN C prevents C++ name-mangling (required for WASM export) ──
extern "C" {

/**
 * @brief  Solve the LinkedIn ZIP puzzle.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  PARAMETER GUIDE  (read this carefully before coding)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  ┌─────────┬───────────┬──────────────────────────────────────────────────────┐
 *  │ Param   │ Type      │ Meaning                                              │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ rows    │ int       │ Number of rows in the grid (e.g. 6 for a 6×6 grid)  │
 *  │ cols    │ int       │ Number of columns in the grid                        │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ numbers │ int*      │ Flat 1-D array of size  rows × cols                 │
 *  │         │           │  - numbers[r * cols + c] = the number shown in      │
 *  │         │           │    cell (row r, column c), OR  0  if the cell is    │
 *  │         │           │    empty/unnumbered.                                 │
 *  │         │           │  Example for a 3×3 grid:                            │
 *  │         │           │    [1, 0, 0,                                         │
 *  │         │           │     0, 0, 0,                                         │
 *  │         │           │     0, 0, 2]                                         │
 *  │         │           │  means cell (0,0)=1, cell (2,2)=2, rest empty.      │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ hWalls  │ uint8_t*  │ Horizontal walls — walls on the BOTTOM edge of cell │
 *  │         │           │ (r, c).  Array size: rows × cols.                   │
 *  │         │           │  hWalls[r * cols + c] = 1  →  there is a WALL      │
 *  │         │           │    between cell (r, c) and cell (r+1, c).           │
 *  │         │           │  hWalls[r * cols + c] = 0  →  no wall (free move). │
 *  │         │           │  Only rows 0 … rows-2 matter (last row has no       │
 *  │         │           │  cell below it).                                     │
 *  │         │           │                                                      │
 *  │         │           │  Visual:  if hWalls[1*cols + 2] == 1                │
 *  │         │           │                                                      │
 *  │         │           │    row 1 → │ · │ · │ · │                            │
 *  │         │           │            ├───┼───┼═══┤   ← wall below col 2      │
 *  │         │           │    row 2 → │ · │ · │ · │                            │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ vWalls  │ uint8_t*  │ Vertical walls — walls on the RIGHT edge of cell    │
 *  │         │           │ (r, c).  Array size: rows × cols.                   │
 *  │         │           │  vWalls[r * cols + c] = 1  →  there is a WALL      │
 *  │         │           │    between cell (r, c) and cell (r, c+1).           │
 *  │         │           │  vWalls[r * cols + c] = 0  →  no wall (free move). │
 *  │         │           │  Only cols 0 … cols-2 matter (last col has no       │
 *  │         │           │  cell to its right).                                 │
 *  │         │           │                                                      │
 *  │         │           │  Visual:  if vWalls[0*cols + 1] == 1                │
 *  │         │           │                                                      │
 *  │         │           │    col→  0     1     2                              │
 *  │         │           │          │ · ║ · │ · │   ← wall right of col 1     │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ outPath │ int*      │ OUTPUT buffer — write the solution path here.       │
 *  │         │           │  Each element is a flat cell index:                 │
 *  │         │           │    index = row * cols + col                         │
 *  │         │           │  The path must start at the cell labelled "1",      │
 *  │         │           │  visit every numbered cell in order (1→2→3→…),      │
 *  │         │           │  visit every cell exactly once, and end at the      │
 *  │         │           │  last numbered cell.                                 │
 *  │         │           │  Buffer is pre-allocated with size rows*cols.       │
 *  ├─────────┼───────────┼──────────────────────────────────────────────────────┤
 *  │ outLen  │ int*      │ OUTPUT — write the number of cells in outPath here. │
 *  │         │           │  Must equal rows * cols for a valid solution.       │
 *  └─────────┴───────────┴──────────────────────────────────────────────────────┘
 *
 * @return  0  on success (solution written to outPath / outLen)
 *         -1  if no solution exists
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  GAME RULES SUMMARY (what a valid solution must satisfy)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  1. The path visits every cell exactly once (Hamiltonian path).
 *  2. Numbered cells must be visited in strictly ascending order
 *     (cell with number 1 first, then 2, then 3, …).
 *  3. Consecutive cells in the path must be horizontally or
 *     vertically adjacent (no diagonals).
 *  4. A move from (r, c) → (r+1, c) is BLOCKED if hWalls[r*cols+c] == 1.
 *  5. A move from (r, c) → (r, c+1) is BLOCKED if vWalls[r*cols+c] == 1.
 *     (Symmetric: moving in reverse is equally blocked.)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * HELPER MACROS (feel free to use)
 *   IDX(r, c)         → flat index from (row, col)
 *   H_WALL(r, c)      → 1 if wall below cell (r, c)
 *   V_WALL(r, c)      → 1 if wall right of cell (r, c)
 *   CAN_MOVE_DOWN(r,c)  → true if step (r,c)→(r+1,c) is allowed
 *   CAN_MOVE_RIGHT(r,c) → true if step (r,c)→(r,c+1) is allowed
 */
int zip_solve(
    int       rows,
    int       cols,
    int*      numbers,   // [in]  flat grid of cell numbers (0 = empty)
    uint8_t*  hWalls,    // [in]  horizontal walls (bottom edges)
    uint8_t*  vWalls,    // [in]  vertical walls   (right edges)
    int*      outPath,   // [out] solution path (flat cell indices)
    int*      outLen     // [out] number of cells in outPath
) {
    /* ── Handy macros ─────────────────────────────────────── */
    #define IDX(r, c)           ((r) * cols + (c))
    #define H_WALL(r, c)        (hWalls[IDX(r, c)])
    #define V_WALL(r, c)        (vWalls[IDX(r, c)])
    #define IN_BOUNDS(r, c)     ((r) >= 0 && (r) < rows && (c) >= 0 && (c) < cols)
    #define CAN_MOVE_DOWN(r,c)  (IN_BOUNDS((r)+1, c) && !H_WALL(r, c))
    #define CAN_MOVE_UP(r,c)    (IN_BOUNDS((r)-1, c) && !H_WALL((r)-1, c))
    #define CAN_MOVE_RIGHT(r,c) (IN_BOUNDS(r, (c)+1) && !V_WALL(r, c))
    #define CAN_MOVE_LEFT(r,c)  (IN_BOUNDS(r, (c)-1) && !V_WALL(r, (c)-1))

    const int N = rows * cols;  // total number of cells

    // ─────────────────────────────────────────────────────────
    // SOLVER: DFS + Backtracking with connectivity pruning
    // ─────────────────────────────────────────────────────────

    // ── Step 1: Collect numbered waypoints in ascending order ──
    // waypoints[i] = flat cell index of the cell labelled (i+1)
    int maxNum = 0;
    for (int i = 0; i < N; i++)
        if (numbers[i] > maxNum) maxNum = numbers[i];

    if (maxNum == 0) { *outLen = 0; return -1; }  // no numbered cells at all

    std::vector<int> waypoints(maxNum, -1);        // waypoints[k] = cell idx of number (k+1)
    for (int i = 0; i < N; i++)
        if (numbers[i] > 0)
            waypoints[numbers[i] - 1] = i;

    // Validate: every waypoint slot must be filled
    for (int k = 0; k < maxNum; k++)
        if (waypoints[k] < 0) { *outLen = 0; return -1; }

    // ── Step 2: State arrays ────────────────────────────────────
    std::vector<bool> visited(N, false);  // visited[idx] = true if cell is on current path
    std::vector<int>  path;               // current DFS path (cell indices)
    path.reserve(N);

    // ── Step 3: Flood-fill connectivity check (pruning) ─────────
    // After each move, verify that all unvisited cells + remaining
    // waypoints are still reachable from the current head.
    // Uses an iterative BFS/DFS stack to avoid recursion overhead.
    std::vector<bool> ffSeen(N, false);  // reused buffer for flood fill

    auto isConnected = [&](int startIdx) -> bool {
        // Count unvisited cells
        int remaining = 0;
        for (int i = 0; i < N; i++)
            if (!visited[i]) remaining++;

        if (remaining == 0) return true;

        // BFS from startIdx over unvisited cells
        std::fill(ffSeen.begin(), ffSeen.end(), false);
        static std::vector<int> queue(512);  // static to avoid heap alloc in hot path
        if ((int)queue.size() < N) queue.resize(N);

        int head = 0, tail = 0;
        ffSeen[startIdx] = true;
        queue[tail++] = startIdx;
        // NOTE: startIdx is already visited — do NOT count it.
        // reached counts only UNVISITED cells reachable from startIdx.
        int reached = 0;

        while (head < tail) {
            int cur = queue[head++];
            int r   = cur / cols;
            int c   = cur % cols;

            // Try all 4 neighbours
            int nr, nc, nIdx;

            // Down
            if (CAN_MOVE_DOWN(r, c)) {
                nIdx = IDX(r+1, c);
                if (!visited[nIdx] && !ffSeen[nIdx]) {
                    ffSeen[nIdx] = true; queue[tail++] = nIdx; reached++;
                }
            }
            // Up
            if (CAN_MOVE_UP(r, c)) {
                nIdx = IDX(r-1, c);
                if (!visited[nIdx] && !ffSeen[nIdx]) {
                    ffSeen[nIdx] = true; queue[tail++] = nIdx; reached++;
                }
            }
            // Right
            if (CAN_MOVE_RIGHT(r, c)) {
                nIdx = IDX(r, c+1);
                if (!visited[nIdx] && !ffSeen[nIdx]) {
                    ffSeen[nIdx] = true; queue[tail++] = nIdx; reached++;
                }
            }
            // Left
            if (CAN_MOVE_LEFT(r, c)) {
                nIdx = IDX(r, c-1);
                if (!visited[nIdx] && !ffSeen[nIdx]) {
                    ffSeen[nIdx] = true; queue[tail++] = nIdx; reached++;
                }
            }
        }
        return reached == remaining;
    };

    // ── Step 4: DFS backtracking ────────────────────────────────
    // nextWaypoint: index into waypoints[] — the next numbered cell
    //               that must be the next time we visit a numbered cell.
    bool solved = false;

    // Iterative-friendly helper: we use actual recursion here (stack
    // depth ≤ N ≤ 64 for typical puzzles, so it's safe).
    std::function<void(int /*curIdx*/, int /*nextWP*/)> dfs =
        [&](int curIdx, int nextWP) {

        // ── Terminal condition ───────────────────────────────────
        if ((int)path.size() == N) {
            // All cells visited — check that all waypoints were hit
            if (nextWP == maxNum) {
                // Copy path to output
                for (int i = 0; i < N; i++) outPath[i] = path[i];
                *outLen = N;
                solved  = true;
            }
            return;
        }

        if (solved) return;  // early exit once found

        int r = curIdx / cols;
        int c = curIdx % cols;

        // Neighbours in a fixed order: Down, Right, Up, Left
        // (order affects performance but not correctness)
        const int dr[] = { 1, 0, -1,  0};
        const int dc[] = { 0, 1,  0, -1};

        for (int d = 0; d < 4; d++) {
            if (solved) return;

            int nr   = r + dr[d];
            int nc   = c + dc[d];

            if (!IN_BOUNDS(nr, nc)) continue;

            // Check wall between (r,c) and (nr,nc)
            if (d == 0 && !CAN_MOVE_DOWN(r, c))  continue;  // moving down
            if (d == 1 && !CAN_MOVE_RIGHT(r, c)) continue;  // moving right
            if (d == 2 && !CAN_MOVE_UP(r, c))    continue;  // moving up
            if (d == 3 && !CAN_MOVE_LEFT(r, c))  continue;  // moving left

            int nIdx = IDX(nr, nc);
            if (visited[nIdx]) continue;

            // ── Waypoint constraint ──────────────────────────────
            // If this neighbour is a numbered cell, it MUST be the
            // next waypoint in sequence; otherwise skip it.
            int cellNum = numbers[nIdx];
            int newNextWP = nextWP;

            if (cellNum > 0) {
                // This is a numbered cell
                if (nextWP >= maxNum) continue;              // no more waypoints expected
                if (waypoints[nextWP] != nIdx) continue;    // wrong waypoint order
                newNextWP = nextWP + 1;
            } else {
                // Empty cell: make sure we are not skipping a waypoint
                // (i.e., the next waypoint must not be reachable only through
                //  this cell — that's handled by the connectivity check below)
            }

            // ── Move ────────────────────────────────────────────
            visited[nIdx] = true;
            path.push_back(nIdx);

            // ── Connectivity pruning ─────────────────────────────
            // After committing to this cell, ensure all remaining
            // unvisited cells are still reachable from nIdx.
            // Skip this check on the last cell (no remaining cells).
            bool connected = true;
            if ((int)path.size() < N) {
                connected = isConnected(nIdx);
            }

            if (connected) {
                dfs(nIdx, newNextWP);
            }

            // ── Undo move (backtrack) ────────────────────────────
            visited[nIdx] = false;
            path.pop_back();
        }
    };

    // ── Step 5: Kick off DFS from cell labelled "1" ─────────────
    int startIdx = waypoints[0];
    visited[startIdx] = true;
    path.push_back(startIdx);
    dfs(startIdx, 1);   // next waypoint to enforce is number 2 (index 1)

    if (!solved) {
        *outLen = 0;
        return -1;
    }
    return 0;
}

} // extern "C"
