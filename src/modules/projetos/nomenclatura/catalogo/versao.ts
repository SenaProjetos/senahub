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
  siglasNaVersao,
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

/** Uma sigla que volta com o item ("Voltar para a vN"), com o papel que ela tinha. */
export type SiglaVolta = { sigla: string; oficial: boolean };

export type OperacaoCatalogo =
  | { tipo: "card-novo"; chave: string; nome: string; sigla: string | null; categoria: string | null }
  | { tipo: "sub-nova"; card: RefCard; nome: string; sigla: string | null }
  | { tipo: "item-novo"; categoria: "fase" | "tipo"; nome: string; sigla: string }
  /**
   * Sigla oficial nova a partir da versão; a oficial anterior deixa de valer nela — e um sinônimo do
   * próprio item com a mesma sigla também (foi promovido).
   */
  | { tipo: "sigla-nova"; alvo: AlvoCatalogo; sigla: string }
  /** Sinônimo novo a partir da versão: reconhecido no envio, nunca escrito no nome. */
  | { tipo: "sinonimo-novo"; alvo: AlvoCatalogo; sigla: string }
  /**
   * O item deixa de existir a partir da versão (criado nela mesma = excluído). As linhas de sigla NÃO
   * mudam (E3 da spec 2026-09-30): todo leitor recorta pela faixa efetiva (sigla ∩ item ∩ card).
   */
  | { tipo: "sai"; alvo: AlvoCatalogo }
  /**
   * O item volta a existir a partir da versão. Com `siglas`, elas passam a ser exatamente as que valem
   * nele na versão: as que já valem e não estão na lista são encerradas; as que faltam abrem a partir
   * da versão. Sem `siglas` (importação), as linhas não mudam.
   */
  | { tipo: "entra"; alvo: AlvoCatalogo; siglas?: SiglaVolta[] }
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

/** Linhas do item depois de "Voltar" com as siglas escolhidas — a mesma regra que `service.ts` grava. */
function siglasAoVoltar(linhas: SiglaSnap[], escolhidas: readonly SiglaVolta[], versao: number, prefixoId: string): SiglaSnap[] {
  const querem = new Set(escolhidas.map((e) => e.sigla));
  let saida = linhas;
  for (const l of linhas) {
    if (valeNaVersao(l, versao) && !querem.has(l.sigla)) saida = encerrarLinhaNaVersao(saida, l.id, versao);
  }
  const valem = new Set(saida.filter((l) => valeNaVersao(l, versao)).map((l) => l.sigla));
  const novas = escolhidas
    .filter((e) => !valem.has(e.sigla))
    .map((e, i): SiglaSnap => ({ id: `${prefixoId}#${i}`, sigla: e.sigla, oficial: e.oficial, versaoDesde: versao, versaoAte: null }));
  return [...saida, ...novas];
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
 * Linhas de sigla criadas aqui recebem id `nova:<id da operação>` (as que voltam com o item:
 * `nova:<id>#<n>`); itens novos, `novo-*:<id>`.
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
          // A oficial de hoje sai; um sinônimo do próprio item com a mesma sigla também (foi promovido).
          for (const l of item.siglas.filter((l) => (l.oficial || l.sigla === op.sigla) && valeNaVersao(l, versao))) {
            siglas = encerrarLinhaNaVersao(siglas, l.id, versao);
          }
          return { ...item, siglas: [...siglas, linhaNova(op, op.sigla)] };
        });
        break;
      }
      case "sinonimo-novo": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) =>
          item.siglas.some((l) => l.sigla === op.sigla && valeNaVersao(l, versao))
            ? item
            : { ...item, siglas: [...item.siglas, { ...linhaNova(op, op.sigla), oficial: false }] },
        );
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
          // Item que já não está na versão (tela velha): nada a tirar — sem estender nem excluir.
          !valeNaVersao(item, versao) ? item : item.versaoDesde >= versao ? null : { ...item, versaoAte: versao - 1 },
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
          const siglas = op.siglas ? siglasAoVoltar(item.siglas, op.siglas, versao, `nova:${op.id}`) : item.siglas;
          return { ...item, ...faixa, ativo: true, siglas };
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
 * Todos os donos de cada sigla na versão, por "lugar" do nome (chave `<lugar>|<SIGLA>`): card e sub
 * disputam o lugar da disciplina; fase e tipo, cada um o seu. Conta item arquivado (mesma regra da
 * checagem do diálogo de siglas) e usa a validade efetiva (sigla ∩ item ∩ card).
 */
