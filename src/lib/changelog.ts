import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Leitura do `CHANGELOG.md` da raiz do repositório — a fonte única do histórico de versões.
 *
 * O arquivo é REGERADO automaticamente pelo `commit-and-tag-version` (`npm run release`) a
 * partir dos commits Conventional, com as seções definidas em `.versionrc.json`. Como esta
 * camada lê o arquivo em runtime (cwd = root do repo no deploy nativo, igual `lib/manual.ts`),
 * a página `/versoes` fica correta sozinha a cada release — sem passo de build, sem JSON
 * gerado e sem duplicar o conteúdo no banco.
 */

const CHANGELOG_PATH = path.join(process.cwd(), "CHANGELOG.md");

export type ItemChangelog = {
  /** Texto da entrada, já sem o escopo e sem o link do commit. */
  texto: string;
  /** Escopo do commit Conventional (`feat(acessos):` → "acessos"), quando houver. */
  escopo: string | null;
  /** SHA curto do commit. Texto puro: as URLs geradas historicamente estão quebradas. */
  hash: string | null;
};

export type SecaoChangelog = {
  /** Título como veio do `.versionrc.json`, ex.: "✨ Funcionalidades". */
  titulo: string;
  itens: ItemChangelog[];
};

export type VersaoChangelog = {
  /** Ex.: "1.13.0". */
  versao: string;
  /** ISO `YYYY-MM-DD`, ou null quando o cabeçalho não traz data. */
  data: string | null;
  secoes: SecaoChangelog[];
};

/**
 * Cabeçalho de versão. Aceita as duas formas que o `conventional-changelog` emite:
 * `## [1.13.0](url) (2026-08-30)` (minor/major) e `### [1.8.1](url) (2026-08-09)` (patch),
 * além da forma sem link (`## 1.13.0 (2026-08-30)`), usada quando não há `repository`.
 */
const RE_VERSAO = /^#{2,3}\s+\[?(\d+\.\d+\.\d+[^\]\s)]*)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/;
/** Cabeçalho de seção dentro de uma versão ("### ✨ Funcionalidades", "### ⚠ BREAKING CHANGES"). */
const RE_SECAO = /^#{3,4}\s+(.+?)\s*$/;
/** Item de lista, incluindo os indentados (continuação de item vem sem marcador). */
const RE_ITEM = /^\s*[*-]\s+(.*)$/;
/** Link do commit no fim da linha: "([2dcba8c](url))" ou "(2dcba8c)". */
const RE_HASH = /\s*\(\[?([0-9a-f]{7,40})\]?(?:\([^)]*\))?\)\s*$/;
/** Referência a issues no fim da linha: ", closes [#13](url) #14". */
const RE_CLOSES = /,?\s*closes\s+.*$/i;
/** Escopo em negrito no início: "**acessos:** ...". */
const RE_ESCOPO = /^\*\*([^:*]+):\*\*\s*/;

/** `[texto](url)` → `texto`; `**x**`/`_x_` → `x`. Mantém o resto literal. */
function limparMarkdown(texto: string): string {
  return texto
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseItem(bruto: string): ItemChangelog {
  let texto = bruto.trim().replace(RE_CLOSES, "");

  const mHash = texto.match(RE_HASH);
  const hash = mHash ? mHash[1] : null;
  if (mHash) texto = texto.slice(0, mHash.index).trim();

  const mEscopo = texto.match(RE_ESCOPO);
  const escopo = mEscopo ? mEscopo[1].trim() : null;
  if (mEscopo) texto = texto.slice(mEscopo[0].length);

  texto = limparMarkdown(texto);
  // Primeira letra maiúscula: o commit Conventional escreve tudo em minúscula.
  if (texto) texto = texto[0].toUpperCase() + texto.slice(1);

  return { texto, escopo, hash };
}

/**
 * Converte o markdown do CHANGELOG em versões estruturadas, da mais recente para a mais
 * antiga (a ordem do próprio arquivo). Puro — sem I/O, para ser testável com fixture.
 *
 * Tudo que vem antes do primeiro cabeçalho de versão (H1 + parágrafo de abertura) é
 * ignorado; versões sem nenhum item visível (todas as seções ocultas no `.versionrc.json`)
 * são descartadas.
 */
export function parseChangelog(markdown: string): VersaoChangelog[] {
  const versoes: VersaoChangelog[] = [];
  let versaoAtual: VersaoChangelog | null = null;
  let secaoAtual: SecaoChangelog | null = null;
  let itemAberto: string | null = null;

  const fecharItem = () => {
    if (itemAberto !== null && secaoAtual) secaoAtual.itens.push(parseItem(itemAberto));
    itemAberto = null;
  };

  for (const linha of markdown.split(/\r?\n/)) {
    const mVersao = linha.match(RE_VERSAO);
    if (mVersao) {
      fecharItem();
      secaoAtual = null;
      versaoAtual = { versao: mVersao[1], data: mVersao[2] ?? null, secoes: [] };
      versoes.push(versaoAtual);
      continue;
    }

    if (!versaoAtual) continue; // preâmbulo do arquivo

    const mSecao = linha.match(RE_SECAO);
    if (mSecao) {
      fecharItem();
      secaoAtual = { titulo: limparMarkdown(mSecao[1]), itens: [] };
      versaoAtual.secoes.push(secaoAtual);
      continue;
    }

    const mItem = linha.match(RE_ITEM);
    if (mItem && secaoAtual) {
      fecharItem();
      itemAberto = mItem[1];
      continue;
    }

    // Linha em branco fecha o item; texto solto é continuação do item corrente.
    if (!linha.trim()) fecharItem();
    else if (itemAberto !== null) itemAberto += " " + linha.trim();
  }
  fecharItem();

  return versoes.filter((v) => v.secoes.some((s) => s.itens.length > 0));
}

/** Lê e converte o CHANGELOG.md do repositório. Lista vazia se o arquivo não existir. */
export async function lerChangelog(): Promise<VersaoChangelog[]> {
  try {
    return parseChangelog(await fs.readFile(CHANGELOG_PATH, "utf8"));
  } catch {
    return [];
  }
}
