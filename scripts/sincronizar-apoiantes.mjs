#!/usr/bin/env node
// Sincroniza os apoiantes do Trello com data/apoiantes.json e img/apoiantes/.
//
// Uso:
//   node scripts/sincronizar-apoiantes.mjs --dry-run     (não escreve nada)
//   node scripts/sincronizar-apoiantes.mjs               (escreve os ficheiros)
//   node scripts/sincronizar-apoiantes.mjs --confirmar   (após o deploy: move cartões para "Publicados")
//
// Variáveis de ambiente:
//   TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID
//   TRELLO_LISTA_APROVADOS   (nome da lista; por omissão "Aprovados")
//   TRELLO_LISTA_PUBLICADOS  (nome da lista; por omissão "Publicados")
//   TRELLO_DRY_RUN=1         (equivalente a --dry-run; nunca altera o Trello)
//   TRELLO_SEM_ALTERAR=1     (nunca altera o Trello, mas escreve os ficheiros)
//   SITE_URL                 (por omissão https://apaefao.pt) — usado por --confirmar

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { credenciais, trello, listas, etiquetas, cartoes, moverCartao, comentar, descarregarAnexo } from "./trello.mjs";
import { normalizarImagem, tipoAceite } from "./imagem.mjs";
import { lerCartao, serializar, chave, slug, identificador } from "./apoiantes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_APOIANTES = join(RAIZ, "data", "apoiantes.json");
const IMG_DIR = join(RAIZ, "img", "apoiantes");

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run") || process.env.TRELLO_DRY_RUN === "1";
const ALTERAR = !DRY && process.env.TRELLO_SEM_ALTERAR !== "1";
const CONFIRMAR = args.has("--confirmar");
const SITE_URL = (process.env.SITE_URL || "https://apaefao.pt").replace(/\/$/, "");

const log = (...a) => console.log(...a);
const aviso = (...a) => console.log("⚠️ ", ...a);

// ---------- Leitura do Trello ----------

async function lerQuadro(c) {
  const boardId = c.boardId;
  const [ls, es, cs] = await Promise.all([listas(boardId, c), etiquetas(boardId, c), cartoes(boardId, c)]);
  const porNome = nome => ls.find(l => chave(l.name) === chave(nome));
  const aprovados = porNome(process.env.TRELLO_LISTA_APROVADOS || "Aprovados");
  const publicados = porNome(process.env.TRELLO_LISTA_PUBLICADOS || "Publicados");
  if (!aprovados) throw new Error(`Não encontrei a lista "Aprovados" no quadro. Listas: ${ls.map(l => l.name).join(", ")}`);
  if (!publicados) throw new Error(`Não encontrei a lista "Publicados" no quadro. Listas: ${ls.map(l => l.name).join(", ")}`);
  return { aprovados, publicados, etiquetas: es, cartoes: cs };
}

// ---------- Imagens ----------

// Lê um JSON; se não existir ou estiver inválido, devolve o valor por omissão.
function lerJSON(caminho, porOmissao) {
  try { return JSON.parse(readFileSync(caminho, "utf8")); } catch { return porOmissao; }
}

// Imagens geridas pelo script: ficheiros listados em data/apoiantes.json com nome
// "img/apoiantes/<slug>.jpg" (os nomes antigos, tipo "alec.jpg", nunca são apagados).
function imagensGeridas() {
  if (!existsSync(JSON_APOIANTES)) return new Set();
  try {
    const lista = JSON.parse(readFileSync(JSON_APOIANTES, "utf8"));
    return new Set(lista
      .map(a => String(a.logo || ""))
      .filter(l => l.startsWith("img/apoiantes/"))
      .map(l => l.slice("img/apoiantes/".length))
      .filter(f => /^[a-z0-9-]+\.jpg$/.test(f)));
  } catch {
    return new Set();
  }
}

function escolherAnexo(cartao) {
  const anexos = (cartao.attachments || []).filter(a => tipoAceite(a.mimeType) || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|avif)$/i.test(a.name || ""));
  if (!anexos.length) return null;
  // Prefere o anexo que é a capa do cartão; senão o mais recente.
  if (cartao.idAttachmentCover) {
    const capa = anexos.find(a => a.id === cartao.idAttachmentCover);
    if (capa) return capa;
  }
  return anexos.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
}