function donosNaVersao(snap: CatalogoSnap, versao: number): Map<string, { sigla: string; donos: Colisao["donos"] }> {
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
  const saida = new Map<string, { sigla: string; donos: Colisao["donos"] }>();
  for (const lugar of lugares) {
    for (const alvo of lugar.alvos) {
      const item = itemDe(snap, alvo);
      if (!item) continue;
      const faixas = faixasDoItem(snap, alvo);
      for (const l of item.siglas) {
        let faixa: FaixaVersao | null = l;
        for (const f of faixas) faixa = faixa && intersecaoFaixas(faixa, f);
        if (!faixa || !valeNaVersao(faixa, versao)) continue;
        const sigla = l.sigla.trim().toUpperCase();
        const chave = `${lugar.nome}|${sigla}`;
        const entrada = saida.get(chave) ?? { sigla, donos: [] };
        if (!entrada.donos.some((d) => d.chave === chaveAlvo(alvo))) {
          entrada.donos.push({ chave: chaveAlvo(alvo), alvo, rotulo: rotuloItem(snap, alvo), linhaId: l.id });
        }
        saida.set(chave, entrada);
      }
    }
  }
  return saida;
}

/**
 * Colisões que existem em `depois` e foram criadas pela mudança: em cada uma, `novos` são os donos
 * que não tinham a sigla em `antes` naquela versão (item criado, sigla nova, item que voltou e
 * reexpôs as siglas dele ou das subs) e `antigos`, os que já tinham. Colisão antiga, sem dono novo,
 * fica de fora — ela não é desta edição.
 */
export function colisoesNovas(
  antes: CatalogoSnap,
  depois: CatalogoSnap,
  versoes: readonly number[],
): { colisao: Colisao; novos: Colisao["donos"]; antigos: Colisao["donos"] }[] {
  const saida: { colisao: Colisao; novos: Colisao["donos"]; antigos: Colisao["donos"] }[] = [];
  for (const versao of versoes) {
    const eram = donosNaVersao(antes, versao);
    for (const [chave, { sigla, donos }] of donosNaVersao(depois, versao)) {
      if (donos.length < 2) continue;
      const tinham = new Set((eram.get(chave)?.donos ?? []).map((d) => d.chave));
      const novos = donos.filter((d) => !tinham.has(d.chave));
      if (novos.length === 0) continue;
      saida.push({ colisao: { versao, sigla, donos }, novos, antigos: donos.filter((d) => tinham.has(d.chave)) });
    }
  }
  return saida;
}

/** A mesma sigla com mais de um dono numa versão, no mesmo "lugar" do nome (ver `donosNaVersao`). */
export function colisoes(snap: CatalogoSnap, versoes: readonly number[]): Colisao[] {
  const saida: Colisao[] = [];
  for (const versao of versoes) {
    for (const { sigla, donos } of donosNaVersao(snap, versao).values()) {
      if (donos.length > 1) saida.push({ versao, sigla, donos });
    }
  }
  return saida;
}

/** Versões a checar depois de mexer na versão `v`: ela e as seguintes já cadastradas. */
export function versoesAPartirDe(versao: number, numeros: readonly number[]): number[] {
  const seguintes = numeros.filter((n) => n >= versao);
  return seguintes.length > 0 ? [...new Set(seguintes)].sort((a, b) => a - b) : [versao];
}

/**
 * Por que um card criado na própria versão não pode ser "tirado" dela quando algum projeto já o usa
 * (tirar = excluir). A MESMA frase na tela (item desabilitado) e no servidor (`ActionError`).
 */
export function fraseTirarCardEmUso(nome: string, uso: number): string {
  return `“${nome}” já está em ${uso} projeto(s) — arquive pela lente “Todas as versões” em vez de tirar da versão em que foi criado.`;
}

