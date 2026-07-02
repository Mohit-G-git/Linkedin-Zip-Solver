@echo off
:: ============================================================
::  LinkedIn ZIP Solver — WASM Compile Script (Windows)
::  Run this AFTER activating the Emscripten SDK environment:
::    call "C:\path\to\emsdk\emsdk_env.bat"
:: ============================================================

echo.
echo  [ZIP Solver]  Compiling C++ solver to WebAssembly...
echo.

if not exist "..\wasm" mkdir "..\wasm"

em++ -O2 zip_solver.cpp -o ..\wasm\zip_solver.js ^
     -s WASM=1 ^
     -s EXPORTED_FUNCTIONS="[\"_zip_solve\",\"_malloc\",\"_free\"]" ^
     -s EXPORTED_RUNTIME_METHODS="[\"HEAP32\",\"HEAPU8\"]" ^
     -s MODULARIZE=1 ^
     -s EXPORT_NAME="ZipSolverModule" ^
     -s ALLOW_MEMORY_GROWTH=1

if %ERRORLEVEL% == 0 (
    echo.
    echo  [SUCCESS]  wasm\zip_solver.js and wasm\zip_solver.wasm created!
    echo             Load the extension in Chrome to use.
) else (
    echo.
    echo  [ERROR]    Compilation failed.  Make sure Emscripten is activated.
    echo             Download: https://emscripten.org/docs/getting_started/downloads.html
)
pause
