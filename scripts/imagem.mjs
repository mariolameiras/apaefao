// Converte e normaliza um logótipo para JPEG (máx. 800 px, sem metadados).
// Usa o ImageMagick (disponível nos runners do GitHub e localmente).
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "image/heic", "image/avif"]);
const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_LADO = 800;

export function tipoAceite(tipo) {
  return TIPOS.has(String(tipo || "").toLowerCase());
}

// Devolve { dados: Buffer(jpeg), largura, altura } ou lança erro.
export function normalizarImagem(dados, tipo) {
  if (!tipoAceite(tipo)) throw new Error(`tipo de ficheiro não suportado (${tipo || "desconhecido"})`);
  if (dados.length > MAX_BYTES) throw new Error(`imagem demasiado grande (${(dados.length / 1024 / 1024).toFixed(1)} MB)`);

  const dir = mkdtempSync(join(tmpdir(), "logo-"));
  const entrada = join(dir, "entrada");
  const saida = join(dir, "saida.jpg");
  try {
    writeFileSync(entrada, dados);
    // -auto-orient: respeita a rotação EXIF; -strip: remove metadados; fundo branco para PNG/GIF transparentes.
    const r = spawnSync("magick", [
      entrada, "-auto-orient", "-strip",
      "-background", "white", "-alpha", "remove", "-alpha", "off",
      "-resize", `${MAX_LADO}x${MAX_LADO}>`,
      "-quality", "82",
      saida,
    ], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`ImageMagick falhou: ${(r.stderr || "").trim().split("\n").pop()}`);
    const jpeg = readFileSync(saida);
    const dim = spawnSync("magick", ["identify", "-format", "%w %h", saida], { encoding: "utf8" });
    const [largura, altura] = (dim.stdout || "").trim().split(/\s+/).map(Number);
    return { dados: jpeg, largura, altura };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
