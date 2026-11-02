// Cliente mínimo da API do Trello (sem dependências).
// Lê as credenciais de variáveis de ambiente: TRELLO_KEY, TRELLO_TOKEN.
// O token nunca é escrito em logs nem em ficheiros.

const API = "https://api.trello.com/1";

export function credenciais(env = process.env) {
  const key = env.TRELLO_KEY;
  const token = env.TRELLO_TOKEN;
  if (!key || !token) {
    throw new Error("Faltam TRELLO_KEY e/ou TRELLO_TOKEN (variáveis de ambiente).");
  }
  return { key, token };
}

// Chamada à API. Lança erro com a mensagem do Trello (sem credenciais).
export async function trello(caminho, { metodo = "GET", params = {}, corpo, key, token, tentativas = 3 } = {}) {
  const q = new URLSearchParams({ ...params, key, token });
  const url = `${API}${caminho}?${q}`;
  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const texto = await r.text();
      if (r.ok) return texto ? JSON.parse(texto) : null;
      // 429 = limite de pedidos; espera e tenta outra vez.
      if (r.status === 429 && i < tentativas) {
        await new Promise(res => setTimeout(res, 2000 * i));
        continue;
      }
      let detalhe = texto;
      try { detalhe = JSON.parse(texto).message || texto; } catch {}
      throw new Error(`Trello ${metodo} ${caminho} → ${r.status}: ${detalhe}`);
    } catch (e) {
      ultimoErro = e;
      if (i >= tentativas || /→ 4\d\d:/.test(e.message)) break;
      await new Promise(res => setTimeout(res, 1000 * i));
    }
  }
  throw ultimoErro;
}

export const listas = (boardId, c) =>
  trello(`/boards/${boardId}/lists`, { params: { fields: "name,pos", filter: "open" }, ...c });

export const etiquetas = (boardId, c) =>
  trello(`/boards/${boardId}/labels`, { params: { fields: "name,color", limit: "1000" }, ...c });

export const cartoes = (boardId, c) =>
  trello(`/boards/${boardId}/cards`, {
    params: { fields: "name,desc,idList,pos,closed,idLabels,shortUrl", filter: "open", attachments: "true", attachment_fields: "id,name,url,mimeType,bytes,date,isUpload" },
    ...c,
  });

export const moverCartao = (cardId, idList, c) =>
  trello(`/cards/${cardId}`, { metodo: "PUT", params: { idList }, ...c });

export const comentar = (cardId, texto, c) =>
  trello(`/cards/${cardId}/actions/comments`, { metodo: "POST", params: { text: texto }, ...c });

// Descarrega um anexo. Devolve Buffer + tipo.
export async function descarregarAnexo(cardId, anexo, c) {
  const nome = anexo.name || "anexo";
  const q = new URLSearchParams({ key: c.key, token: c.token });
  const url = `${API}/cards/${cardId}/attachments/${anexo.id}/download/${encodeURIComponent(nome)}?${q}`;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Anexo ${anexo.id} → ${r.status}`);
  const tipo = (r.headers.get("content-type") || "").split(";")[0].trim();
  return { dados: Buffer.from(await r.arrayBuffer()), tipo };
}
