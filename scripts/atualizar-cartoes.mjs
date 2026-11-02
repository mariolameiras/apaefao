#!/usr/bin/env node
// Atualiza a descrição dos cartões já existentes no Trello, a partir de data/apoiantes.json.
// Serve para a migração inicial: põe "Website:" e "Descrição:" em cada cartão.
//
// Uso: node scripts/atualizar-cartoes.mjs [--dry-run]
// Variáveis de ambiente: TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { credenciais, trello } from "./trello.mjs";
import { chave } from "./apoiantes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

const c = { ...credenciais(), boardId: process.env.TRELLO_BOARD_ID };
if (!c.boardId) throw new Error("Falta TRELLO_BOARD_ID.");

const lista = JSON.parse(readFileSync(join(RAIZ, "data", "apoiantes.json"), "utf8"));
const cartoes = await trello(`/boards/${c.boardId}/cards`, { params: { fields: "name,desc", filter: "all" }, ...c });

for (const a of lista) {
  const cartao = cartoes.find(x => chave(x.name) === chave(a.nome));
  if (!cartao) { console.log(`? "${a.nome}" não está no quadro`); continue; }
  const linhas = [];
  // Se o cartão já tem "Website:" (ex.: o link do mapa importado), mantém-se.
  const jaTemWebsite = /^\s*website\s*:/im.test(cartao.desc || "");
  if (a.website && !jaTemWebsite) linhas.push(`Website: ${a.website}`);
  if (a.descricao) linhas.push(`Descrição: ${a.descricao}`);
  const desc = linhas.join("\n");
  if (desc === cartao.desc) { console.log(`= "${a.nome}" já está certo`); continue; }
  if (DRY) { console.log(`[dry-run] "${a.nome}" → ${JSON.stringify(desc)}`); continue; }
  await trello(`/cards/${cartao.id}`, { metodo: "PUT", params: { desc }, ...c });
  console.log(`~ "${a.nome}" atualizado`);
}
