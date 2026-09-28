/**
 * O catálogo de nomenclatura "como tabela de uma versão" — puro, client-safe, sem Prisma.
 *
 * No banco o catálogo é UMA linha por conceito (card, sub-disciplina, fase, tipo) com validade por
 * faixa de versões, e as siglas também por faixa (D4/D11 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`). Pensar em faixas
 * é difícil; quem monta o padrão pensa em "a tabela da v2". Este módulo faz a ponte:
 * - `catalogoNaVersao`: a fotografia de uma versão (o que existe nela, com a sigla dela e o que
 *   mudou em relação à anterior);
 * - `simular`: aplica operações "de tabela" (entra, sai, sigla nova…) numa cópia em memória, com a
 *   MESMA regra que o serviço grava no banco — é o que permite validar antes de gravar;
 * - `colisoes`: a mesma sigla com dois donos numa versão.
 */

import {
  intersecaoFaixas,
  siglasDasColunas,
  siglasNaVersao,
  siglasSaoEspelho,
  valeNaVersao,
  type FaixaVersao,
  type SiglaLinha,
} from "@/modules/uploads/nomenclatura/siglas-versao";

export type SiglaSnap = SiglaLinha & { id: string };

type BaseSnap = FaixaVersao & { id: string; nome: string; ativo: boolean; ordem: number; siglas: SiglaSnap[] };

export type CardSnap = BaseSnap & { codigo: string | null; sinonimos: string[]; categoria: string | null };
export type SubSnap = BaseSnap & { cardId: string };
export type ItemListaSnap = BaseSnap & { categoria: "fase" | "tipo"; sigla: string; sinonimos: string[] };

/** Catálogo global inteiro (arquivados inclusos): cards, subs e fases/tipos sem projeto. */
export type CatalogoSnap = { cards: CardSnap[]; subs: SubSnap[]; itens: ItemListaSnap[] };

export type TipoAlvo = "disciplina" | "subdisciplina" | "prancha";
export type AlvoCatalogo = { tipo: TipoAlvo; id: string };

export function chaveAlvo(alvo: AlvoCatalogo): string {
  return `${alvo.tipo[0]}:${alvo.id}`;
}

// ─── Existência e siglas numa versão ─────────────────────────────────────────

function cardDe(snap: CatalogoSnap, id: string): CardSnap | undefined {
  return snap.cards.find((c) => c.id === id);
}

/** A faixa em que o item existe de fato: a própria, e a do card-mãe para sub. */
function faixasDoItem(snap: CatalogoSnap, alvo: AlvoCatalogo): FaixaVersao[] {
  if (alvo.tipo === "subdisciplina") {
    const sub = snap.subs.find((s) => s.id === alvo.id);
    if (!sub) return [];
    const card = cardDe(snap, sub.cardId);
    return card ? [sub, card] : [sub];
  }
  const item = alvo.tipo === "disciplina" ? cardDe(snap, alvo.id) : snap.itens.find((i) => i.id === alvo.id);
  return item ? [item] : [];
}

function existe(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number, soAtivos: boolean): boolean {
  const faixas = faixasDoItem(snap, alvo);
  if (faixas.length === 0) return false;
  if (soAtivos) {
    if (alvo.tipo === "subdisciplina") {
      const sub = snap.subs.find((s) => s.id === alvo.id);
      const card = sub && cardDe(snap, sub.cardId);
      if (!sub?.ativo || card?.ativo === false) return false;
    } else if (!itemDe(snap, alvo)?.ativo) return false;
  }
  return faixas.every((f) => valeNaVersao(f, versao));
}

function itemDe(snap: CatalogoSnap, alvo: AlvoCatalogo): CardSnap | SubSnap | ItemListaSnap | undefined {
  if (alvo.tipo === "disciplina") return cardDe(snap, alvo.id);
  if (alvo.tipo === "subdisciplina") return snap.subs.find((s) => s.id === alvo.id);
  return snap.itens.find((i) => i.id === alvo.id);
}

