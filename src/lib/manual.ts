import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Camada de acesso ao Manual do usuário (`docs/manual/**`). Fonte única: os arquivos
 * `.md` + `search-index.json` versionados no repositório. Lido em runtime do servidor
 * (cwd = root do repo no deploy nativo). Mesmo espírito anti-traversal de `lib/storage.ts`.
 */

const MANUAL_DIR = path.join(process.cwd(), "docs", "manual");

export type PaginaManual = {
  /** Caminho relativo sem extensão, ex.: "financeiro/lancamentos" ("" = raiz). */
  slug: string;
  titulo: string;
  descricao: string;
  /** Corpo markdown sem o frontmatter. */
  corpo: string;
  /** Diretório da página (para resolver links relativos), ex.: "financeiro". */
  baseDir: string;
};

export type EntradaManifesto = {
  titulo: string;
  /** Caminho do arquivo relativo a docs/manual, ex.: "financeiro/lancamentos.md". */
  path: string;
  descricao: string;
  resumo: string;
  tags: string[];
  palavrasChave: string[];
  sinonimos: string[];
};

export type ResultadoManual = { path: string; titulo: string; descricao: string };

export type SecaoManual = {
  /** 1º segmento do path, ex.: "financeiro". "" para páginas-raiz (README/quick-start…). */
  chave: string;
  titulo: string;
  paginas: { slug: string; titulo: string; descricao: string }[];
};

/** Rótulos amigáveis por seção (1º segmento do path). */
const SECAO_LABEL: Record<string, string> = {
  "": "Geral",
  inicio: "Início e Portal",
  projetos: "Projetos",
  "clientes-comercial": "Clientes e Comercial",
  financeiro: "Financeiro",
  "rh-ponto": "RH e Ponto",
  engenharia: "Engenharia",
  gestao: "Gestão",
  comunicacao: "Comunicação",
  sistema: "Sistema",
};

/** Resolve um slug ([] = raiz) para um arquivo .md DENTRO de MANUAL_DIR, ou null. */
async function resolverSlug(slug: string[]): Promise<{ full: string; baseDir: string } | null> {
  // Cada segmento só pode conter caracteres seguros (sem "..", sem barras).
  if (slug.some((s) => !/^[a-zA-Z0-9._-]+$/.test(s) || s === ".." || s === ".")) return null;

  const rel = slug.join("/");
  const candidatos = rel ? [`${rel}.md`, `${rel}/README.md`] : ["README.md"];

  for (const c of candidatos) {
    const full = path.resolve(MANUAL_DIR, c);
    const dentro = path.relative(MANUAL_DIR, full);
    if (dentro.startsWith("..") || path.isAbsolute(dentro)) continue; // anti-traversal
    try {
      await fs.access(full);
      // baseDir = diretório do arquivo relativo a MANUAL_DIR (para resolver links).
      const baseDir = path.dirname(dentro).split(path.sep).join("/");
      return { full, baseDir: baseDir === "." ? "" : baseDir };
    } catch {
      /* tenta o próximo candidato */
    }
  }
  return null;
}

/** Separa o frontmatter YAML inicial (--- … ---) do corpo; extrai escalares `titulo`/`descricao`. */
function separarFrontmatter(texto: string): { meta: Record<string, string>; corpo: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(texto);
  if (!m) return { meta: {}, corpo: texto };
  const meta: Record<string, string> = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const par = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(linha);
    if (par) meta[par[1]] = par[2].replace(/^["']|["']$/g, "").trim();
  }
  return { meta, corpo: texto.slice(m[0].length) };
}

/** Lê e renderiza os metadados de uma página do manual. Retorna null se não existir. */
export async function lerPaginaManual(slug: string[]): Promise<PaginaManual | null> {
  const resolvido = await resolverSlug(slug);
  if (!resolvido) return null;
  const texto = await fs.readFile(resolvido.full, "utf8");
  const { meta, corpo } = separarFrontmatter(texto);
  // Título de fallback = primeiro "# " do corpo, ou o último segmento do slug.
  const h1 = /^#\s+(.+)$/m.exec(corpo);
  return {
    slug: slug.join("/"),
    titulo: meta.titulo || h1?.[1]?.trim() || (slug.at(-1) ?? "Manual"),
    descricao: meta.descricao || "",
    corpo,
    baseDir: resolvido.baseDir,
  };
}

let manifestoCache: EntradaManifesto[] | null = null;

/** Lê (com cache) o search-index.json do manual. */
export async function lerManifesto(): Promise<EntradaManifesto[]> {
  if (manifestoCache) return manifestoCache;
  try {
    const texto = await fs.readFile(path.join(MANUAL_DIR, "search-index.json"), "utf8");
    const json = JSON.parse(texto) as { paginas?: EntradaManifesto[] };
    manifestoCache = json.paginas ?? [];
  } catch {
    manifestoCache = [];
  }
  return manifestoCache;
}

/** Converte um `path` do manifesto ("financeiro/lancamentos.md") em slug de rota ("financeiro/lancamentos"). */
export function pathParaSlug(p: string): string {
  return p.replace(/\/README\.md$/i, "").replace(/\.md$/i, "");
}

/** Agrupa o manifesto por seção (1º segmento do path) para índices e navegação lateral. */
export async function listarSecoes(): Promise<SecaoManual[]> {
  const manifesto = await lerManifesto();
  const mapa = new Map<string, SecaoManual["paginas"]>();
  for (const e of manifesto) {
    const chave = e.path.includes("/") ? e.path.split("/")[0] : "";
    const lista = mapa.get(chave) ?? [];
    lista.push({ slug: pathParaSlug(e.path), titulo: e.titulo, descricao: e.descricao });
    mapa.set(chave, lista);
  }
  const ordem = Object.keys(SECAO_LABEL);
  return [...mapa.entries()]
    .sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]))
    .map(([chave, paginas]) => ({ chave, titulo: SECAO_LABEL[chave] ?? chave, paginas }));
}

/** Busca textual no manifesto (titulo/descricao/resumo/tags/palavras-chave/sinônimos). */
export async function buscarManual(termo: string, limite = 6): Promise<ResultadoManual[]> {
  const t = termo.trim().toLowerCase();
  if (t.length < 2) return [];
  const manifesto = await lerManifesto();
  const pontuar = (e: EntradaManifesto): number => {
    const titulo = e.titulo.toLowerCase();
    if (titulo === t) return 100;
    if (titulo.includes(t)) return 50;
    const campos = [e.descricao, e.resumo, ...e.tags, ...e.palavrasChave, ...e.sinonimos]
      .join(" ")
      .toLowerCase();
    return campos.includes(t) ? 10 : 0;
  };
  return manifesto
    .map((e) => ({ e, score: pontuar(e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(({ e }) => ({ path: pathParaSlug(e.path), titulo: e.titulo, descricao: e.descricao }));
}
