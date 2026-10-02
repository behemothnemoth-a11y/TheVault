@echo off
title The Vault
cd /d "%~dp0"

python -c "import sys, PySide6" >nul 2>nul
if not errorlevel 1 (
  python "%~dp0vault_server.py"
  goto :done
)

py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0vault_server.py" --browser-tab
  goto :done
)

echo.
echo Python is installed but Windows cannot find it yet.
echo Close this window, finish the Python installer, then double-click Open The Vault again.
echo Make sure "Add Python to PATH" is selected in the installer.
echo.
pause

:done