/** Sigla oficial e sinônimos do item numa versão (vazio se o item não existe nela). */
export function siglasDoItemNaVersao(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number) {
  const item = itemDe(snap, alvo);
  if (!item || !existe(snap, alvo, versao, false)) return { oficial: null, sinonimos: [] as string[] };
  return siglasNaVersao(item.siglas, versao);
}

// ─── Fotografia de uma versão ────────────────────────────────────────────────

export type SituacaoNaVersao = "entra" | "sigla-nova" | "igual";

export type LinhaCatalogo = {
  alvo: AlvoCatalogo;
  nome: string;
  sigla: string | null;
  sinonimos: string[];
  /** Em relação à versão anterior. Na v1, tudo é "igual". */
  situacao: SituacaoNaVersao;
  siglaAnterior: string | null;
};

export type CardNaVersao = LinhaCatalogo & { categoria: string | null; subs: LinhaCatalogo[] };
export type SaiNaVersao = LinhaCatalogo & { tipoRotulo: string };

export type CatalogoNaVersao = {
  versao: number;
  cards: CardNaVersao[];
  fases: LinhaCatalogo[];
  tipos: LinhaCatalogo[];
  /** Existiam na versão anterior e não existem nesta (sub cujo card saiu não repete aqui). */
  saem: SaiNaVersao[];
  resumo: { entram: number; saem: number; siglasNovas: number };
};

const porOrdem = <T extends { ordem: number; nome: string }>(a: T, b: T) =>
  a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");

function linha(snap: CatalogoSnap, alvo: AlvoCatalogo, nome: string, versao: number): LinhaCatalogo {
  const agora = siglasDoItemNaVersao(snap, alvo, versao);
  const antes = versao > 1 && existe(snap, alvo, versao - 1, true) ? siglasDoItemNaVersao(snap, alvo, versao - 1) : null;
  const situacao: SituacaoNaVersao =
    versao <= 1 ? "igual" : antes === null ? "entra" : antes.oficial !== agora.oficial ? "sigla-nova" : "igual";
  return {
    alvo,
    nome,
    sigla: agora.oficial,
    sinonimos: agora.sinonimos,
    situacao,
    siglaAnterior: antes?.oficial ?? null,
  };
}

export function catalogoNaVersao(snap: CatalogoSnap, versao: number): CatalogoNaVersao {
  const cards: CardNaVersao[] = [...snap.cards]
    .sort(porOrdem)
    .filter((c) => existe(snap, { tipo: "disciplina", id: c.id }, versao, true))
    .map((c) => ({
      ...linha(snap, { tipo: "disciplina", id: c.id }, c.nome, versao),
      categoria: c.categoria,
      subs: snap.subs
        .filter((s) => s.cardId === c.id && existe(snap, { tipo: "subdisciplina", id: s.id }, versao, true))
        .sort(porOrdem)
        .map((s) => linha(snap, { tipo: "subdisciplina", id: s.id }, s.nome, versao)),
    }));

  const itens = (categoria: "fase" | "tipo") =>
    snap.itens
      .filter((i) => i.categoria === categoria && existe(snap, { tipo: "prancha", id: i.id }, versao, true))
      .sort(porOrdem)
      .map((i) => linha(snap, { tipo: "prancha", id: i.id }, i.nome, versao));

  const saem: SaiNaVersao[] = [];
  if (versao > 1) {
    const anterior = versao - 1;
    const sai = (alvo: AlvoCatalogo) => existe(snap, alvo, anterior, true) && !existe(snap, alvo, versao, true);
    for (const c of [...snap.cards].sort(porOrdem)) {
      const alvo: AlvoCatalogo = { tipo: "disciplina", id: c.id };
      if (sai(alvo)) saem.push({ ...linha(snap, alvo, c.nome, anterior), tipoRotulo: "Disciplina (card)" });
    }
    for (const s of [...snap.subs].sort(porOrdem)) {
      const alvo: AlvoCatalogo = { tipo: "subdisciplina", id: s.id };
      const card = cardDe(snap, s.cardId);
      const cardFica = card ? existe(snap, { tipo: "disciplina", id: card.id }, versao, true) : false;
      if (sai(alvo) && cardFica) saem.push({ ...linha(snap, alvo, s.nome, anterior), tipoRotulo: `Sub de ${card?.nome}` });
    }
    for (const i of [...snap.itens].sort(porOrdem)) {
      const alvo: AlvoCatalogo = { tipo: "prancha", id: i.id };
      if (sai(alvo)) saem.push({ ...linha(snap, alvo, i.nome, anterior), tipoRotulo: i.categoria === "fase" ? "Fase" : "Tipo" });
    }
  }

  const fases = itens("fase");
  const tipos = itens("tipo");
  const todas = [...cards, ...cards.flatMap((c) => c.subs), ...fases, ...tipos];
  return {
    versao,
    cards,
    fases,
    tipos,
    saem,
    resumo: {
      entram: todas.filter((l) => l.situacao === "entra").length,
      saem: saem.length,
      siglasNovas: todas.filter((l) => l.situacao === "sigla-nova").length,
    },
  };
}

