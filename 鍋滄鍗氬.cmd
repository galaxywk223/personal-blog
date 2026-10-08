@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
where pwsh.exe >nul 2>nul
if not errorlevel 1 goto use_pwsh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\stop-local.ps1" %*
set "STOP_EXIT=%ERRORLEVEL%"
goto after_stop
:use_pwsh
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\stop-local.ps1" %*
set "STOP_EXIT=%ERRORLEVEL%"
:after_stop
if not "%STOP_EXIT%"=="0" (
  echo.
  echo 停止失败，请查看上方错误。
  pause
)
exit /b %STOP_EXIT%
