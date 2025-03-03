@echo off
REM filepath: /x:/Git/featherless-deepdive/featherless.start.bat
echo Starting Featherless application...

cd /d %~dp0
npm run dev

if %ERRORLEVEL% neq 0 (
    echo Error starting the application!
    pause
    exit /b %ERRORLEVEL%
)

echo Application started successfully!