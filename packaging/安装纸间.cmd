@echo off
setlocal
set "SETUP=%~dp0Zhijian-Setup-0.4.0.exe"
set "DEST=%PUBLIC%\Zhijian-Setup-0.4.0.exe"
if not exist "%SETUP%" (
  echo Zhijian-Setup-0.4.0.exe was not found next to this launcher.
  pause
  exit /b 1
)
copy /Y "%SETUP%" "%DEST%" >nul
if errorlevel 1 (
  echo Could not copy the installer to an ASCII path.
  pause
  exit /b 1
)
start "" "%DEST%"
exit /b 0
