This folder will contain the compiled WASM files after you run:
  solver\compile_wasm.bat

Expected files:
  zip_solver.wasm   ← compiled binary (auto-generated)
  zip_solver.js     ← Emscripten glue script (auto-generated)

Do NOT commit these binaries to version control.
They are re-generated from solver\zip_solver.cpp every time you compile.
