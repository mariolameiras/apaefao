// Regras de leitura dos cartões do Trello e de geração de data/apoiantes.json.
// Sem dependências: pode ser testado com `node --test`.

export const CATEGORIAS = ["Empresa", "Instituição", "Associação", "Particular", "Outro"];

// Categorias -> "tipo" do site (escolhe o ícone quando não há logótipo).
const TIPO_POR_CATEGORIA = {
  Empresa: "loja",
  Instituição: "instituicao",
  Associação: "associacao",
  Particular: "particular",
  Outro: "outro",
};

// Normaliza texto para comparar etiquetas/linhas ("Instituicao" == "Instituição").
export function chave(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();
}

// Nome de ficheiro seguro a partir do nome do apoiante (sem acentos, sem espaços).
export function slug(texto) {
  return chave(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "apoiante";
}

// Versão curta e estável do nome (para distinguir ficheiros de nomes iguais).
export function identificador(texto) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h.toString(36).padStart(7, "0").slice(-7);
}

// Lê linhas "Campo: valor" da descrição do cartão.
// Aceita "Website:", "Site:", "Descrição:", "Descricao:", "Categoria:", "Destaque:".
export function lerDescricao(desc) {
  const campos = { website: "", descricao: "", categoria: "", destaque: null };
  const restantes = [];
  for (const linha of String(desc || "").split(/\r?\n/)) {
    const m = linha.match(/^\s*([^:]{1,30})\s*:\s*(.*)$/);
    if (!m) { restantes.push(linha); continue; }
    const nome = chave(m[1]);
    const valor = m[2].trim();
    if (["website", "site", "link", "pagina", "página"].includes(nome)) campos.website = valor;
    else if (["descricao", "descrição", "sobre", "texto"].includes(nome)) campos.descricao = valor;
    else if (["categoria", "categoria (empresa, instituicao, associacao, particular ou outro)"].includes(nome)) campos.categoria = valor;
    else if (["destaque", "destaque (sim/nao)", "destaque (sim/não)"].includes(nome)) campos.destaque = valor;
    else restantes.push(linha);
  }
  // O que não for "Campo: valor" conta como descrição (se ainda não houver).
  const solto = restantes.join("\n").trim();
  if (!campos.descricao && solto) campos.descricao = solto;
  return campos;
}

// Normaliza um URL: acrescenta https:// se faltar; devolve "" se inválido.
export function normalizarUrl(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

// Verifica uma linha "Destaque: sim/nao". Devolve true/false/null (não indicado).
export function lerSimNao(texto) {
  const t = chave(texto);
  if (!t) return null;
  if (["sim", "s", "yes", "y", "true", "x"].includes(t)) return true;
  if (["nao", "não", "n", "no", "false"].includes(t)) return false;
  return null;
}

// Interpreta um cartão do Trello. Devolve { registo, avisos, erro }.
// registo segue o formato de data/apoiantes.json (o site atual continua a funcionar).
export function lerCartao(cartao, { etiquetas = [], posicao = 0 } = {}) {
  const avisos = [];
  const nome = String(cartao.name || "").trim();
  const campos = lerDescricao(cartao.desc);
  const labels = (cartao.idLabels || [])
    .map(id => etiquetas.find(e => e.id === id))
    .filter(Boolean);

  // Categoria: etiqueta com nome de categoria; senão "Categoria:" na descrição; senão Outro.
  let categoria = "";
  for (const l of labels) {
    const c = CATEGORIAS.find(cat => chave(cat) === chave(l.name));
    if (c) { categoria = c; break; }
  }
  if (!categoria && campos.categoria) {
    categoria = CATEGORIAS.find(cat => chave(cat) === chave(campos.categoria)) || "";
    if (!categoria) avisos.push(`categoria desconhecida "${campos.categoria}" (use: ${CATEGORIAS.join(", ")})`);
  }
  if (!categoria) categoria = "Outro";
  // Destaque: etiqueta "Destaque" ou "Destaque: sim" na descrição.
  const destaque = labels.some(l => chave(l.name) === "destaque") || lerSimNao(campos.destaque) === true;

  const website = normalizarUrl(campos.website);
  if (campos.website && !website) avisos.push(`website inválido "${campos.website}" (use https://…)`);

  if (!nome) return { erro: "o cartão não tem nome", avisos };
  // Com problemas, o cartão não é publicado (fica na lista e recebe um comentário).
  if (avisos.length) return { erro: avisos.join("; "), avisos };

  const registo = {
    nome,
    descricao: campos.descricao.replace(/\s+/g, " ").trim(),
    website,
    categoria,
    destaque,
    ordem: posicao,
    tipo: TIPO_POR_CATEGORIA[categoria] || "outro",
    logo: "",
    publicar: true,
  };
  // O "website" pode ser um link de mapa/Instagram (o site mostra "Ver no mapa").
  // Nesse caso guarda-se também em "maps_url", como o site sempre usou.
  if (website && /google\.com\/maps|instagram\.com/.test(website)) registo.maps_url = website;
  return { registo, avisos };
}

// Compara dois registos ignorando campos voláteis.
export function iguais(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Escreve o JSON no formato do site (2 espaços, acentos legíveis, nova linha no fim).
export function serializar(lista) {
  return JSON.stringify(lista, null, 1) + "\n";
}