// ─── Operações da tela e transferência de sigla ──────────────────────────────

/** Operação como a tela (e a action) a descrevem — sem os ids internos da simulação. */
export type OperacaoTela =
  | { tipo: "card-novo"; nome: string; sigla: string | null }
  | { tipo: "sub-nova"; cardId: string; nome: string; sigla: string | null }
  | { tipo: "item-novo"; categoria: "fase" | "tipo"; nome: string; sigla: string }
  | { tipo: "sigla-nova"; alvo: AlvoCatalogo; sigla: string }
  | { tipo: "sinonimo-novo"; alvo: AlvoCatalogo; sigla: string }
  | { tipo: "encerrar-sigla"; alvo: AlvoCatalogo; linhaId: string; sigla: string }
  | { tipo: "sai"; alvo: AlvoCatalogo }
  | { tipo: "entra"; alvo: AlvoCatalogo; siglas?: SiglaVolta[] };

/** Ids estáveis (`op0`, `op1`…) para simular e gravar: a tela e o servidor geram os mesmos. */
export function operacoesComId(ops: readonly OperacaoTela[]): OperacaoComId[] {
  return ops.map((o, i): OperacaoComId => {
    const id = `op${i}`;
    if (o.tipo === "card-novo") return { id, tipo: "card-novo", chave: id, nome: o.nome, sigla: o.sigla, categoria: null };
    if (o.tipo === "sub-nova") return { id, tipo: "sub-nova", card: { id: o.cardId }, nome: o.nome, sigla: o.sigla };
    return { id, ...o };
  });
}

/** A linha de sigla `linhaId` do item. */
export function linhaDoItem(snap: CatalogoSnap, alvo: AlvoCatalogo, linhaId: string): SiglaSnap | undefined {
  return itemDe(snap, alvo)?.siglas.find((l) => l.id === linhaId);
}

export type ConflitoSigla = {
  sigla: string;
  versao: number;
  /** Rótulo do outro dono: "Hidrossanitário" ou "Esgoto (sub de Hidrossanitário)". */
  dono: string;
  papel: "oficial" | "sinônimo";
};

export type PlanoTransferencia = {
  /** Conflitos na versão editada que a transferência resolve (tirando a sigla do outro dono). */
  conflitos: ConflitoSigla[];
  /** O que tira a sigla dos outros donos a partir da versão — grava ANTES das operações da tela. */
  encerrar: OperacaoComId[];
  /** Conflito que a transferência não resolve (sigla repetida na leva, ou dono só numa versão posterior). */
  recusa: string | null;
};

/**
 * O que salvar `ops` na versão causa nas siglas dos OUTROS itens: quem perde a sigla se a tela
 * confirmar "Tirar de lá e usar aqui" (a regra da importação, "a planilha manda"), ou por que não
 * dá. Roda na tela (prévia, antes de salvar) e no servidor (que recalcula contra o banco).
 * "Conflito desta edição" = colisão com um dono novo (`colisoesNovas`): pega também a sigla de uma
 * sub que volta a valer com o card, e ignora colisão que já existia antes, sem mudança.
 */
export function planejarTransferencia(
  snap: CatalogoSnap,
  versao: number,
  ops: readonly OperacaoComId[],
  versoesExistentes: readonly number[],
): PlanoTransferencia {
  const depois = simular(snap, versao, ops);
  const conflitos: ConflitoSigla[] = [];
  const encerrar: OperacaoComId[] = [];
  for (const { colisao, novos, antigos } of colisoesNovas(snap, depois, [versao])) {
    if (novos.length > 1) {
      return {
        conflitos: [],
        encerrar: [],
        recusa: `A sigla ${colisao.sigla} apareceria duas vezes: ${novos.map((d) => `“${d.rotulo}”`).join(" e ")}.`,
      };
    }
    for (const outro of antigos) {
      const linha = linhaDoItem(depois, outro.alvo, outro.linhaId);
      conflitos.push({ sigla: colisao.sigla, versao, dono: outro.rotulo, papel: linha?.oficial ? "oficial" : "sinônimo" });
      encerrar.push({
        id: `encerrar:${outro.chave}:${outro.linhaId}`,
        tipo: "encerrar-sigla",
        alvo: outro.alvo,
        linhaId: outro.linhaId,
        sigla: colisao.sigla,
      });
    }
  }
  const final = simular(snap, versao, [...encerrar, ...ops]);
  const [sobra] = colisoesNovas(snap, final, versoesAPartirDe(versao, versoesExistentes));
  if (sobra) {
    const outros = sobra.antigos.map((d) => `“${d.rotulo}”`);
    return {
      conflitos,
      encerrar,
      recusa: `Na v${sobra.colisao.versao}, a sigla ${sobra.colisao.sigla} já é de ${outros.join(" e ") || "outro item"}. Troque a sigla de lá nessa versão antes.`,
    };
  }
  return { conflitos, encerrar, recusa: null };
}

