# CHECKLIST: Como usar o Serviço ZAP RMA WhatsApp

## ✅ Antes de começar

- [ ] Node.js instalado (verificar: `node --version`)
- [ ] npm disponível (verificar: `npm --version`)
- [ ] WhatsApp instalado no celular (qualquer versão)
- [ ] Conta de um computador ou smartphone vinculada ao WhatsApp Web
- [ ] Conexão estável de internet

## ✅ Instalação (primeira vez)

```bash
cd c:\ZAP
npm install
```

⏱️ Aguarde ~2-5 minutos (download de dependências)

## ✅ Primeiro Start

```bash
npm start
```

**O que acontecerá:**

1. Terminal exibirá um QR Code grande em branco/preto
2. Abra o WhatsApp no celular → Menu (⋮) → Aparelhos Conectados
3. Toque em "Conectar um Aparelho"
4. **Escaneie o QR Code** com a câmera do celular
5. Aguarde 10-30 segundos
6. Quando ver "WhatsApp conectado e pronto para envio" → ✅ Pronto

## ✅ Testando o endpoint

Em outro terminal PowerShell:

```powershell
cd c:\ZAP
.\test-rma.ps1
```

Se receber `"fila": 1` e `"ok": true` → ✅ Funciona!

## ✅ Usar o serviço

### Forma 1: Direto via HTTP (curl, Python, etc)

```bash
curl -X POST http://localhost:3100/enviar-rma \
  -H "Content-Type: application/json" \
  -d '{
    "telefone": "5547999999999",
    "imagem": "https://via.placeholder.com/400",
    "rma": {
      "empresa": "Conecte Tudo",
      "cliente": "Monique",
      ...
    }
  }'
```

### Forma 2: Integrar no seu sistema (Flask, Express, etc)

Ver arquivo: `src/exemplos-integracao.js`

## ✅ Autostart (iniciar com Windows)

```powershell
cd c:\ZAP
.\install-autostart.ps1
```

Próximo logon: serviço inicia automaticamente em background.

## ✅ Verificar status

```bash
curl http://localhost:3100/status
```

Resposta esperada:
```json
{
  "whatsappConectado": true,
  "fila": 0
}
```

## ⚠️ Troubleshooting

### Problema: "npm command not found"
**Solução:** Reinstale Node.js desde https://nodejs.org/

### Problema: "QR Code não aparece"
**Solução:** Feche o terminal e execute `npm start` novamente

### Problema: "WhatsApp nao conectado (503)"
**Solução:** 
1. Verifique se viu "WhatsApp conectado e pronto para envio" no terminal
2. Se não viu, escaneie o QR Code novamente
3. Aguarde 30s após scan

### Problema: "Telefone invalido"
**Solução:** Use formato `5547999999999` (55 + DDD + número com 9 dígitos)

### Problema: Imagem não aparece na mensagem
**Solução:** 
- Se URL: verificar se é acessível publicamente
- Se base64: validar MIME type (image/jpeg, image/png, etc)

## 📊 Monitorar logs

```bash
# Ver últimas 50 linhas
Get-Content c:\ZAP\logs\envios.log -Tail 50

# Acompanhar em tempo real (Windows)
Get-Content c:\ZAP\logs\envios.log -Tail 10 -Wait
```

## 🔒 Segurança

- Credenciais salvas em `.wwebjs_auth/` (local, não compartilhar)
- Não commit `.wwebjs_auth/`, `.wwebjs_cache/`, `logs/` no Git
- Arquivo `.gitignore` já ignora estes diretórios

## 📞 Contato / Suporte

Arquivo de referência: `README.md`
