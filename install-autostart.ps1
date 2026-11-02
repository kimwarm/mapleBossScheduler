# 윈도우 로그인 시 배율 워커 자동 실행 등록
# 해제: powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Uninstall
param([switch]$Uninstall)

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'MapleBossWorker.lnk'

if ($Uninstall) {
    Remove-Item $lnkPath -ErrorAction SilentlyContinue
    Write-Host "자동 실행 해제 완료"
    exit
}

$vbs = Join-Path $PSScriptRoot 'start-worker.vbs'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "`"$vbs`""
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Save()
Write-Host "자동 실행 등록 완료: $lnkPath"

