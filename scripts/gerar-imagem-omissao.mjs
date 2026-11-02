// Imagem por omissão dos apoiantes que não têm logótipo no Trello.
// Um girassol simples com as cores do site (fundo bege claro, flor amarela, centro castanho).
// Uso: node scripts/gerar-imagem-omissao.mjs
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "img", "apoiantes", "sem-imagem.jpg");

const L = 800, A = 600, cx = L / 2, cy = A / 2;
const PETALAS = 12;
let desenho = "";
for (let i = 0; i < PETALAS; i++) {
  const ang = (360 / PETALAS) * i;
  desenho += `-fill "#ebce58" -stroke "#c9a72c" -strokewidth 4 ` +
    `-draw "translate ${cx},${cy} rotate ${ang} ellipse 0,-150 52 98 0,360" `;
}
desenho += `-fill "#8a6a2f" -stroke "#1f1a14" -strokewidth 5 -draw "circle ${cx},${cy} ${cx + 62},${cy}" `;

const r = spawnSync("bash", ["-c",
  `magick -size ${L}x${A} xc:"#fbeec9" ${desenho} -quality 82 "${SAIDA}"`], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log("Criado", SAIDA);
