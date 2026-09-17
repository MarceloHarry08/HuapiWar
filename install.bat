@echo off
title HUAPI WAR - Instalador de Dependencias
echo ========================================================
echo       HUAPI WAR - INSTALACION DE DEPENDENCIAS
echo ========================================================
echo.
echo [1/2] Inicializando proyecto Node.js si no existe...
if not exist package.json (
    call npm init -y
)

echo.
echo [2/2] Instalando paquetes requeridos (Express, Socket.io, SQLite3, Three.js, Tone.js, Howler.js)...
call npm install express socket.io sqlite3 three tone howler

echo.
echo ========================================================
echo  Instalacion finalizada con exito!
echo  Puedes ejecutar el juego usando "run.bat".
echo ========================================================
pause