// Comenta um problema no cartão, mas só se ainda não houver um comentário igual.
async function avisarNoCartao(cartao, texto, c) {
  if (!ALTERAR) return;
  const acoes = await trello(`/cards/${cartao.id}/actions`, { params: { filter: "commentCard" }, ...c });
  if (acoes.some(a => (a.data?.text || "").includes(texto))) return;
  await comentar(cartao.id, `⚠️ Não publicado: ${texto}.`, c);
}
// ---------- Sincronização ----------
async function sincronizar() {
  const c = { ...credenciais(), boardId: process.env.TRELLO_BOARD_ID };
  if (!c.boardId) throw new Error("Falta TRELLO_BOARD_ID.");

  const quadro = await lerQuadro(c);
  const relevantes = quadro.cartoes
    .filter(cartao => [quadro.aprovados.id, quadro.publicados.id].includes(cartao.idList))
    .sort((a, b) => a.pos - b.pos);

  log(`Trello: ${relevantes.length} cartão(ões) em Aprovados/Publicados.`);

  const existentes = imagensGeridas();
  const anteriores = lerJSON(JSON_APOIANTES, []);   // data/apoiantes.json como está agora
  const usados = new Set();
  const nomesVistos = new Map();   // nome -> quantas vezes aparece
  const lista = [];
  const novos = [];       // cartões que entraram agora (estavam em Aprovados)
  const aCriar = [];      // ficheiros de imagem a criar
  const problemas = [];

  // Nome do ficheiro da imagem: mantém o nome que o site já usa para este apoiante
  // (ex.: "casa-penetra.jpg"); só os apoiantes novos ganham um nome a partir do nome.
  const nomeImagem = (nome, id, antiga) => {
    const atual = antiga?.logo?.startsWith("img/apoiantes/") ? antiga.logo.slice("img/apoiantes/".length) : "";
    if (atual) return atual;
    const base = slug(nome);
    const repetido = nomesVistos.get(base) || 0;
    nomesVistos.set(base, repetido + 1);
    return `${base}${repetido ? "-" + identificador(id) : ""}.jpg`;
  };

  for (const cartao of relevantes) {
    const { registo, avisos, erro } = lerCartao(cartao, { etiquetas: quadro.etiquetas, posicao: lista.length });
    if (erro) {
      problemas.push(`"${cartao.name || cartao.shortUrl}": ${erro}`);
      await avisarNoCartao(cartao, erro, c);
      continue;
    }
    for (const a of avisos) aviso(`"${registo.nome}": ${a}`);

    const anexo = escolherAnexo(cartao);
    const antiga = anteriores.find(a => chave(a.nome) === chave(registo.nome));
    // Mantém o que o site já tem e o Trello não define (tipo, tamanho, imagem antiga).
    if (antiga) {
      if (antiga.tipo) registo.tipo = antiga.tipo;
      if (antiga.tamanho) registo.tamanho = antiga.tamanho;
    }
    // Imagem: se o cartão não tem anexo, mantém-se a imagem que já está no site.
    // Se tem anexo, usa-se o ficheiro existente (mesmo nome) ou cria-se um novo.
    if (!anexo) {
      if (cartao.attachments?.length) aviso(`"${registo.nome}": o anexo não é uma imagem; o site vai mostrar a imagem por omissão.`);
      if (antiga?.logo) {
        registo.logo = antiga.logo;
        usados.add(antiga.logo.slice("img/apoiantes/".length));
      }
    } else {
      const nomeFicheiro = nomeImagem(registo.nome, cartao.id, antiga);
      usados.add(nomeFicheiro);
      registo.logo = `img/apoiantes/${nomeFicheiro}`;
      registo.anexo = anexo.id;
      if (!existsSync(join(IMG_DIR, nomeFicheiro))) {
        try {
          const { dados, tipo } = await descarregarAnexo(cartao.id, anexo, c);
          const img = normalizarImagem(dados, tipo);
          aCriar.push({ ficheiro: nomeFicheiro, dados: img.dados, nome: registo.nome });
        } catch (e) {
          // Logótipo inválido: não publica o cartão (fica na lista com um comentário).
          const texto = `o anexo não serve como logótipo (${e.message}); use uma imagem JPG ou PNG`;
          problemas.push(`"${registo.nome}": ${texto}`);
          await avisarNoCartao(cartao, texto, c);
          usados.delete(nomeFicheiro);
          continue;
        }
      }
    }

    if (cartao.idList === quadro.aprovados.id) novos.push({ id: cartao.id, nome: registo.nome });
    lista.push(registo);
  }

  // Escreve imagens novas.
  if (!DRY && aCriar.length) {
    mkdirSync(IMG_DIR, { recursive: true });
    for (const { ficheiro, dados } of aCriar) writeFileSync(join(IMG_DIR, ficheiro), dados);
    log(`Imagens novas: ${aCriar.map(i => i.nome).join(", ")}`);
  } else if (DRY && aCriar.length) {
    log(`[dry-run] Imagens que seriam criadas: ${aCriar.map(i => i.nome).join(", ")}`);
  }

  // Escreve o JSON (só se mudou).
  const novoTexto = serializar(lista);
  const antigoTexto = existsSync(JSON_APOIANTES) ? readFileSync(JSON_APOIANTES, "utf8") : "";
  const mudou = novoTexto !== antigoTexto;
  if (DRY) {
    log(`[dry-run] data/apoiantes.json ${mudou ? "mudaria" : "não muda"} (${lista.length} apoiantes).`);
  } else if (mudou) {
    writeFileSync(JSON_APOIANTES, novoTexto);
    log(`data/apoiantes.json atualizado (${lista.length} apoiantes).`);
  } else {
    log("data/apoiantes.json sem alterações.");
  }

  // Imagens novas que o JSON não usa (ex.: o JSON não mudou): apagam-se para não ficarem órfãs.
  // Só se apagam imagens que este script acabou de criar — nunca as antigas do site.
  const usadosNoJSON = new Set(lista.map(a => String(a.logo || "").replace(/^img\/apoiantes\//, "")));
  const descartar = aCriar.map(i => i.ficheiro).filter(f => !usadosNoJSON.has(f));
  if (!DRY && descartar.length) {
    for (const f of descartar) unlinkSync(join(IMG_DIR, f));
    log(`Imagens novas descartadas (não usadas): ${descartar.join(", ")}`);
  }

  // Apaga imagens de apoiantes que saíram (só as geradas por este script).
  const apagar = [...existentes].filter(f => !usados.has(f) && !usadosNoJSON.has(f) && existsSync(join(IMG_DIR, f)));
  if (!DRY && apagar.length) {
    for (const f of apagar) unlinkSync(join(IMG_DIR, f));
    log(`Imagens removidas: ${apagar.join(", ")}`);
  } else if (DRY && apagar.length) {
    log(`[dry-run] Imagens que seriam removidas: ${apagar.join(", ")}`);
  }

  if (problemas.length) {
    log("\nCartões com problemas:");
    for (const p of problemas) log(" - " + p);
  }

  // Saída para o workflow.
  if (process.env.GITHUB_OUTPUT) {
    const saída = [
      `mudou=${mudou || aCriar.length > 0 || apagar.length > 0}`,
      `json=${mudou}`,
      `total=${lista.length}`,
      `problemas=${problemas.length}`,
    ];
    writeFileSync(process.env.GITHUB_OUTPUT, saída.join("\n") + "\n", { flag: "a" });
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const linhas = ["### Apoiantes sincronizados", "", `- Aprovados + Publicados: **${lista.length}**`,
      `- Novos (a publicar): **${novos.length}**`, `- JSON alterado: **${mudou ? "sim" : "não"}**`,
      `- Imagens novas: **${aCriar.length}**`, `- Imagens removidas: **${apagar.length}**`];
    if (problemas.length) linhas.push("", "**Cartões com problemas**", ...problemas.map(p => `- ${p}`));
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join("\n") + "\n", { flag: "a" });
  }

  // Cartões com problemas: o workflow fica vermelho (mas só depois de guardar o que está bom).
  if (problemas.length && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::${problemas.length} cartão(ões) não publicados (ver o resumo da execução).`);
  }

  return { novos, total: lista.length, problemas };
}

// ---------- Confirmação (depois do deploy) ----------

async function confirmar() {
  const c = { ...credenciais(), boardId: process.env.TRELLO_BOARD_ID };
  const quadro = await lerQuadro(c);
  const locais = JSON.parse(readFileSync(JSON_APOIANTES, "utf8"));
  const nomesLocais = new Set(locais.map(a => a.nome));

  // Espera que o site público sirva esta versão (até ~10 min).
  const esperaMax = Number(process.env.ESPERA_SEGUNDOS || 600);
  const inicio = Date.now();
  let online = null;
  while (Date.now() - inicio < esperaMax) {
    try {
      const r = await fetch(`${SITE_URL}/data/apoiantes.json?ts=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const remoto = await r.json();
        const nomesRemotos = new Set(remoto.map(a => a.nome));
        if ([...nomesLocais].every(n => nomesRemotos.has(n))) { online = remoto; break; }
      }
    } catch { /* site ainda a atualizar */ }
    await new Promise(res => setTimeout(res, 15000));
  }
  if (!online) {
    console.log("::error::O site ainda não serve a versão nova; os cartões ficam em Aprovados.");
    process.exit(1);
  }
  log(`Site atualizado (${online.length} apoiantes online).`);

  const emAprovados = quadro.cartoes.filter(cartao => cartao.idList === quadro.aprovados.id);
  const publicados = [];
  for (const cartao of emAprovados) {
    const nome = String(cartao.name || "").trim();
    if (!nomesLocais.has(nome)) continue;
    if (!ALTERAR) { log(`[dry-run] moveria "${nome}" para Publicados`); continue; }
    await moverCartao(cartao.id, quadro.publicados.id, c);
    const data = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" });
    await comentar(cartao.id, `✅ Publicado no site em ${data}.`, c);
    publicados.push(nome);
  }
  log(publicados.length ? `Movidos para Publicados: ${publicados.join(", ")}` : "Nada a mover para Publicados.");
}

// ---------- Arranque ----------

try {
  if (CONFIRMAR) await confirmar();
  else await sincronizar();
} catch (e) {
  console.log(`::error::${e.message}`);
  process.exit(1);
}