// ─── Operações "de tabela" ───────────────────────────────────────────────────

/** Card a que uma sub nova pertence: um existente, ou um card novo da mesma leva (pela chave). */
export type RefCard = { id: string } | { chave: string };

export type OperacaoCatalogo =
  | { tipo: "card-novo"; chave: string; nome: string; sigla: string | null; categoria: string | null }
  | { tipo: "sub-nova"; card: RefCard; nome: string; sigla: string | null }
  | { tipo: "item-novo"; categoria: "fase" | "tipo"; nome: string; sigla: string }
  /** Sigla oficial nova a partir da versão; a oficial anterior deixa de valer nela. */
  | { tipo: "sigla-nova"; alvo: AlvoCatalogo; sigla: string }
  /** O item deixa de existir a partir da versão (criado nela mesma = excluído). */
  | { tipo: "sai"; alvo: AlvoCatalogo }
  /** O item volta a existir a partir da versão. */
  | { tipo: "entra"; alvo: AlvoCatalogo }
  /** Uma linha de sigla deixa de valer a partir da versão (a sigla passou para outro item). */
  | { tipo: "encerrar-sigla"; alvo: AlvoCatalogo; linhaId: string; sigla: string };

export type OperacaoComId = OperacaoCatalogo & { id: string };

/** Id que a simulação dá a um card novo — o mesmo que `RefCard.chave` resolve. */
export const idCardNovo = (chave: string) => `novo-card:${chave}`;

/** Linha de sigla ainda "em aberto" na versão: sai dela (encerra na anterior) ou some, se nasceu nela. */
function encerrarLinhaNaVersao(linhas: SiglaSnap[], linhaId: string, versao: number): SiglaSnap[] {
  return linhas.flatMap((l) => {
    if (l.id !== linhaId || !valeNaVersao(l, versao)) return [l];
    return l.versaoDesde < versao ? [{ ...l, versaoAte: versao - 1 }] : [];
  });
}

function colunasDe(item: CardSnap | ItemListaSnap) {
  return "codigo" in item ? { oficial: item.codigo, sinonimos: item.sinonimos } : { oficial: item.sigla, sinonimos: item.sinonimos };
}

/**
 * Nova faixa do item. Se as siglas eram só o espelho das colunas (item que nunca passou por
 * "Siglas por versão"), elas acompanham a faixa — a mesma regra do formulário do catálogo.
 */
function comFaixa<T extends CardSnap | SubSnap | ItemListaSnap>(item: T, faixa: FaixaVersao, prefixoId: string): T {
  if ("cardId" in item) return { ...item, ...faixa };
  const colunas = colunasDe(item);
  const espelho = siglasSaoEspelho(item.siglas, colunas, item);
  const siglas = espelho
    ? siglasDasColunas(colunas.oficial, colunas.sinonimos, faixa).map((l, i) => ({ ...l, id: `${prefixoId}#${i}` }))
    : item.siglas;
  return { ...item, ...faixa, siglas };
}

