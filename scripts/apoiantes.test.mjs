// Testes das regras de leitura dos cartões: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerDescricao, lerCartao, normalizarUrl, lerSimNao, chave, serializar, slug, identificador } from "./apoiantes.mjs";

const ETIQUETAS = [
  { id: "l1", name: "Empresa" },
  { id: "l2", name: "Instituição" },
  { id: "l3", name: "Destaque" },
  { id: "l4", name: "", color: "blue" },
];

test("lê Website e Descrição da descrição do cartão", () => {
  const c = lerDescricao("Website: https://exemplo.pt\nDescrição: Padaria artesanal em Fão.");
  assert.equal(c.website, "https://exemplo.pt");
  assert.equal(c.descricao, "Padaria artesanal em Fão.");
});

test("aceita acentos e variantes dos nomes dos campos", () => {
  const c = lerDescricao("Site: exemplo.pt\nDescricao: Café\nCategoria: Instituicao\nDestaque: Sim");
  assert.equal(c.website, "exemplo.pt");
  assert.equal(c.descricao, "Café");
  assert.equal(c.categoria, "Instituicao");
  assert.equal(c.destaque, "Sim");
});

test("texto solto na descrição vira descrição", () => {
  assert.equal(lerDescricao("Apoia-nos desde 2020.").descricao, "Apoia-nos desde 2020.");
});

test("URLs: acrescenta https, rejeita o resto", () => {
  assert.equal(normalizarUrl("exemplo.pt"), "https://exemplo.pt/");
  assert.equal(normalizarUrl("http://exemplo.pt/x"), "http://exemplo.pt/x");
  assert.equal(normalizarUrl("javascript:alert(1)"), "");
  assert.equal(normalizarUrl("sem ponto"), "");
  assert.equal(normalizarUrl(""), "");
});

test("sim/nao", () => {
  assert.equal(lerSimNao("Sim"), true);
  assert.equal(lerSimNao("não"), false);
  assert.equal(lerSimNao(""), null);
});

test("cartão completo: nome, categoria por etiqueta, destaque, ordem", () => {
  const cartao = {
    id: "0123456789abcdef01234567", name: "Padaria X", desc: "Website: padaria.pt\nDescrição: Pão bom.",
    idList: "a", pos: 1, idLabels: ["l1", "l3"],
  };
  const { registo, erro } = lerCartao(cartao, { etiquetas: ETIQUETAS, posicao: 3 });
  assert.equal(erro, undefined);
  assert.equal(registo.nome, "Padaria X");
  assert.equal(registo.categoria, "Empresa");
  assert.equal(registo.tipo, "loja");
  assert.equal(registo.destaque, true);
  assert.equal(registo.ordem, 3);
  assert.equal(registo.website, "https://padaria.pt/");
  assert.equal(registo.publicar, true);
  assert.equal(registo.logo, "");
});

test("categoria por descrição e por omissão Outro", () => {
  const a = lerCartao({ name: "A", desc: "Categoria: Instituição" }, { etiquetas: ETIQUETAS });
  assert.equal(a.registo.categoria, "Instituição");
  assert.equal(a.registo.tipo, "instituicao");
  const b = lerCartao({ name: "B", desc: "" }, { etiquetas: ETIQUETAS });
  assert.equal(b.registo.categoria, "Outro");
});

test("categoria desconhecida bloqueia a publicação", () => {
  const r = lerCartao({ name: "C", desc: "Categoria: Loja" }, { etiquetas: ETIQUETAS });
  assert.match(r.erro, /desconhecida/);
  assert.equal(r.registo, undefined);
});

test("website inválido bloqueia a publicação", () => {
  const r = lerCartao({ name: "D", desc: "Website: javascript:alert(1)" }, { etiquetas: ETIQUETAS });
  assert.match(r.erro, /website inválido/);
});

test("slug e identificador", () => {
  assert.equal(slug("Ana Lopes – Saúde e Bem-Estar"), "ana-lopes-saude-e-bem-estar");
  assert.equal(slug("!!!"), "apoiante");
  assert.notEqual(identificador("a"), identificador("b"));
  assert.equal(identificador("abc"), identificador("abc"));
});

test("cartão sem nome é rejeitado", () => {
  assert.match(lerCartao({ name: "  " }).erro, /nome/);
});

test("acentos sobrevivem à serialização", () => {
  const texto = serializar([{ nome: "Ramalhão", descricao: "Chalé" }]);
  assert.match(texto, /Ramalhão/);
  assert.deepEqual(JSON.parse(texto), [{ nome: "Ramalhão", descricao: "Chalé" }]);
});

test("chave ignora acentos e maiúsculas", () => {
  assert.equal(chave("Instituição"), chave("INSTITUICAO"));
});
