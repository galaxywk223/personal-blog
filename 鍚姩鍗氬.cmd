@echo off
setlocal
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
where pwsh.exe >nul 2>nul
if not errorlevel 1 goto use_pwsh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\start-local.ps1" %*
set "START_EXIT=%ERRORLEVEL%"
goto after_start
:use_pwsh
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\start-local.ps1" %*
set "START_EXIT=%ERRORLEVEL%"
:after_start
if not "%START_EXIT%"=="0" (
  echo.
  echo 启动失败，请查看上方错误及 .runtime\logs 目录。
  pause
)
exit /b %START_EXIT%