function trocarItem(snap: CatalogoSnap, alvo: AlvoCatalogo, f: (item: never) => unknown | null): CatalogoSnap {
  const aplicar = <T extends { id: string }>(lista: T[]) =>
    lista.flatMap((i) => {
      if (i.id !== alvo.id) return [i];
      const novo = f(i as never) as T | null;
      return novo ? [novo] : [];
    });
  if (alvo.tipo === "disciplina") return { ...snap, cards: aplicar(snap.cards) };
  if (alvo.tipo === "subdisciplina") return { ...snap, subs: aplicar(snap.subs) };
  return { ...snap, itens: aplicar(snap.itens) };
}

/**
 * Aplica as operações numa cópia do catálogo, para a versão dada — mesma regra que o serviço grava.
 * Linhas de sigla criadas aqui recebem id `nova:<id da operação>` (regravadas junto com a faixa do
 * item: `nova:<id>#<n>`); itens novos, `novo-*:<id>`.
 */
export function simular(snap: CatalogoSnap, versao: number, ops: readonly OperacaoComId[]): CatalogoSnap {
  let s: CatalogoSnap = { cards: [...snap.cards], subs: [...snap.subs], itens: [...snap.itens] };
  const linhaNova = (op: OperacaoComId, sigla: string): SiglaSnap => ({
    id: `nova:${op.id}`,
    sigla,
    oficial: true,
    versaoDesde: versao,
    versaoAte: null,
  });
  const faixaNova: FaixaVersao = { versaoDesde: versao, versaoAte: null };
  // Itens novos entram no fim, na ordem das operações (o serviço grava ordem = máxima + 1, em sequência).
  let ordemNova = 1_000_000_000;

  for (const op of ops) {
    switch (op.tipo) {
      case "card-novo": {
        s.cards.push({
          id: idCardNovo(op.chave),
          nome: op.nome,
          codigo: op.sigla,
          sinonimos: [],
          categoria: op.categoria,
          ativo: true,
          ordem: ordemNova++,
          ...faixaNova,
          siglas: op.sigla ? [linhaNova(op, op.sigla)] : [],
        });
        break;
      }
      case "sub-nova": {
        const cardId = "id" in op.card ? op.card.id : idCardNovo(op.card.chave);
        s.subs.push({
          id: `novo-sub:${op.id}`,
          cardId,
          nome: op.nome,
          ativo: true,
          ordem: ordemNova++,
          ...faixaNova,
          siglas: op.sigla ? [linhaNova(op, op.sigla)] : [],
        });
        break;
      }
      case "item-novo": {
        s.itens.push({
          id: `novo-item:${op.id}`,
          categoria: op.categoria,
          nome: op.nome,
          sigla: op.sigla,
          sinonimos: [],
          ativo: true,
          ordem: ordemNova++,
          ...faixaNova,
          siglas: [linhaNova(op, op.sigla)],
        });
        break;
      }
      case "sigla-nova": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) => {
          let siglas = item.siglas;
          for (const l of item.siglas.filter((l) => l.oficial && valeNaVersao(l, versao))) {
            siglas = encerrarLinhaNaVersao(siglas, l.id, versao);
          }
          return { ...item, siglas: [...siglas, linhaNova(op, op.sigla)] };
        });
        break;
      }
      case "encerrar-sigla": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) => ({
          ...item,
          siglas: encerrarLinhaNaVersao(item.siglas, op.linhaId, versao),
        }));
        break;
      }
      case "sai": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) =>
          item.versaoDesde >= versao ? null : comFaixa(item, { versaoDesde: item.versaoDesde, versaoAte: versao - 1 }, `nova:${op.id}`),
        );
        // Card criado na própria versão é excluído — e as subs dele vão junto (cascade no banco).
        if (op.alvo.tipo === "disciplina" && !cardDe(s, op.alvo.id)) {
          s = { ...s, subs: s.subs.filter((x) => x.cardId !== op.alvo.id) };
        }
        break;
      }
      case "entra": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) => {
          const faixa: FaixaVersao = {
            versaoDesde: Math.min(item.versaoDesde, versao),
            versaoAte: item.versaoAte !== null && item.versaoAte < versao ? null : item.versaoAte,
          };
          return { ...comFaixa(item, faixa, `nova:${op.id}`), ativo: true };
        });
        break;
      }
    }
  }
  return s;
}

