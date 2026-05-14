# Serviço RMA WhatsApp (ZAP)

Servidor Node.js para envio automático de mensagens RMA via WhatsApp Web com fila, delay e sessão persistente.

## Instalação

```bash
cd c:\ZAP
npm install
```

## Startup

```bash
npm start
```

Na primeira execução:
1. Será gerado um QR Code no terminal
2. Escaneie com o WhatsApp do celular conectado (WhatsApp Business ou Web)
3. Aguarde a mensagem "WhatsApp conectado e pronto para envio"
4. Pronto para usar

## API

### GET `/status`
Verifica estado da conexão WhatsApp e tamanho da fila.

**Resposta:**
```json
{
  "whatsappConectado": true,
  "fila": 0
}
```

### POST `/enviar-rma`

Enfileira mensagem de RMA para envio automático.

**Payload (JSON):**
```json
{
  "telefone": "5547999999999",
  "imagem": "https://url-da-imagem.jpg",
  "rma": {
    "empresa": "Conecte Tudo",
    "cliente": "Monique Lima de Mello Brito",
    "cnpj": "11.047.296/0001-12",
    "email": "escritorio_conecte_aracaju@hotmail.com",
    "fone": "79 3231-2862",
    "cep": "129040-640",
    "endereco": "Rua José Bim, 111",
    "rastreio": "AD306392250BR",
    "nf_cliente": "4357",
    "data_compra": "30/01/2026",
    "nf_keepdata": "10323",
    "numero_serie": "PRD0081 - 2024101703511",
    "estoque_retorna": "não"
  }
}
```

**Resposta (202 Enfileirado):**
```json
{
  "ok": true,
  "mensagem": "RMA enfileirado para envio",
  "protocolo": "1715000399000-45621",
  "fila": 2
}
```

**Resposta (503 WhatsApp offline):**
```json
{
  "ok": false,
  "erro": "WhatsApp nao conectado. Escaneie o QR Code e aguarde o estado READY."
}
```

## Formatos suportados para imagem

- **URL HTTP/HTTPS:** `"https://exemplo.com/produto.jpg"`
- **Base64 data URI:** `"data:image/jpeg;base64,/9j/4AAQSkZJRg..."`

## Logs

Todos os eventos são registrados em `logs/envios.log` (JSON Lines):

```json
{"timestamp":"2026-05-06T12:30:45.123Z","type":"enfileirado","telefone":"5547999999999","chatId":"5547999999999@s.whatsapp.net","protocolo":"1715000399000-45621","filaAtual":1}
{"timestamp":"2026-05-06T12:30:50.456Z","type":"sucesso","telefone":"5547999999999","chatId":"5547999999999@s.whatsapp.net","protocolo":"1715000399000-45621"}
```

## Comportamento

1. **Sessão persistente:** Após primeiro QR scan, credenciais salvas em `.wwebjs_auth/` — não pede QR novamente
2. **Fila:** Requisições vão para fila se WhatsApp estiver ocupado
3. **Delay:** 2.5s entre cada mensagem (configurável via `SEND_DELAY_MS`)
4. **Timeout:** Respostas HTTP 202 (Accepted) — processamento é assíncrono

## Exemplo de teste (PowerShell)

```powershell
$payload = @{
    telefone = "5547999999999"
    imagem = "https://via.placeholder.com/400x300?text=Produto"
    rma = @{
        empresa = "Conecte Tudo"
        cliente = "Monique Lima"
        cnpj = "11.047.296/0001-12"
        email = "teste@email.com"
        fone = "79 3231-2862"
        cep = "129040-640"
        endereco = "Rua José Bim, 111"
        rastreio = "AD306392250BR"
        nf_cliente = "4357"
        data_compra = "30/01/2026"
        nf_keepdata = "10323"
        numero_serie = "PRD0081 - 2024101703511"
        estoque_retorna = "não"
    }
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3100/enviar-rma" `
    -Method POST `
    -Body $payload `
    -ContentType "application/json"
```

## Variáveis de ambiente

```bash
PORT=3100                  # Porta do servidor
SEND_DELAY_MS=2500         # Delay entre mensagens (ms)
```

## Estrutura do projeto

```
c:\ZAP\
├── src/
│   └── index.js           # Servidor principal
├── logs/
│   └── envios.log         # Log de eventos (gerado)
├── .wwebjs_auth/          # Sessão WhatsApp (gerado)
├── .wwebjs_cache/         # Cache do cliente (gerado)
├── package.json           # Dependências
└── README.md              # Este arquivo
```

## Troubleshooting

### "WhatsApp não conectado"
- Escaneie novamente o QR Code
- Aguarde 30s para conexão estabilizar
- Verifique conectividade de internet

### Mensagens não saem
- Verifique `logs/envios.log` para erros
- Certifique que o número está ativo no WhatsApp Web
- Teste com `GET /status` primeiro

### Erro na imagem
- Verifique URL (deve ser acessível publicamente)
- Se base64, remova quebras de linha
- Use MIME type válido (image/jpeg, image/png, etc)
