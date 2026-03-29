@echo off
"C:\Users\MahmoudBen\Desktop\Fastfood Manager\fastfood-manager\node_modules\7zip-bin\win\x64\7za.exe" %*
if %errorlevel% LEQ 2 exit /b 0
exit /b %errorlevel%
