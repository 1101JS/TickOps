@echo off
rem Arranca TickOps en esta PC: PostgreSQL + API/sitio (Node) + tunel de Cloudflare hacia tickops.bid.
rem Para apagar: cierra esta ventana o pulsa Ctrl+C.
title TickOps - Servidor
cd /d "%~dp0"
set "FINDSTR=%SystemRoot%\System32\findstr.exe"
set "WAIT=%SystemRoot%\System32\timeout.exe"

echo ============================================
echo   TickOps - arrancando servicios
echo ============================================

rem 1. PostgreSQL (servicio de Windows, normalmente ya arranca solo)
sc query postgresql-x64-19 | "%FINDSTR%" /c:"RUNNING" >nul
if errorlevel 1 (
  echo Iniciando PostgreSQL...
  net start postgresql-x64-19 >nul 2>&1
  sc query postgresql-x64-19 | "%FINDSTR%" /c:"RUNNING" >nul
  if errorlevel 1 (
    echo [ERROR] PostgreSQL no esta corriendo. Inicia el servicio "postgresql-x64-19"
    echo         desde "Servicios" de Windows o ejecuta este archivo como administrador.
    goto fail
  )
)
echo [OK] PostgreSQL activo

rem 2. Tunel de Cloudflare (publica solo /api en origen.tickops.bid)
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [AVISO] No se encontro cloudflared: el sitio solo funcionara en esta red.
) else (
  tasklist /v /fi "WINDOWTITLE eq TickOps - Tunel*" | "%FINDSTR%" /i "cloudflared" >nul
  if errorlevel 1 start "TickOps - Tunel" /min cloudflared tunnel --config "%USERPROFILE%\.cloudflared\config.yml" run tickops
  echo [OK] Tunel de Cloudflare activo
)

rem 3. Si el servidor ya esta corriendo, solo abre el navegador
netstat -ano | "%FINDSTR%" /c:":3000 " | "%FINDSTR%" /c:"LISTENING" >nul
if not errorlevel 1 (
  echo [OK] TickOps ya estaba en marcha.
  start "" http://localhost:3000
  "%WAIT%" /t 3 /nobreak >nul 2>&1
  exit /b 0
)

rem 4. Dependencias y compilacion del sitio
if not exist node_modules (
  echo Instalando dependencias...
  call npm install || goto fail
)
echo Compilando el sitio...
call npm run build >nul 2>&1
if errorlevel 1 (
  call npm run build
  goto fail
)
echo [OK] Sitio compilado

rem 5. Abrir el navegador cuando el servidor este listo
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process 'http://localhost:3000'"

echo.
echo   En esta PC:      http://localhost:3000
echo   En internet:     https://tickops.bid
echo   Para apagar:     cierra esta ventana o pulsa Ctrl+C
echo ============================================
echo.
node --env-file-if-exists=.env server/node.js

rem 6. Al detener el servidor, cerrar tambien el tunel
taskkill /fi "WINDOWTITLE eq TickOps - Tunel*" /t /f >nul 2>&1
exit /b 0

:fail
echo.
echo No se pudo arrancar TickOps. Revisa el mensaje de arriba.
pause
exit /b 1
