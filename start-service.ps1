$zapDir = "c:\ZAP"
Set-Location $zapDir

# Aguardar inicializacao do Windows
Start-Sleep -Seconds 20

# Verificar se Node esta disponivel
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado" | Out-File -Append -FilePath "$zapDir\logs\autostart.log"
    exit 1
}

# Instalar dependencias se necessario
if (-not (Test-Path "$zapDir\node_modules")) {
    npm install 2>&1 | Out-File -Append -FilePath "$zapDir\logs\autostart.log"
}

# Iniciar servico
npm start 2>&1 | Out-File -Append -FilePath "$zapDir\logs\autostart.log"
