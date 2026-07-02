@echo off
call C:\emsdk\emsdk_env.bat

echo.
echo [ZIP Solver]  Compiling C++ solver to standalone WebAssembly...
echo.

if not exist "..\wasm" mkdir "..\wasm"

em++ -O2 zip_solver.cpp -o ..\wasm\zip_solver.wasm ^
     --no-entry ^
     -s STANDALONE_WASM=1 ^
     -s "EXPORTED_FUNCTIONS=['_zip_solve','_malloc','_free']" ^
     -s ALLOW_MEMORY_GROWTH=1 ^
     -fno-exceptions

if %ERRORLEVEL% == 0 (
    echo.
    echo [SUCCESS]  wasm\zip_solver.wasm created!
) else (
    echo.
    echo [ERROR]    Compilation failed.
)
pause
