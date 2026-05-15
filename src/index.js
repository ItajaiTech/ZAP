// Função para remover a sessão e reinicializar o cliente WhatsApp
// e rotas de logout/reset-qr movidas para depois da criação do app
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const express = require("express");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const app = express();
app.use(express.json({ limit: "15mb" }));

const PORT = process.env.PORT || 8787;
const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS || 2500);
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "envios.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const queue = [];
let processingQueue = false;
let waReady = false;
let lastQrRaw = "";
let lastQrDataUrl = "";
let initializingClient = false;
let initRetryTimer = null;

const AUTH_DATA_PATH = path.join(__dirname, "..", ".wwebjs_auth");
const SESSION_DIR = path.join(AUTH_DATA_PATH, "session-rma-zap");

function clearSessionLocks() {
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome|chromium' -and $_.CommandLine -match 'session-rma-zap' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
      ],
      { timeout: 15000, stdio: "ignore" }
    );
  } catch (_e) {
    // Ignora erros ao matar Chrome
  }

  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort", "lockfile"];
  for (const fileName of lockFiles) {
    const lockPath = path.join(SESSION_DIR, fileName);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (_e) {
      // Mantem fluxo mesmo se nao conseguir remover algum lock.
    }
  }
}

function scheduleReinit(delayMs) {
  if (initRetryTimer) return;
  initRetryTimer = setTimeout(() => {
    initRetryTimer = null;
    safeInitializeClient().catch(() => {});
  }, delayMs);
}

function normalizeInline(value) {
  if (!value) return "";
  return String(value).replaceAll(/\s+/g, " ").trim();
}

function buildProdutosLinhas(rma) {
  if (Array.isArray(rma.prds) && rma.prds.length > 0) {
    const lines = rma.prds
      .map((item) => {
        if (!item) return "";
        const sku = normalizeInline(item.sku);
        const ns = normalizeInline(item.numero_serie);
        if (sku && ns) return `${sku} - ${ns}`;
        return sku || (ns ? `NS: ${ns}` : "");
      })
      .filter(Boolean);
    if (lines.length > 0) return lines.join("\n");
  }
  // Fallback: numero_serie simples
  return normalizeInline(rma.numero_serie) || "";
}

const waClient = new Client({
  authStrategy: new LocalAuth({ clientId: "rma-zap", dataPath: AUTH_DATA_PATH }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: path.join(
      process.env.USERPROFILE || process.env.HOME,
      ".cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe"
    )
  }
});

async function resetSessionAndClient() {
  waReady = false;
  lastQrRaw = "";
  lastQrDataUrl = "";

  try {
    await waClient.destroy();
  } catch (_e) {
    // Cliente pode nao estar inicializado; segue limpeza local mesmo assim.
  }

  clearSessionLocks();

  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
  } catch (_e) {
    // Se algum arquivo ainda estiver preso, a proxima inicializacao gerara novo QR ao menos.
  }

  initializingClient = false;
  safeInitializeClient().catch(() => {});
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(type, data) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    ...data
  });
  fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
}

function normalizePhone(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 13 || !digits.startsWith("55")) {
    return null;
  }
  return `${digits}@s.whatsapp.net`;
}

function normalizeDestino(telefone, grupoId) {
  if (grupoId && /^\d+@g\.us$/.test(String(grupoId).trim())) {
    return { chatId: String(grupoId).trim(), tipo: "grupo" };
  }
  if (telefone) {
    const chatId = normalizePhone(telefone);
    if (chatId) return { chatId, tipo: "telefone" };
  }
  return null;
}

function buildRmaCaption(rma) {
  const produtosLinhas = buildProdutosLinhas(rma);
  const documento = rma.cpf_cnpj || rma.cpf || rma.cnpj || "";

  return [
    "📦 *RMA ABERTO*",
    `CLIENTE: ${rma.cliente || ""}`,
    `CPF/CNPJ: ${documento}`,
    `E-mail: ${rma.email || ""}`,
    `Fone: ${rma.fone || ""}`,
    `CEP: ${rma.cep || ""}`,
    `End: ${rma.endereco || ""}`,
    `RASTREIO: ${rma.rastreio || ""}`,
    `NF COMPRA: ${rma.nf_cliente || ""}`,
    `DATA NF COMPRA: ${rma.data_compra || ""}`,
    `NF DEVOL: ${rma.nf_keepdata || ""}`,
    `Nº SÉRIE DO PRODUTO:`,
    produtosLinhas,
    `ESTOQUE RETORNA? : ${rma.estoque_retorna || ""}`
  ].join("\n");
}

async function buildMedia(imagem) {
  if (!imagem) {
    throw new Error("Campo imagem e obrigatorio");
  }

  if (/^https?:\/\//i.test(imagem)) {
    return MessageMedia.fromUrl(imagem, { unsafeMime: true });
  }

  const base64Match = String(imagem).match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    throw new Error("Imagem deve ser URL http(s) ou base64 data URI");
  }

  const mime = base64Match[1];
  const data = base64Match[2];
  return new MessageMedia(mime, data, "produto");
}

