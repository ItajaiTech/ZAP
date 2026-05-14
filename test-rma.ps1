# Script de teste do endpoint /enviar-rma

$BASE_URL = "http://localhost:3100"

# 1. Verificar status
Write-Host "1. Verificando status da conexao..." -ForegroundColor Cyan
$statusResp = Invoke-WebRequest -Uri "$BASE_URL/status" -Method GET -ContentType "application/json" | ConvertFrom-Json
Write-Host $statusResp | ConvertTo-Json -Depth 2
Write-Host ""

if (-not $statusResp.whatsappConectado) {
    Write-Host "WhatsApp nao conectado! Escaneie o QR Code no terminal." -ForegroundColor Yellow
    exit 1
}

# 2. Enviar RMA
Write-Host "2. Enviando RMA de teste..." -ForegroundColor Cyan

$payload = @{
    telefone = "5547999999999"
    imagem = "https://via.placeholder.com/400x300?text=Produto+Teste"
    rma = @{
        empresa = "Conecte Tudo"
        cliente = "Monique Lima de Mello Brito"
        cnpj = "11.047.296/0001-12"
        email = "escritorio_conecte_aracaju@hotmail.com"
        fone = "79 3231-2862"
        cep = "129040-640"
        endereco = "Rua Jose Bim, 111"
        rastreio = "AD306392250BR"
        nf_cliente = "4357"
        data_compra = "30/01/2026"
        nf_keepdata = "10323"
        numero_serie = "PRD0081 - 2024101703511"
        estoque_retorna = "nao"
    }
}

try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/enviar-rma" `
        -Method POST `
        -Body ($payload | ConvertTo-Json) `
        -ContentType "application/json" `
        -ErrorAction SilentlyContinue

    $result = $response.Content | ConvertFrom-Json
    Write-Host $result | ConvertTo-Json -Depth 2 -ForegroundColor Green
} catch {
    $errorResp = $_.Exception.Response.Content | ConvertFrom-Json
    Write-Host $errorResp | ConvertTo-Json -Depth 2 -ForegroundColor Red
}

Write-Host ""
Write-Host "Teste concluido!" -ForegroundColor Green
