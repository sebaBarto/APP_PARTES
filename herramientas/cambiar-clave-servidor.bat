@echo off
rem Doble clic aca: corre el script de PowerShell sin tener que cambiar permisos de Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cambiar-clave-servidor.ps1"
echo.
pause