async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (queue.length > 0) {
    const item = queue.shift();

    try {
      let sent = false;

      // Tenta enviar com imagem se houver
      if (item.imagem) {
        try {
          const media = await buildMedia(item.imagem);
          await waClient.sendMessage(item.chatId, media, { caption: item.caption });
          sent = true;
        } catch (imgErr) {
          writeLog("aviso", {
            telefone: item.telefone,
            chatId: item.chatId,
            protocolo: item.protocolo,
            aviso: "Falha ao carregar imagem, enviando somente texto: " + imgErr.message
          });
        }
      }

      // Fallback: envia somente o texto se não conseguiu com imagem
      if (!sent) {
        await waClient.sendMessage(item.chatId, item.caption);
      }

      writeLog("sucesso", {
        telefone: item.telefone,
        chatId: item.chatId,
        protocolo: item.protocolo
      });
    } catch (error) {
      writeLog("erro", {
        telefone: item.telefone,
        chatId: item.chatId,
        protocolo: item.protocolo,
        erro: error.message
      });
    }

    await wait(SEND_DELAY_MS);
  }

  processingQueue = false;
}

app.get("/status", (_req, res) => {
  res.json({
    whatsappConectado: waReady,
    fila: queue.length
  });
});

app.get("/sync-data", (_req, res) => {
  res.json({
    whatsappConectado: waReady,
    hasQr: !waReady && !!lastQrDataUrl,
    qrDataUrl: !waReady ? lastQrDataUrl : ""
  });
});

