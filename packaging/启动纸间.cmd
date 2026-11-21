@echo off
setlocal
set "APPVER=0.3.1"
set "BASE=%~dp0"
set "SRC="
if exist "%BASE%Zhijian.exe" set "SRC=%BASE%"
if exist "%BASE%Zhijian\Zhijian.exe" set "SRC=%BASE%Zhijian"
if not defined SRC (
  for /d %%D in ("%BASE%*") do (
    if exist "%%D\Zhijian.exe" set "SRC=%%D"
    if exist "%%D\Zhijian\Zhijian.exe" set "SRC=%%D\Zhijian"
  )
)
if not defined SRC if exist "%BASE%..\Zhijian\Zhijian.exe" set "SRC=%BASE%..\Zhijian"
set "DEST=%PUBLIC%\Zhijian"
set "INSTALLED="
if exist "%DEST%\version.txt" set /p INSTALLED=<"%DEST%\version.txt"
if /i "%INSTALLED%"=="%APPVER%" goto launch
if not defined SRC goto missing
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  set "DEST=%LOCALAPPDATA%\Programs\Zhijian"
  robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
)
if not exist "%DEST%\Zhijian.exe" goto missing
set "INSTALLED="
if exist "%DEST%\version.txt" set /p INSTALLED=<"%DEST%\version.txt"
if /i not "%INSTALLED%"=="%APPVER%" goto missing
:launch
start "" "%DEST%\Zhijian.exe" %*
exit /b 0
:missing
echo.
echo The ZIP must be extracted first.
echo Keep this file next to the Zhijian folder, then run it again.
echo Do not run it from inside the ZIP preview window.
echo.
pause
exit /b 1
