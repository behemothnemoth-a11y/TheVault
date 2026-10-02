@echo off
cd /d "%~dp0"
title The Vault - Acceptance Test
python test_vault.py
echo.
pause