app.post("/logout", async (_req, res) => {
  try {
    await resetSessionAndClient();
    res.json({ ok: true, mensagem: "WhatsApp desconectado. Gere um novo QR para conectar novamente." });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post("/reset-qr", async (_req, res) => {
  try {
    await resetSessionAndClient();
    res.json({ ok: true, mensagem: "Sessao reiniciada. Aguarde o novo QR Code." });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get("/sync", (_req, res) => {
  res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sincronizar WhatsApp - RMA ZAP</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; padding: 24px; background: #f5f7fb; color: #1d2430; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .status { margin: 12px 0 16px; padding: 10px 12px; border-radius: 8px; font-weight: 600; }
    .ok { background: #e8f8ee; color: #146b2e; }
    .wait { background: #fff6dd; color: #7a5600; }
    .qr-wrap { text-align: center; margin-top: 10px; }
    .qr-wrap img { width: 320px; max-width: 100%; border: 1px solid #d9e0ea; border-radius: 10px; background: #fff; }
    .hint { color: #4a5568; font-size: 14px; margin-top: 14px; }
    .mono { font-family: Consolas, monospace; font-size: 13px; background: #f1f4f9; padding: 2px 6px; border-radius: 4px; }
    .actions { display: flex; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
    .btn { border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .btn-logout { background: #fee2e2; color: #991b1b; }
    .btn-qr { background: #dbeafe; color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sincronizar WhatsApp</h1>
    <div id="status" class="status wait">Aguardando QR...</div>
    <div class="qr-wrap">
      <img id="qr" alt="QR Code WhatsApp" style="display:none;" />
    </div>
    <div class="actions">
      <button class="btn btn-logout" id="btnLogout" type="button">Desconectar</button>
      <button class="btn btn-qr" id="btnQr" type="button">Gerar novo QRCode</button>
    </div>
    <p class="hint">Abra o WhatsApp no celular: <span class="mono">Aparelhos conectados > Conectar aparelho</span> e escaneie o QR.</p>
    <p class="hint">Esta tela atualiza automaticamente.</p>
  </div>

  <script>
    async function refreshSync() {
      try {
        const response = await fetch('/sync-data', { cache: 'no-store' });
        const data = await response.json();
        const status = document.getElementById('status');
        const qr = document.getElementById('qr');

        if (data.whatsappConectado) {
          status.className = 'status ok';
          status.textContent = 'WhatsApp conectado com sucesso.';
          qr.style.display = 'none';
          return;
        }

        status.className = 'status wait';
        status.textContent = data.hasQr ? 'Escaneie o QR Code abaixo.' : 'Aguardando QR...';

        if (data.hasQr && data.qrDataUrl) {
          qr.src = data.qrDataUrl;
          qr.style.display = 'inline-block';
        } else {
          qr.style.display = 'none';
        }
      } catch (_e) {
        const status = document.getElementById('status');
        status.className = 'status wait';
        status.textContent = 'Nao foi possivel atualizar status. Tentando novamente...';
      }
    }

    async function postAction(url, button, busyText, doneText) {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = busyText;

      try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        alert(data.mensagem || doneText);
      } catch (_e) {
        alert('Nao foi possivel concluir a operacao agora.');
      } finally {
        button.disabled = false;
        button.textContent = original;
        setTimeout(refreshSync, 1200);
      }
    }

    document.getElementById('btnLogout').addEventListener('click', function () {
      postAction('/logout', this, 'Desconectando...', 'WhatsApp desconectado.');
    });

    document.getElementById('btnQr').addEventListener('click', function () {
      postAction('/reset-qr', this, 'Gerando...', 'Novo QR solicitado.');
    });

    refreshSync();
    setInterval(refreshSync, 2000);
  </script>
</body>
</html>`);
});

app.get("/grupos", async (_req, res) => {
  if (!waReady) {
    return res.status(503).json({ ok: false, erro: "WhatsApp nao conectado." });
  }
  try {
    const chats = await waClient.getChats();
    const grupos = chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id._serialized, nome: c.name, participantes: c.participants?.length || 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return res.json({ ok: true, total: grupos.length, grupos });
  } catch (err) {
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    servico: "RMA WhatsApp",
    mensagem: "Servidor online. Use /status para estado e POST /enviar-rma para envios.",
    endpoints: {
      status: "GET /status",
      grupos: "GET /grupos",
      enviarRma: "POST /enviar-rma"
    }
  });
});

app.post("/enviar-rma", async (req, res) => {
  try {
    if (!waReady) {
      return res.status(503).json({
        ok: false,
        erro: "WhatsApp nao conectado. Escaneie o QR Code e aguarde o estado READY."
      });
    }

    const { telefone, grupo_id, imagem, rma } = req.body || {};

    if (!rma) {
      return res.status(400).json({
        ok: false,
        erro: "Campo obrigatorio: rma. Forneça telefone ou grupo_id."
      });
    }

    const destino = normalizeDestino(telefone, grupo_id);
    if (!destino) {
      return res.status(400).json({
        ok: false,
        erro: grupo_id
          ? "grupo_id invalido. Use o ID do /grupos (ex: 1234567890-1234567890@g.us)"
          : "Telefone invalido. Use formato 5547XXXXXXXX ou 5547999999999, ou forneça grupo_id."
      });
    }

    const caption = buildRmaCaption(rma);
    const protocolo = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    queue.push({
      protocolo,
      telefone: destino.chatId,
      chatId: destino.chatId,
      tipo: destino.tipo,
      imagem,
      caption
    });

    writeLog("enfileirado", {
      destino: destino.chatId,
      tipo: destino.tipo,
      protocolo,
      filaAtual: queue.length
    });

    processQueue().catch((error) => {
      writeLog("erro-fila", { erro: error.message });
    });

    return res.status(202).json({
      ok: true,
      mensagem: "RMA enfileirado para envio",
      protocolo,
      fila: queue.length
    });
  } catch (error) {
    writeLog("erro-endpoint", { erro: error.message });
    return res.status(500).json({ ok: false, erro: error.message });
  }
});

waClient.on("qr", (qr) => {
  lastQrRaw = qr;
  console.log("\\nEscaneie o QR Code abaixo no WhatsApp:");
  qrcode.generate(qr, { small: true });

  QRCode.toDataURL(qr, { width: 320, margin: 1 })
    .then((dataUrl) => {
      lastQrDataUrl = dataUrl;
    })
    .catch(() => {
      lastQrDataUrl = "";
    });
});

waClient.on("ready", () => {
  waReady = true;
  lastQrRaw = "";
  lastQrDataUrl = "";
  console.log("WhatsApp conectado e pronto para envio.");
  writeLog("wa-ready", {});
});

waClient.on("authenticated", () => {
  console.log("WhatsApp autenticado com sucesso.");
  writeLog("wa-authenticated", {});
});

waClient.on("auth_failure", (message) => {
  waReady = false;
  lastQrDataUrl = "";
  console.error("Falha de autenticacao:", message);
  writeLog("wa-auth-failure", { message });
});

waClient.on("disconnected", (reason) => {
  waReady = false;
  lastQrDataUrl = "";
  console.warn("WhatsApp desconectado:", reason);
  writeLog("wa-disconnected", { reason });
});

async function safeInitializeClient() {
  if (initializingClient) return;
  initializingClient = true;
  try {
    await waClient.initialize();
    initializingClient = false;
  } catch (error) {
    const msg = String(error.message || "");
    writeLog("wa-init-error", { erro: msg });
    console.error("Erro ao iniciar WhatsApp:", msg);
    initializingClient = false;

    if (msg.includes("already running for")) {
      clearSessionLocks();
      scheduleReinit(15000);
      return;
    }

    scheduleReinit(5000);
    return;
  }
}

process.on("unhandledRejection", (reason) => {
  const erro = reason && reason.message ? reason.message : String(reason);
  writeLog("node-unhandled-rejection", { erro });
  console.error("UnhandledRejection:", erro);
});

process.on("uncaughtException", (error) => {
  const msg = String(error.message || "");
  writeLog("node-uncaught-exception", { erro: msg });
  console.error("UncaughtException:", msg);

  if (msg.includes("Execution context was destroyed")) {
    waReady = false;
    scheduleReinit(3000);
    return;
  }
});

app.listen(PORT, () => {
  console.log(`Servidor RMA WhatsApp ouvindo na porta ${PORT}`);
});

safeInitializeClient().catch(() => {});