// ─── Colisões ────────────────────────────────────────────────────────────────

export type Colisao = {
  versao: number;
  sigla: string;
  /** Donos da sigla na versão: chave do item, rótulo e a linha de sigla. */
  donos: { chave: string; alvo: AlvoCatalogo; rotulo: string; linhaId: string }[];
};

function rotuloItem(snap: CatalogoSnap, alvo: AlvoCatalogo): string {
  const item = itemDe(snap, alvo);
  if (!item) return "?";
  if (alvo.tipo === "subdisciplina") {
    const card = cardDe(snap, (item as SubSnap).cardId);
    return `${item.nome} (sub de ${card?.nome ?? "?"})`;
  }
  return item.nome;
}

/**
 * A mesma sigla com mais de um dono numa versão, em cada "lugar" do nome: card e sub disputam o
 * lugar da disciplina; fase e tipo, cada um o seu. Conta item arquivado (mesma regra da checagem do
 * diálogo de siglas) e usa a validade efetiva (sigla ∩ item ∩ card).
 */
export function colisoes(snap: CatalogoSnap, versoes: readonly number[]): Colisao[] {
  const saida: Colisao[] = [];
  const lugares: { nome: string; alvos: AlvoCatalogo[] }[] = [
    {
      nome: "disciplina",
      alvos: [
        ...snap.cards.map((c) => ({ tipo: "disciplina" as const, id: c.id })),
        ...snap.subs.map((x) => ({ tipo: "subdisciplina" as const, id: x.id })),
      ],
    },
    { nome: "fase", alvos: snap.itens.filter((i) => i.categoria === "fase").map((i) => ({ tipo: "prancha" as const, id: i.id })) },
    { nome: "tipo", alvos: snap.itens.filter((i) => i.categoria === "tipo").map((i) => ({ tipo: "prancha" as const, id: i.id })) },
  ];
  for (const versao of versoes) {
    for (const lugar of lugares) {
      const porSigla = new Map<string, Colisao["donos"]>();
      for (const alvo of lugar.alvos) {
        const item = itemDe(snap, alvo);
        if (!item) continue;
        const faixas = faixasDoItem(snap, alvo);
        for (const l of item.siglas) {
          let faixa: FaixaVersao | null = l;
          for (const f of faixas) faixa = faixa && intersecaoFaixas(faixa, f);
          if (!faixa || !valeNaVersao(faixa, versao)) continue;
          const sigla = l.sigla.trim().toUpperCase();
          const donos = porSigla.get(sigla) ?? [];
          if (!donos.some((d) => d.chave === chaveAlvo(alvo))) {
            donos.push({ chave: chaveAlvo(alvo), alvo, rotulo: rotuloItem(snap, alvo), linhaId: l.id });
          }
          porSigla.set(sigla, donos);
        }
      }
      for (const [sigla, donos] of porSigla) {
        if (donos.length > 1) saida.push({ versao, sigla, donos });
      }
    }
  }
  return saida;
}

/** Versões a checar depois de mexer na versão `v`: ela e as seguintes já cadastradas. */
export function versoesAPartirDe(versao: number, numeros: readonly number[]): number[] {
  const seguintes = numeros.filter((n) => n >= versao);
  return seguintes.length > 0 ? [...new Set(seguintes)].sort((a, b) => a - b) : [versao];
}
