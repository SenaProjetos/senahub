/**
 * A lente "Todas as versões" do catálogo (spec 2026-09-30, E2 e §4.3) — **puro**, client-safe.
 *
 * É o cadastro inteiro, arquivados inclusos, com o que é por versão só para leitura: em que
 * versões o item existe (faixa **efetiva**: a própria e, na sub, a do card-mãe) e as siglas que ele
 * teve, cada uma recortada por essa faixa. Lê o mesmo `CatalogoSnap` das lentes vN, por isso as
 * duas lentes nunca discordam sobre onde um item existe (A3).
 */

import { normalizar } from "@/lib/disciplinas-core";
import { intersecaoFaixas, valeNaVersao, type FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import { SEM_CATEGORIA } from "./apresentacao";
import type { AlvoCatalogo, CardSnap, CatalogoSnap, SiglaSnap, TipoAlvo } from "./versao";

export type SiglaNaFaixa = {
  sigla: string;
  oficial: boolean;
  /** Efetiva: a linha recortada pela faixa efetiva do item. */
  faixa: FaixaVersao;
  /** `rotuloExisteEm(faixa)` só quando difere da faixa do item; senão null (vale onde o item vale). */
  rotulo: string | null;
};

export type LinhaTodas = {
  alvo: AlvoCatalogo;
  nome: string;
  /** O próprio item (na sub, a sub): card-mãe arquivado esconde a sub pelo filtro, não por aqui. */
  ativo: boolean;
  /** Efetiva: item ∩ card-mãe (sub). null = não vale em versão nenhuma. */
  faixa: FaixaVersao | null;
  existeEm: string;
  /** Versões cadastradas em que a faixa efetiva vale (ignora `ativo`). */
  versoes: number[];
  siglas: SiglaNaFaixa[];
};

export type CardTodas = LinhaTodas & { categoria: string | null; subs: LinhaTodas[] };
export type CatalogoTodas = { cards: CardTodas[]; fases: LinhaTodas[]; tipos: LinhaTodas[] };

/** "v1 em diante", "a partir da v2", "só v1", "até a v2", "da v2 à v3" — os textos do mockup. */
export function rotuloExisteEm(faixa: FaixaVersao | null): string {
  if (!faixa) return "em nenhuma versão";
  const { versaoDesde: de, versaoAte: ate } = faixa;
  if (ate === null) return de <= 1 ? "v1 em diante" : `a partir da v${de}`;
  if (de === ate) return `só v${de}`;
  if (de <= 1) return `até a v${ate}`;
  return `da v${de} à v${ate}`;
}

const mesmaFaixa = (a: FaixaVersao, b: FaixaVersao) => a.versaoDesde === b.versaoDesde && a.versaoAte === b.versaoAte;

const porOrdem = <T extends { ordem: number; nome: string }>(a: T, b: T) =>
  a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");

function efetiva(faixas: FaixaVersao[]): FaixaVersao | null {
  let atual: FaixaVersao | null = faixas[0] ?? null;
  for (const f of faixas.slice(1)) {
    if (!atual) return null;
    atual = intersecaoFaixas(atual, f);
  }
  return atual ? { versaoDesde: atual.versaoDesde, versaoAte: atual.versaoAte } : null;
}

function siglasNaFaixa(linhas: readonly SiglaSnap[], faixa: FaixaVersao | null): SiglaNaFaixa[] {
  if (!faixa) return [];
  const saida: SiglaNaFaixa[] = [];
  for (const l of linhas) {
    const f = intersecaoFaixas(l, faixa);
    if (!f) continue;
    const recorte = { versaoDesde: f.versaoDesde, versaoAte: f.versaoAte };
    saida.push({ sigla: l.sigla, oficial: l.oficial, faixa: recorte, rotulo: mesmaFaixa(recorte, faixa) ? null : rotuloExisteEm(recorte) });
  }
  return saida.sort(
    (a, b) =>
      a.faixa.versaoDesde - b.faixa.versaoDesde ||
      Number(b.oficial) - Number(a.oficial) ||
      a.sigla.localeCompare(b.sigla, "pt-BR"),
  );
}

function linhaTodas(
  alvo: AlvoCatalogo,
  item: { nome: string; ativo: boolean; siglas: SiglaSnap[] } & FaixaVersao,
  faixas: FaixaVersao[],
  numeros: readonly number[],
): LinhaTodas {
  const faixa = efetiva(faixas);
  return {
    alvo,
    nome: item.nome,
    ativo: item.ativo,
    faixa,
    existeEm: rotuloExisteEm(faixa),
    versoes: faixa ? numeros.filter((n) => valeNaVersao(faixa, n)) : [],
    siglas: siglasNaFaixa(item.siglas, faixa),
  };
}

export function catalogoTodasVersoes(snap: CatalogoSnap, numeros: readonly number[]): CatalogoTodas {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const cards: CardTodas[] = [...snap.cards].sort(porOrdem).map((c: CardSnap) => ({
    ...linhaTodas({ tipo: "disciplina", id: c.id }, c, [c], ordenados),
    categoria: c.categoria,
    subs: snap.subs
      .filter((s) => s.cardId === c.id)
      .sort(porOrdem)
      .map((s) => linhaTodas({ tipo: "subdisciplina", id: s.id }, s, [s, c], ordenados)),
  }));
  const itens = (categoria: "fase" | "tipo") =>
    snap.itens
      .filter((i) => i.categoria === categoria)
      .sort(porOrdem)
      .map((i) => linhaTodas({ tipo: "prancha", id: i.id }, i, [i], ordenados));
  return { cards, fases: itens("fase"), tipos: itens("tipo") };
}

/** "Abrir na vN": a última versão em que o item existe; sem nenhuma, a mais nova cadastrada (ou 1). */
export function versaoParaAbrir(linha: Pick<LinhaTodas, "versoes">, numeros: readonly number[]): number {
  if (linha.versoes.length > 0) return Math.max(...linha.versoes);
  return numeros.length > 0 ? Math.max(...numeros) : 1;
}

function casa(linha: LinhaTodas, q: string): boolean {
  return normalizar(linha.nome).includes(q) || linha.siglas.some((s) => normalizar(s.sigla).includes(q));
}

/**
 * Busca (nome, sigla de qualquer versão, categoria; sem acento nem caixa), categoria e arquivados.
 * O card aparece se ele ou uma sub casar; se só subs casam, mostra só elas. Sem `arquivadas`, card
 * arquivado sai com as subs, e sub arquivada sai do card.
 */
export function filtrarTodas(
  cards: CardTodas[],
  f: { busca: string; categoria: string | null; arquivadas: boolean },
): CardTodas[] {
  const q = normalizar(f.busca);
  const saida: CardTodas[] = [];
  for (const c of cards) {
    if (!f.arquivadas && !c.ativo) continue;
    if (f.categoria !== null && (c.categoria || SEM_CATEGORIA) !== f.categoria) continue;
    const subs = f.arquivadas ? c.subs : c.subs.filter((s) => s.ativo);
    if (!q || casa(c, q) || normalizar(c.categoria ?? "").includes(q)) {
      saida.push(subs === c.subs ? c : { ...c, subs });
      continue;
    }
    const casam = subs.filter((s) => casa(s, q));
    if (casam.length > 0) saida.push({ ...c, subs: casam });
  }
  return saida;
}

/** Mesma busca e mesmo corte de arquivados, para fases e tipos. */
export function filtrarLinhasTodas(linhas: LinhaTodas[], f: { busca: string; arquivadas: boolean }): LinhaTodas[] {
  const q = normalizar(f.busca);
  return linhas.filter((l) => (f.arquivadas || l.ativo) && (!q || casa(l, q)));
}

// ─── Frases de "em uso" — as mesmas no menu (item inerte) e no servidor (recusa) ─────────────

export function fraseCardEmUso(projetos: number): string {
  return `Em uso em ${projetos} ${projetos === 1 ? "projeto" : "projetos"} — arquive em vez de excluir.`;
}

export function fraseSubEmUso(documentos: number): string {
  return `Em uso em ${documentos} ${documentos === 1 ? "documento" : "documentos"} — arquive em vez de excluir.`;
}

export function fraseFaseEmUso(etapas: number): string {
  return `Usada por ${etapas} ${etapas === 1 ? "etapa" : "etapas"} de disciplina — arquive em vez de excluir.`;
}

/** Registros de outras áreas presos ao item (propostas, normas, modelos de EAP, tarefas da EAP…). */
export function fraseVinculos(n: number): string {
  return n === 1
    ? "Ligado a 1 registro de outra área (proposta, norma, modelo de EAP…) — arquive em vez de excluir."
    : `Ligado a ${n} registros de outras áreas (propostas, normas, modelos de EAP…) — arquive em vez de excluir.`;
}

/**
 * O que um item do catálogo ainda prende. `uso` é o uso próprio do tipo (card: projetos; sub:
 * documentos; fase: etapas de disciplina; tipo: 0); `documentos`, os documentos que apontam para a
 * fase/tipo ou para as subs do card; `vinculos`, o resto (propostas, normas, EAP…).
 */
export type UsoItem = { uso: number; documentos?: number; vinculos?: number };

/**
 * Por que o item não pode ser excluído — a MESMA frase no menu (item inerte) e no servidor (recusa).
 * Excluir soltaria essas referências em silêncio (FK `SetNull`) ou falharia com erro genérico
 * (`Restrict`); arquivar tira o item dos cadastros novos sem mexer em nada. `null` = pode excluir.
 */
export function motivoExclusao(tipo: TipoAlvo, u: UsoItem): string | null {
  if (u.uso > 0) {
    if (tipo === "disciplina") return fraseCardEmUso(u.uso);
    if (tipo === "subdisciplina") return fraseSubEmUso(u.uso);
    return fraseFaseEmUso(u.uso);
  }
  if ((u.documentos ?? 0) > 0) return fraseSubEmUso(u.documentos ?? 0);
  if ((u.vinculos ?? 0) > 0) return fraseVinculos(u.vinculos ?? 0);
  return null;
}

/** O que o leitor de tela ouve no botão das siglas: elas mesmas, com papel e versão, e o que o botão faz. */
export function rotuloSiglas(nome: string, siglas: readonly SiglaNaFaixa[]): string {
  if (siglas.length === 0) return `${nome}: sem sigla. Ver histórico de siglas.`;
  const lista = siglas.map((s) => `${s.sigla}${s.oficial ? "" : " (sinônimo)"}${s.rotulo ? `, ${s.rotulo}` : ""}`).join("; ");
  return `Siglas de ${nome}: ${lista}. Ver histórico.`;
}
