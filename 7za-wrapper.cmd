@echo off
REM %~dp0 = folder this .cmd lives in, so the path stays correct no matter which drive/folder the project sits on.
"%~dp0node_modules\7zip-bin\win\x64\7za.exe" %*
if %errorlevel% LEQ 2 exit /b 0
exit /b %errorlevel%