/**
 * Identifica o que o "Entendi" confirma: as siglas oficiais que saem de outros itens, NA VERSÃO. Se a lista
 * muda (a pessoa trocou a sigla digitada), a confirmação dada antes não vale para a nova.
 */
export function chaveConfirmacao(plano: PlanoTransferencia): string {
  return plano.conflitos
    .filter((c) => c.papel === "oficial")
    .map((c) => `${c.sigla}|${c.dono}|v${c.versao}`)
    .join(";");
}

/**
 * O que acontece se a pessoa transferir a sigla: o outro dono perde a sigla nesta versão em diante; as
 * versões anteriores não mudam. Na v1 não há anterior para citar.
 */
export function consequenciaConflito(c: ConflitoSigla): string {
  const anteriores = c.versao <= 1 ? null : c.versao - 1 === 1 ? "Na v1" : `Até a v${c.versao - 1}`;
  if (c.papel === "oficial") {
    const base = `Se passar para cá, “${c.dono}” fica sem sigla na v${c.versao}: os arquivos dele deixam de ser reconhecidos pela sigla até você dar uma nova.`;
    return anteriores ? `${base} ${anteriores} nada muda.` : base;
  }
  const base = `Para usar aqui, a sigla sai de “${c.dono}” a partir da v${c.versao}.`;
  return anteriores ? `${base} ${anteriores} ela continua sendo de “${c.dono}” — projetos dessas versões não mudam.` : base;
}

/** Frase do conflito — a mesma na tela e no servidor. */
export function mensagemConflito(c: ConflitoSigla): string {
  return `${c.sigla} é ${c.papel === "oficial" ? "a sigla oficial" : "sinônimo"} de “${c.dono}” na v${c.versao}.`;
}

/**
 * O que o servidor grava: as transferências antes das operações da tela — ou o motivo de não gravar.
 * `confirmadas` são os ids das transferências (`plano.encerrar[].id`) que a tela mostrou e a pessoa
 * confirmou. Toda transferência do plano recalculado precisa estar entre elas: se outro dono apareceu
 * depois que a tela abriu, recusa em vez de tirar a sigla dele sem ninguém ver.
 */
export function resolverLeva(
  plano: PlanoTransferencia,
  ops: readonly OperacaoComId[],
  confirmadas: readonly string[],
): { ok: true; ops: OperacaoComId[] } | { ok: false; erro: string } {
  if (plano.recusa) return { ok: false, erro: plano.recusa };
  const falta = plano.encerrar.findIndex((o) => !confirmadas.includes(o.id));
  if (falta >= 0) {
    return {
      ok: false,
      erro: `${mensagemConflito(plano.conflitos[falta])} A tela pode estar desatualizada: recarregue e confirme a transferência.`,
    };
  }
  return { ok: true, ops: [...plano.encerrar, ...ops] };
}

/**
 * Confere as siglas que voltam com cada item ("Voltar para a vN") contra o que ele tinha de fato
 * (`siglasParaVoltar`): só siglas dele, com o mesmo papel, sem repetir, uma oficial no máximo. Siglas
 * legadas fora do formato atual passam — elas já eram do item.
 */
