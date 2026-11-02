#!/usr/bin/env node
// Prepara o quadro do Trello: listas, etiquetas e (opcionalmente) os apoiantes atuais.
//
// Uso:
//   node scripts/preparar-quadro.mjs                 (cria listas e etiquetas que faltem)
//   node scripts/preparar-quadro.mjs --importar      (e copia os 21 apoiantes de data/apoiantes.json
//                                                     para a lista "Publicados")
//
// É seguro correr mais do que uma vez: não duplica listas nem etiquetas.
// Variáveis de ambiente: TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { credenciais, trello, listas, etiquetas } from "./trello.mjs";
import { CATEGORIAS, chave } from "./apoiantes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORTAR = process.argv.includes("--importar");

const NOMES_LISTAS = ["Novos Apoiantes", "Em Validação", "Aprovados", "Publicados", "Arquivados"];
// Etiquetas de categoria (cores fixas para os colaboradores distinguirem de relance).
const CORES = {
  Empresa: "blue",
  "Instituição": "purple",
  "Associação": "green",
  Particular: "yellow",
  Outro: "orange",
  Destaque: "red",
};

const MODELO = `Website: https://exemplo.pt
Descrição: Uma frase sobre o apoiante.
Categoria: Empresa
Destaque: Não`;

async function main() {
  const c = { ...credenciais(), boardId: process.env.TRELLO_BOARD_ID };
  if (!c.boardId) throw new Error("Falta TRELLO_BOARD_ID.");

  // Listas
  const existentes = await listas(c.boardId, c);
  const porNome = nome => existentes.find(l => chave(l.name) === chave(nome));
  const ids = {};
  for (const nome of NOMES_LISTAS) {
    const l = porNome(nome);
    if (l) { ids[nome] = l.id; console.log(`= lista "${nome}" já existe`); continue; }
    const criada = await trello(`/boards/${c.boardId}/lists`, { metodo: "POST", params: { name: nome, pos: "bottom" }, ...c });
    ids[nome] = criada.id;
    console.log(`+ lista "${nome}" criada`);
  }

  // Etiquetas
  const atuais = await etiquetas(c.boardId, c);
  const nomesDesejados = [...CATEGORIAS, "Destaque"];
  for (const nome of nomesDesejados) {
    const l = atuais.find(e => chave(e.name) === chave(nome));
    if (l) { console.log(`= etiqueta "${nome}" já existe`); continue; }
    // Reaproveita uma etiqueta sem nome da cor certa, se houver (o Trello cria 6 por omissão).
    const livre = atuais.find(e => !e.name && e.color === CORES[nome]);
    if (livre) {
      await trello(`/labels/${livre.id}`, { metodo: "PUT", params: { name: nome }, ...c });
      livre.name = nome;
      console.log(`~ etiqueta "${nome}" (cor ${CORES[nome]}) nomeada`);
    } else {
      const nova = await trello(`/boards/${c.boardId}/labels`, { metodo: "POST", params: { name: nome, color: CORES[nome] }, ...c });
      atuais.push(nova);
      console.log(`+ etiqueta "${nome}" criada`);
    }
  }

  // Importação dos apoiantes atuais
  if (IMPORTAR) {
    const ficheiro = join(RAIZ, "data", "apoiantes.json");
    if (!existsSync(ficheiro)) throw new Error("Não encontrei data/apoiantes.json.");
    const lista = JSON.parse(readFileSync(ficheiro, "utf8"));
    const noQuadro = await trello(`/boards/${c.boardId}/cards`, { params: { fields: "name", filter: "all" }, ...c });
    const jaExistem = new Set(noQuadro.map(x => chave(x.name)));
    const etiq = await etiquetas(c.boardId, c);
    const idEtiqueta = nome => etiq.find(e => chave(e.name) === chave(nome))?.id;

    for (const a of lista) {
      if (jaExistem.has(chave(a.nome))) { console.log(`= "${a.nome}" já está no quadro`); continue; }
      const linhas = [];
      if (a.maps_url) linhas.push(`Website: ${a.maps_url}`);
      if (a.evento) linhas.push(`Descrição: Apoiou no ${a.evento}.`);
      const idLabels = [idEtiqueta("Empresa")].filter(Boolean);
      const cartao = await trello("/cards", {
        metodo: "POST",
        params: { idList: ids["Publicados"], name: a.nome, desc: linhas.join("\n"), pos: "bottom", idLabels: idLabels.join(",") },
        ...c,
      });
      // Anexa a imagem atual do site (se existir).
      if (a.logo && existsSync(join(RAIZ, a.logo))) {
        const dados = readFileSync(join(RAIZ, a.logo));
        const nome = a.logo.split("/").pop();
        const q = new URLSearchParams({ key: c.key, token: c.token, name: nome });
        const form = new FormData();
        form.append("file", new Blob([dados]), nome);
        const r = await fetch(`https://api.trello.com/1/cards/${cartao.id}/attachments?${q}`, { method: "POST", body: form });
        if (!r.ok) console.log(`  ⚠️ anexo de "${a.nome}" falhou (${r.status})`);
      }
      console.log(`+ cartão "${a.nome}" em Publicados`);
    }
  }

  console.log("\nListas:", Object.entries(ids).map(([n, id]) => `${n}=${id}`).join(" "));
  console.log("\nModelo de descrição para novos cartões:\n" + MODELO);
}

main().catch(e => { console.log(`::error::${e.message}`); process.exit(1); });
