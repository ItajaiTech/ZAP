# Script para registrar o servico ZAP RMA como autostart no Windows

$zapDir = "c:\ZAP"
$scriptPath = Join-Path $zapDir "start-service.ps1"
$taskName = "ZAPRMAWhatsApp"

if (-not (Test-Path $zapDir)) {
    Write-Host "Erro: Pasta $zapDir nao encontrada" -ForegroundColor Red
    exit 1
}

# 1. Criar script wrapper de start
$startScript = @"
`$zapDir = "$zapDir"
Set-Location `$zapDir

# Aguardar inicializacao do Windows
Start-Sleep -Seconds 20

# Verificar se Node esta disponivel
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado" | Out-File -Append -FilePath "`$zapDir\logs\autostart.log"
    exit 1
}

# Instalar dependencias se necessario
if (-not (Test-Path "`$zapDir\node_modules")) {
    npm install 2>&1 | Out-File -Append -FilePath "`$zapDir\logs\autostart.log"
}

# Iniciar servico
npm start 2>&1 | Out-File -Append -FilePath "`$zapDir\logs\autostart.log"
"@

Set-Content -Path $scriptPath -Value $startScript -Encoding UTF8

Write-Host "Script de autostart criado: $scriptPath" -ForegroundColor Green

# 2. Registrar no HKCU\Run (executar no proximo logon)
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValue = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name $taskName -Value $runValue -Force

Write-Host "Autostart registrado no Registry para: $env:USERNAME" -ForegroundColor Green
Write-Host "O servico iniciara automaticamente no proximo logon." -ForegroundColor Cyan
