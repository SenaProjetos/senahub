import { DISCLAIMER_PADRAO, type MemoriaDoc, type MemoriaSecao, type MemoriaTabela } from "@/modules/ferramentas/memoria";

import { formatarNumeroBR } from "../numero-br";
import { ehNum, type BlocoRel, type Celula, type RelatorioCargas, type TabelaRel } from "./tipos";

/**
 * Formatação comum do relatório — **puro**. Número com vírgula e milhar com ponto, na quantidade de casas da célula;
 * valor ausente vira "—". Daqui sai também o `MemoriaDoc` que o renderizador de PDF existente consome.
 */

export function textoDaCelula(c: Celula): string {
  if (!ehNum(c)) return c;
  return c.n == null ? "—" : formatarNumeroBR(c.n, c.c, c.c);
}

/** AAAA-MM-DD → dd/mm/aaaa. */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function tabelaDaMemoria(t: TabelaRel): MemoriaTabela {
  return { titulo: t.titulo, colunas: t.colunas, linhas: t.linhas.map((l) => l.map(textoDaCelula)) };
}

/** Agrupa os blocos de uma seção em "subseções": cada subtítulo abre uma nova. O primeiro grupo é o da própria seção. */
function agrupar(blocos: readonly BlocoRel[]): { titulo: string | null; blocos: BlocoRel[] }[] {
  const grupos: { titulo: string | null; blocos: BlocoRel[] }[] = [{ titulo: null, blocos: [] }];
  for (const b of blocos) {
    if (b.tipo === "subtitulo") grupos.push({ titulo: b.texto, blocos: [] });
    else grupos.at(-1)!.blocos.push(b);
  }
  return grupos;
}

function secaoDaMemoria(titulo: string, blocos: readonly BlocoRel[]): MemoriaSecao {
  const s: MemoriaSecao = { titulo, paragrafos: [], tabelas: [], notas: [] };
  for (const b of blocos) {
    if (b.tipo === "texto") s.paragrafos!.push(b.texto);
    else if (b.tipo === "tabela") s.tabelas!.push(tabelaDaMemoria(b.tabela));
    else if (b.tipo === "lista") s.notas!.push(...b.itens);
  }
  return s;
}

/** O relatório como `MemoriaDoc`: é o que o PDF usa (renderizador HTML e puppeteer existentes). */
export function paraMemoriaDoc(r: RelatorioCargas): MemoriaDoc {
  const secoes: MemoriaSecao[] = [];
  for (const s of r.secoes) {
    for (const g of agrupar(s.blocos)) secoes.push(secaoDaMemoria(g.titulo ?? `${s.numero}. ${s.titulo}`, g.blocos));
  }
  return {
    ferramenta: "cargas-demanda",
    titulo: r.titulo,
    subtitulo: `${r.subtitulo} · ${r.obra} · ${r.nomeEstudo}`,
    geradoEm: `${r.emissao}T12:00:00-03:00`,
    projeto: r.obra,
    secoes,
    disclaimer: r.naoConferido ? `Dados não conferidos por responsável técnico. ${DISCLAIMER_PADRAO}` : DISCLAIMER_PADRAO,
  };
}

/** Nome do arquivo: estudo e data, sem acento nem caractere perigoso. */
export function nomeDoArquivo(r: Pick<RelatorioCargas, "nomeEstudo" | "emissao">): string {
  const base = r.nomeEstudo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `cargas-demanda-${base || "estudo"}-${r.emissao}`;
}