export function conferirVoltas(snap: CatalogoSnap, versao: number, ops: readonly OperacaoComId[]): string | null {
  for (const op of ops) {
    if (op.tipo !== "entra" || !op.siglas) continue;
    if (op.siglas.filter((s) => s.oficial).length > 1) return "Só uma sigla oficial pode voltar com o item.";
    const vistas = new Set<string>();
    const oferta = siglasParaVoltar(snap, op.alvo, versao);
    for (const s of op.siglas) {
      if (vistas.has(s.sigla)) return `A sigla ${s.sigla} aparece duas vezes.`;
      vistas.add(s.sigla);
      if (!oferta.some((o) => o.sigla === s.sigla && o.oficial === s.oficial)) {
        return `${s.sigla} não era sigla de “${rotuloItem(snap, op.alvo)}”. A tela pode estar desatualizada: recarregue.`;
      }
    }
  }
  return null;
}

/**
 * O que "Voltar para a vN" oferece: as siglas que o item tinha na última versão em que existiu antes
 * da vN (ou na primeira depois, se ele só começa mais tarde), com o papel de cada uma.
 */
export function siglasParaVoltar(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number): SiglaVolta[] {
  const item = itemDe(snap, alvo);
  if (!item) return [];
  const referencia = item.versaoAte !== null && item.versaoAte < versao ? item.versaoAte : Math.max(item.versaoDesde, versao);
  const { oficial, sinonimos } = siglasNaVersao(item.siglas, referencia);
  return [...(oficial ? [{ sigla: oficial, oficial: true }] : []), ...sinonimos.map((sigla) => ({ sigla, oficial: false }))];
}

/** As linhas de sigla que valem no item na versão, com o id (para encerrar) — base do diálogo de siglas. */
export function linhasDoItemNaVersao(
  snap: CatalogoSnap,
  alvo: AlvoCatalogo,
  versao: number,
): { oficial: SiglaSnap | null; sinonimos: SiglaSnap[] } {
  const item = itemDe(snap, alvo);
  if (!item || !existe(snap, alvo, versao, false)) return { oficial: null, sinonimos: [] };
  const validas = item.siglas.filter((l) => valeNaVersao(l, versao));
  const oficial = validas.filter((l) => l.oficial).sort((a, b) => b.versaoDesde - a.versaoDesde)[0] ?? null;
  const vistas = new Set(oficial ? [oficial.sigla] : []);
  const sinonimos: SiglaSnap[] = [];
  for (const l of validas) {
    if (l.oficial || vistas.has(l.sigla)) continue;
    vistas.add(l.sigla);
    sinonimos.push(l);
  }
  return { oficial, sinonimos };
}

/**
 * Operações que levam as siglas do item na versão de `antes` para `depois` (diálogo "Siglas nesta
 * versão"). Siglas já normalizadas. Oficial `null` = o item fica sem sigla na versão.
 */
export function opsDasSiglas(
  alvo: AlvoCatalogo,
  antes: { oficial: SiglaSnap | null; sinonimos: readonly SiglaSnap[] },
  depois: { oficial: string | null; sinonimos: readonly string[] },
): OperacaoTela[] {
  const ops: OperacaoTela[] = [];
  for (const l of antes.sinonimos) {
    // Sinônimo promovido a oficial sai pela própria `sigla-nova`.
    if (!depois.sinonimos.includes(l.sigla) && l.sigla !== depois.oficial) {
      ops.push({ tipo: "encerrar-sigla", alvo, linhaId: l.id, sigla: l.sigla });
    }
  }
  if ((antes.oficial?.sigla ?? null) !== depois.oficial) {
    if (depois.oficial) ops.push({ tipo: "sigla-nova", alvo, sigla: depois.oficial });
    else if (antes.oficial) ops.push({ tipo: "encerrar-sigla", alvo, linhaId: antes.oficial.id, sigla: antes.oficial.sigla });
  }
  const jaSao = new Set(antes.sinonimos.map((l) => l.sigla));
  for (const sigla of depois.sinonimos) {
    if (!jaSao.has(sigla) && sigla !== depois.oficial) ops.push({ tipo: "sinonimo-novo", alvo, sigla });
  }
  return ops;
}
