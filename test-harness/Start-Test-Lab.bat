@echo off
setlocal
REM One-click Test Lab: boots the Android TV emulator and prints how to drive everything.
set ANDROID_SDK_ROOT=D:\Android\sdk
set ANDROID_HOME=D:\Android\sdk
set ANDROID_AVD_HOME=D:\Android\avd
set ADB=D:\Android\sdk\platform-tools\adb.exe

echo === Fast Food Manager Test Lab ===
"%ADB%" start-server >nul 2>&1
"%ADB%" get-state >nul 2>&1
if errorlevel 1 (
  echo Starting Android TV emulator ^(ffm_tv^)...
  start "" "D:\Android\sdk\emulator\emulator.exe" -avd ffm_tv -gpu auto -netdelay none -netspeed full
  echo Waiting for it to boot...
  "%ADB%" wait-for-device
) else (
  echo Emulator already running.
)
echo.
"%ADB%" devices
echo.
echo Ready. From this test-harness folder:
echo    npm run pos     -  drive the POS (Electron) app
echo    npm run tv      -  drive the TV app on the emulator
echo    node run.js ^<scenario^>
endlocal
