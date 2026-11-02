#!/usr/bin/env node
// Põe nos cartões do Trello a etiqueta de categoria e o "Destaque" que o site já usa.
// Serve para a migração inicial: evita que todos os apoiantes fiquem "Empresa".
//
// Uso: node scripts/etiquetar-cartoes.mjs [--dry-run]
// Variáveis de ambiente: TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { credenciais, trello, etiquetas } from "./trello.mjs";
import { chave } from "./apoiantes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

// "tipo" do site -> categoria do Trello
const CATEGORIA_POR_TIPO = {
  particular: "Particular",
  instituicao: "Instituição",
  associacao: "Associação",
};
const SEM_CATEGORIA = new Set(["particular", "instituicao", "associacao", "outro"]);

const c = { ...credenciais(), boardId: process.env.TRELLO_BOARD_ID };
if (!c.boardId) throw new Error("Falta TRELLO_BOARD_ID.");

const lista = JSON.parse(readFileSync(join(RAIZ, "data", "apoiantes.json"), "utf8"));
const etiq = await etiquetas(c.boardId, c);
const idEtiqueta = nome => etiq.find(e => chave(e.name) === chave(nome))?.id;
const cartoes = await trello(`/boards/${c.boardId}/cards`, { params: { fields: "name,idLabels", filter: "all" }, ...c });

for (const a of lista) {
  const cartao = cartoes.find(x => chave(x.name) === chave(a.nome));
  if (!cartao) { console.log(`? "${a.nome}" não está no quadro`); continue; }

  const categoria = CATEGORIA_POR_TIPO[a.tipo] || (SEM_CATEGORIA.has(a.tipo) ? "" : "Empresa");
  const queridas = [categoria, a.destaque ? "Destaque" : ""].map(idEtiqueta).filter(Boolean);
  const atuais = cartao.idLabels || [];
  if (queridas.every(id => atuais.includes(id))) { console.log(`= "${a.nome}" já tem as etiquetas`); continue; }

  const novas = [...new Set([...atuais, ...queridas])];
  if (DRY) { console.log(`[dry-run] "${a.nome}" → ${categoria || "(sem categoria)"}${a.destaque ? " + Destaque" : ""}`); continue; }
  await trello(`/cards/${cartao.id}`, { metodo: "PUT", params: { idLabels: novas.join(",") }, ...c });
  console.log(`~ "${a.nome}" → ${categoria || "(sem categoria)"}${a.destaque ? " + Destaque" : ""}`);
}
