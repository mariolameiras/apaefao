// Apoiantes: faixa contínua na página inicial e grelha em apoiantes.html.
// Dados em data/apoiantes.json (gerado a partir do Trello por scripts/sincronizar-apoiantes.mjs).
// Só aparecem os que têm "publicar": true.
// "logo" = imagem do apoiante. Sem logo, aparece a imagem por omissão (sem-imagem.jpg).
// "logoInteiro": true mostra a imagem inteira (para logótipos). Sem isto, a imagem enche o quadrado.
// "tamanho" do cartão na página dos apoiantes (quem ofereceu mais, maior):
//   "grande" (2×2), "alto" (1×2), "largo" (2×1) ou "pequeno".
// "ordem" = ordem no Trello (usada na faixa da página inicial); "destaque" = etiqueta "Destaque".

// Imagem por omissão para os apoiantes que não têm logótipo.
const IMAGEM_OMISSAO = "img/apoiantes/sem-imagem.jpg";

function cartaoApoiante(a, i) {
  const el = document.createElement("div");
  el.className = "apoiante";
  const imagem = a.logo
    ? `<div class="apoiante-img"><img src="${escapar(a.logo)}" alt="${escapar(a.nome)}" loading="lazy"${a.logoInteiro ? ' class="inteiro"' : ""}></div>`
    : `<div class="apoiante-img"><img src="${IMAGEM_OMISSAO}" alt="" loading="lazy"></div>`;
  const links = [];
  if (a.maps_url) links.push(`<a href="${escapar(a.maps_url)}" target="_blank" rel="noopener">${a.maps_url.includes("instagram.com") ? "📷 Ver no Instagram" : "📍 Ver no mapa"}</a>`);
  if (a.website && a.website !== a.maps_url) links.push(`<a href="${escapar(a.website)}" target="_blank" rel="noopener">🌐 Website</a>`);
  const descricao = a.descricao ? `<p class="apoiante-descricao">${escapar(a.descricao)}</p>` : "";
  el.innerHTML = imagem + `<h3>${escapar(a.nome)}</h3>` + descricao + links.join("");
  return el;
}

// Ordem do site: a ordem do Trello; os destacados primeiro.
function ordenarApoiantes(lista) {
  return lista
    .map((a, i) => [a, i])
    .sort((x, y) => (Number(y[0].destaque) - Number(x[0].destaque)) || ((x[0].ordem ?? 0) - (y[0].ordem ?? 0)) || x[0].nome.localeCompare(y[0].nome, "pt"))
    .map(([a]) => a);
}

// Página inicial: faixa lenta sem fim. Para com o rato em cima, ou com um toque.
async function faixaApoiantes(el) {
  const lista = await carregarJSON("data/apoiantes.json", el);
  if (!lista) return;
  const publicos = ordenarApoiantes(lista.filter(a => a.publicar));
  const faixa = document.createElement("div");
  faixa.className = "faixa-apoiantes";
  publicos.forEach((a, i) => faixa.appendChild(cartaoApoiante(a, i)));
  if (MOVIMENTO) {
    // A lista repete-se uma vez para a faixa dar a volta sem salto.
    publicos.forEach((a, i) => {
      const c = cartaoApoiante(a, i);
      c.setAttribute("aria-hidden", "true");
      c.querySelectorAll("a").forEach(l => { l.tabIndex = -1; });
      faixa.appendChild(c);
    });
    faixa.style.setProperty("--dur", publicos.length * 4 + "s");
    el.classList.add("a-andar");
    el.addEventListener("click", e => { if (!e.target.closest("a")) el.classList.toggle("parado"); });
  }
  el.appendChild(faixa);
}

// Página dos apoiantes: blocos de vários tamanhos que encaixam (estilo Mondrian) e contador.
const CASAS = { grande: 4, alto: 2, largo: 2, pequeno: 1 };   // quantas casas da grelha ocupa cada tamanho

async function grelhaApoiantes(el, contador) {
  const lista = await carregarJSON("data/apoiantes.json", el);
  if (!lista) return;
  const publicos = lista.map((a, i) => [a, i]).filter(([a]) => a.publicar);
  const tamanho = a => CASAS[a.tamanho] ? a.tamanho : "pequeno";

  // Ordem: 1.º grande, os altos com dois pequenos ao lado, os largos, os outros grandes, o resto.
  // Dentro de cada tamanho, por ordem alfabética (como sempre foi).
  const por = { grande: [], alto: [], largo: [], pequeno: [] };
  publicos.sort((x, y) => x[0].nome.localeCompare(y[0].nome, "pt")).forEach(p => por[tamanho(p[0])].push(p));
  const ordem = [
    ...por.grande.slice(0, 1), ...por.alto, ...por.pequeno.splice(0, 2 * por.alto.length),
    ...por.largo, ...por.grande.slice(1), ...por.pequeno,
  ];
  ordem.forEach(([a, i]) => {
    const c = cartaoApoiante(a, i);
    c.classList.add(tamanho(a));
    el.appendChild(c);
  });

  // Se a última linha ficar com um buraco, o último cartão estica para o tapar.
  function taparBuraco() {
    const ultimo = el.lastElementChild;
    if (!ultimo) return;
    ultimo.style.gridColumn = "";
    const colunas = getComputedStyle(el).gridTemplateColumns.split(" ").length;
    const casas = ordem.reduce((s, [a]) => s + CASAS[tamanho(a)], 0);
    const falta = (colunas - casas % colunas) % colunas;
    if (falta) ultimo.style.gridColumn = "span " + (falta + 1);
  }
  taparBuraco();
  addEventListener("resize", taparBuraco);

  const alvo = publicos.length;
  if (!MOVIMENTO) { contador.textContent = alvo; return; }
  const inicio = performance.now();
  (function passo(t) {
    const p = Math.min(1, (t - inicio) / 600);
    contador.textContent = Math.round(alvo * p);
    if (p < 1) requestAnimationFrame(passo);
  })(inicio);
}

document.querySelectorAll("[data-faixa-apoiantes]").forEach(el => faixaApoiantes(el));
document.querySelectorAll("[data-todos-apoiantes]").forEach(el => grelhaApoiantes(el, document.getElementById("contador")));
