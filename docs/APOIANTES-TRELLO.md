# Apoiantes (Trello → site)

A lista de apoiantes vem de um quadro do Trello e é sincronizada por GitHub Actions.

## Como funciona

```
Trello (Aprovados + Publicados)
   └─ workflow "Sincronizar apoiantes" (1× por dia)
        ├─ scripts/sincronizar-apoiantes.mjs → data/apoiantes.json + img/apoiantes/
        ├─ commit em main (GITHUB_TOKEN)
        ├─ dispara "Publicar site" (workflow_dispatch — commits do GITHUB_TOKEN não
        │  desencadeiam o Pages por si só)
        └─ depois de o site servir a versão nova: move os cartões para "Publicados"
```

## Configuração (uma vez)

1. **Secrets** (Settings → Secrets and variables → Actions):
   `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`.
   Opcional: variável `SITE_URL` (por omissão `https://apaefao.pt`).
2. **Pages**: Settings → Pages → Source = **GitHub Actions**.
3. **Quadro**: `node scripts/preparar-quadro.mjs` cria as listas e etiquetas que faltem.

## Comandos locais

```bash
# credenciais (nunca commitidas — .env está no .gitignore)
set -a && . ./.env && set +a

node --test scripts/                       # testes das regras
node scripts/sincronizar-apoiantes.mjs --dry-run   # ver o que mudaria
node scripts/sincronizar-apoiantes.mjs             # escrever os ficheiros
node scripts/preparar-quadro.mjs --importar        # criar listas/etiquetas e importar os apoiantes
node scripts/atualizar-cartoes.mjs                 # pôr Website/Descrição nos cartões existentes
```

`--confirmar` (usado pelo workflow depois do deploy) verifica o site público e só então
move os cartões para "Publicados". Com `SITE_URL=http://localhost:8000` pode testar-se
contra o site local.

## Regras dos cartões

- Título = nome do apoiante.
- Descrição: `Website: …`, `Descrição: …`, `Categoria: …`, `Destaque: Sim/Não`.
- Etiquetas: categoria e/ou `Destaque` (têm prioridade sobre a descrição).
- Anexo de imagem = logótipo (JPG/PNG; convertido para JPEG, máx. 800 px).
- Ordem na lista = ordem no site.
- Listas lidas: **Aprovados** e **Publicados**. Arquivar remove do site.

Cartões com dados inválidos (website inválido, categoria desconhecida, imagem ilegível)
não são publicados e recebem um comentário no Trello.

## Ficheiros

- `scripts/trello.mjs` — cliente da API (paginado, com repetição em 429).
- `scripts/apoiantes.mjs` — regras de leitura/validação e serialização do JSON.
- `scripts/imagem.mjs` — normalização das imagens (ImageMagick).
- `scripts/sincronizar-apoiantes.mjs` — sincronização e confirmação.
- `scripts/preparar-quadro.mjs`, `scripts/atualizar-cartoes.mjs` — migração.
- `.github/workflows/sincronizar-apoiantes.yml`, `.github/workflows/deploy-pages.yml`.

Guia para os colaboradores: `docs/GUIA-APOIANTES.md`.
