/**
 * Exemplo de integracao com seu sistema de RMA
 * Este arquivo demonstra como chamar o endpoint /enviar-rma
 */

// ============ EXEMPLO 1: Usando fetch (Node.js) ============

async function enviarRmaViaWhatsapp(telefone, imagemUrl, dadosRma) {
  const endpoint = "http://localhost:3100/enviar-rma";
  
  const payload = {
    telefone,
    imagem: imagemUrl,
    rma: dadosRma
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Erro ao enviar RMA:", error);
      return null;
    }

    const result = await response.json();
    console.log("RMA enfileirado:", result.protocolo);
    return result;
  } catch (err) {
    console.error("Falha na requisicao:", err.message);
    return null;
  }
}

// ============ EXEMPLO 2: Usando axios ============

const axios = require("axios");

async function enviarRmaAxios(telefone, imagemUrl, dadosRma) {
  try {
    const response = await axios.post("http://localhost:3100/enviar-rma", {
      telefone,
      imagem: imagemUrl,
      rma: dadosRma
    });

    console.log("Protocolo:", response.data.protocolo);
    return response.data;
  } catch (err) {
    console.error("Erro:", err.response?.data?.erro || err.message);
    return null;
  }
}

// ============ EXEMPLO 3: Integracao com Express (seu sistema) ============

const express = require("express");
const app = express();

app.post("/criar-rma", express.json(), async (req, res) => {
  try {
    const { telefone, imagemProduto, cliente, empresa, cnpj, email, fone, cep, endereco, rastreio, nf_cliente, data_compra, nf_keepdata, numero_serie, estoque_retorna } = req.body;

    // 1. Salvar RMA no seu banco de dados
    // const rmaId = await salvarNoDb({...});

    // 2. Enviar notificacao via WhatsApp
    const payload = {
      telefone,
      imagem: imagemProduto,
      rma: {
        empresa,
        cliente,
        cnpj,
        email,
        fone,
        cep,
        endereco,
        rastreio,
        nf_cliente,
        data_compra,
        nf_keepdata,
        numero_serie,
        estoque_retorna
      }
    };

    const response = await fetch("http://localhost:3100/enviar-rma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        erro: "Falha ao notificar cliente via WhatsApp"
      });
    }

    return res.json({
      ok: true,
      mensagem: "RMA criado e cliente notificado",
      protocolo: result.protocolo
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

// ============ EXEMPLO 4: Converter imagem para base64 ============

const fs = require("fs");
const path = require("path");

function imagemParaBase64(caminhoArquivo) {
  const ext = path.extname(caminhoArquivo).toLowerCase().slice(1);
  const mimeType = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp"
  }[ext];

  if (!mimeType) {
    throw new Error("Formato nao suportado: " + ext);
  }

  const dados = fs.readFileSync(caminhoArquivo);
  const base64 = dados.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

// Uso:
// const imagemBase64 = imagemParaBase64("c:/caminho/produto.jpg");
// enviarRmaViaWhatsapp("5547999999999", imagemBase64, {...});

// ============ EXEMPLO 5: Validar numero WhatsApp ============

function validarTelefone(telefone) {
  const digits = String(telefone).replace(/\D/g, "");
  
  if (digits.length < 12 || digits.length > 13) {
    return { valido: false, erro: "Numero deve ter 12 ou 13 digitos (com DDI 55)" };
  }

  if (!digits.startsWith("55")) {
    return { valido: false, erro: "Numero deve iniciar com 55 (DDI Brasil)" };
  }

  return { valido: true, formatado: `${digits}@s.whatsapp.net` };
}

// Uso:
// const validacao = validarTelefone("5547999999999");
// if (validacao.valido) { /* enviar */ }

module.exports = {
  enviarRmaViaWhatsapp,
  enviarRmaAxios,
  imagemParaBase64,
  validarTelefone
};
