import { MSG, type Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

import { iluminacaoDoAmbienteCompleta, pontoDoAmbiente } from "./ambiente";
import {
  ambientesDoLevantamento,
  type AmbienteEstudo,
  type CalculoEstudo,
  type ConteudoCargasDemanda,
  type CriterioIluminacao,
  type LinhaCargaEstudo,
  type LuminariaEstudo,
  type OrigemVinculo,
  type TipoCarga,
  type ValoresDaLinha,
} from "./conteudo";

/**
 * Vínculo entre o levantamento (etapa 1) e as linhas de carga do cálculo (etapa 2) — **puro**. Spec §3.1 (regras de
 * vínculo 1 a 4), §5 passos 11 e 12 e §6.
 *
 *   passo 11  totais do levantamento: iluminação (W, VA, FP), TUG (quantidade, VA, W) e cada TUE (descrição,
 *             quantidade, VA, W), somando os levantamentos do escopo — SEM o × N (o N multiplica na carga instalada);
 *   passo 12  trazer: a linha recebe o total. Fica gravado `trazido` (os três números da linha naquele momento);
 *   "diferente do levantamento" = a linha de agora ≠ `trazido` (o projetista editou);
 *   "levantamento alterado"     = o total de agora ≠ `trazido` (o levantamento mudou depois de trazer).
 *
 * Nada aqui grava sozinho: `atualizarDoLevantamento` só roda quando o projetista pede, e não passa por cima de uma
 * edição manual a menos que ele peça isso expressamente (spec §8: "nunca sobrescrevem edição manual").
 */

// ─── Passo 11 — totais ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Total de um grupo de pontos. Valor `null` = ainda falta dado em algum item (a spec §3.2: enquanto o FP de alguma
 * linha estiver em branco, o total mostra "—"). `itens` = quantos itens entraram (0 = o grupo não existe).
 */
export type Total = {
  itens: number;
  quantidade: number | null;
  va: number | null;
  w: number | null;
  /** FP do conjunto = W ÷ VA. */
  fp: number | null;
};

export type TotalDeEquipamento = { tipo: "tue" | "outro"; chave: string; descricao: string; total: Total };

export type TotaisDoEscopo = {
  iluminacao: Total;
  tug: Total;
  /** TUE e "outro", um por descrição, na ordem em que aparecem. */
  equipamentos: TotalDeEquipamento[];
};

/** Descrição normalizada, para juntar as TUE de mesmo nome entre ambientes: sem acento, sem caixa, espaços únicos. */
export function chaveDoEquipamento(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Parcela = { quantidade: number | null; va: number | null; w: number | null };

function somar(parcelas: readonly Parcela[]): Total {
  if (parcelas.length === 0) return { itens: 0, quantidade: 0, va: 0, w: 0, fp: null };
  const soma = (f: (p: Parcela) => number | null) => {
    let s = 0;
    for (const p of parcelas) {
      const v = f(p);
      if (v == null) return null;
      s += v;
    }
    return s;
  };
  const quantidade = soma((p) => p.quantidade);
  const va = soma((p) => p.va);
  const w = soma((p) => p.w);
  return { itens: parcelas.length, quantidade, va, w, fp: va != null && w != null && va > 0 ? w / va : null };
}

/**
 * Iluminação de UM ambiente, em VA e W, pelo critério do estudo. `null` = faltam dados (ou critério não escolhido).
 * Na habitação, o campo sem valor adota o sugerido pela área (`ambiente.ts`); o valor digitado vale sempre.
 */
export function iluminacaoDoAmbiente(
  a: AmbienteEstudo,
  criterio: CriterioIluminacao | null,
  peDireitoM: number | null,
  catalogo: readonly LuminariaEstudo[] = [],
): { va: number; w: number } | null {
  const r = iluminacaoDoAmbienteCompleta(a, criterio, peDireitoM, catalogo);
  return r.va != null && r.w != null ? { va: r.va, w: r.w } : null;
}

/** Passo 11 — totais dos levantamentos do escopo (sem o × N). */
export function totaisDoEscopo(
  c: Pick<ConteudoCargasDemanda, "levantamentos" | "criterioIluminacao" | "peDireitoM"> & { luminarias?: readonly LuminariaEstudo[] },
  levantamentoIds: readonly string[],
): TotaisDoEscopo {
  return totaisDosAmbientes(c.levantamentos.filter((l) => levantamentoIds.includes(l.id)).flatMap(ambientesDoLevantamento), c);
}

/** Totais de uma lista de ambientes (um pavimento, um levantamento ou o escopo inteiro): a mesma regra para a tela e o cálculo. */
export function totaisDosAmbientes(
  ambientes: readonly AmbienteEstudo[],
  c: Pick<ConteudoCargasDemanda, "criterioIluminacao" | "peDireitoM"> & { luminarias?: readonly LuminariaEstudo[] },
): TotaisDoEscopo {

  const iluminacao = somar(
    ambientes.map((a): Parcela => {
      const i = iluminacaoDoAmbiente(a, c.criterioIluminacao, c.peDireitoM, c.luminarias ?? []);
      return { quantidade: 1, va: i?.va ?? null, w: i?.w ?? null };
    }),
  );
  // A iluminação entra na linha como UM item (spec §3.1 regra 1: "iluminação total (W, VA e FP)").
  if (iluminacao.itens > 0) iluminacao.quantidade = 1;

  // Cada ponto leva o ambiente junto: na habitação o primeiro TUG adota o sugerido da norma quando a quantidade ou a
  // potência estão em branco.
  const pontos = ambientes.flatMap((a) => a.pontos.map((p) => ({ p, a })));
  const parcela = ({ p, a }: (typeof pontos)[number]): Parcela => {
    const e = pontoDoAmbiente(a, p, c.criterioIluminacao);
    return { quantidade: e.quantidade, va: e.vaTotal, w: e.w };
  };

  const tug = somar(pontos.filter(({ p }) => p.tipo === "tug").map(parcela));

  const grupos = new Map<string, { tipo: "tue" | "outro"; chave: string; descricao: string; parcelas: Parcela[] }>();
  for (const item of pontos) {
    const p = item.p;
    if (p.tipo === "tug") continue;
    const chave = chaveDoEquipamento(p.descricao);
    const id = `${p.tipo}:${chave}`;
    const g = grupos.get(id) ?? { tipo: p.tipo, chave, descricao: p.descricao.trim(), parcelas: [] };
    g.parcelas.push(parcela(item));
    grupos.set(id, g);
  }
  const equipamentos = [...grupos.values()].map(
    (g): TotalDeEquipamento => ({ tipo: g.tipo, chave: g.chave, descricao: g.descricao, total: somar(g.parcelas) }),
  );

  return { iluminacao, tug, equipamentos };
}

// ─── Passo 12 — trazer ───────────────────────────────────────────────────────────────────────────────────────────

/** O total de um grupo como valores da linha: quantidade, potência POR aparelho e FP. `null` = não dá para trazer. */
export function valoresDoTotal(t: Total): ValoresDaLinha | null {
  if (t.itens === 0 || t.quantidade == null || t.w == null || t.va == null || t.fp == null) return null;
  if (!(t.quantidade > 0) || !(t.w > 0) || !(t.fp > 0) || t.fp > 1 + 1e-12) return null;
  return { quantidade: t.quantidade, potenciaW: t.w / t.quantidade, fp: Math.min(t.fp, 1) };
}

/** Valores que o levantamento de AGORA oferece para a origem. `null` = a origem não existe ou está incompleta. */
export function valoresVivos(totais: TotaisDoEscopo, origem: OrigemVinculo): ValoresDaLinha | null {
  if (origem.tipo === "iluminacao") return valoresDoTotal(totais.iluminacao);
  if (origem.tipo === "tug") return valoresDoTotal(totais.tug);
  const g = totais.equipamentos.find((e) => e.tipo === origem.tipo && e.chave === origem.chave);
  return g ? valoresDoTotal(g.total) : null;
}

/** As origens oferecidas pelo escopo, na ordem da linha: iluminação, TUG e cada equipamento. Só os grupos que existem. */
export function origensDoEscopo(totais: TotaisDoEscopo): OrigemVinculo[] {
  const origens: OrigemVinculo[] = [];
  if (totais.iluminacao.itens > 0) origens.push({ tipo: "iluminacao" });
  if (totais.tug.itens > 0) origens.push({ tipo: "tug" });
  for (const e of totais.equipamentos) origens.push({ tipo: e.tipo, chave: e.chave });
  return origens;
}

const TIPO_CARGA_DA_ORIGEM: Record<OrigemVinculo["tipo"], TipoCarga> = {
  iluminacao: "iluminacao",
  tug: "tomadas_uso_geral",
  tue: "tomadas_uso_especifico",
  outro: "outro",
};

function descricaoDaOrigem(totais: TotaisDoEscopo, origem: OrigemVinculo): string {
  if (origem.tipo === "iluminacao") return "Iluminação";
  if (origem.tipo === "tug") return "Tomadas de uso geral";
  return totais.equipamentos.find((e) => e.tipo === origem.tipo && e.chave === origem.chave)?.descricao ?? "";
}

/**
 * Linha nova "do levantamento", para UMA origem. `null` quando o total ainda está incompleto (a tela mostra o
 * informativo do FP em branco). Tipo de carga preenchido; FD fica `null` — é o projetista que completa (regra 2).
 */
export function trazerLinha(totais: TotaisDoEscopo, origem: OrigemVinculo, id: string): LinhaCargaEstudo | null {
  const v = valoresVivos(totais, origem);
  if (!v) return null;
  return {
    id,
    tipoCarga: TIPO_CARGA_DA_ORIGEM[origem.tipo],
    descricao: descricaoDaOrigem(totais, origem),
    quantidade: v.quantidade,
    potenciaW: v.potenciaW,
    fp: v.fp,
    fd: null,
    vinculo: { origem, trazido: { ...v } },
    regraFd: null,
    subtipo: null,
  };
}

/** "Trazer do levantamento" (regra 1): uma linha por origem completa do escopo. As incompletas ficam de fora. */
export function trazerLinhas(totais: TotaisDoEscopo, novoId: () => string): LinhaCargaEstudo[] {
  const linhas: LinhaCargaEstudo[] = [];
  for (const origem of origensDoEscopo(totais)) {
    const l = trazerLinha(totais, origem, novoId());
    if (l) linhas.push(l);
  }
  return linhas;
}

// ─── Estado do vínculo ───────────────────────────────────────────────────────────────────────────────────────────

const TOLERANCIA = 1e-9;

function igual(a: number | null, b: number): boolean {
  return a != null && Math.abs(a - b) <= TOLERANCIA * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Os três números da linha são os de `v`? (A quantidade é inteira; a potência por aparelho vem de uma divisão.) */
export function mesmosValores(linha: Pick<LinhaCargaEstudo, "quantidade" | "potenciaW" | "fp">, v: ValoresDaLinha): boolean {
  return igual(linha.quantidade, v.quantidade) && igual(linha.potenciaW, v.potenciaW) && igual(linha.fp, v.fp);
}

export type SituacaoDaLinha = "digitada" | "do_levantamento" | "diferente_do_levantamento";

export type EstadoDoVinculo = {
  situacao: SituacaoDaLinha;
  /** O levantamento de agora já não é o que a linha recebeu (spec §6, "Levantamento alterado depois de trazer"). */
  levantamentoAlterado: boolean;
  avisos: Mensagem[];
};

/** Situação da linha e avisos da §6: "Valor diferente do levantamento." e "O levantamento foi alterado…". */
export function estadoDoVinculo(linha: LinhaCargaEstudo, totais: TotaisDoEscopo): EstadoDoVinculo {
  const v = linha.vinculo;
  if (!v) return { situacao: "digitada", levantamentoAlterado: false, avisos: [] };

  const editada = !mesmosValores(linha, v.trazido);
  const vivos = valoresVivos(totais, v.origem);
  const alterado = vivos == null || !mesmosValores(v.trazido, vivos);

  const avisos: Mensagem[] = [];
  if (alterado) avisos.push(MSG.levantamentoAlterado());
  if (editada) avisos.push(MSG.valorEditado());
  return { situacao: editada ? "diferente_do_levantamento" : "do_levantamento", levantamentoAlterado: alterado, avisos };
}

export type MotivoSemAtualizar = "sem_vinculo" | "editada" | "sem_correspondente" | "ja_atualizada";

export type ResultadoDaAtualizacao = { linha: LinhaCargaEstudo; atualizada: boolean; motivo?: MotivoSemAtualizar };

/**
 * "Atualizar" — só quando o projetista pede (regra 3). Troca quantidade, potência e FP da linha pelos do levantamento
 * de agora e renova `trazido`. Uma linha editada à mão NÃO é tocada, a menos que `descartarEdicao` (o projetista
 * escolheu trazer de novo). Linha cuja origem sumiu ou está incompleta fica como está. Tipo de carga, descrição e FD
 * nunca mudam.
 */
export function atualizarDoLevantamento(
  linha: LinhaCargaEstudo,
  totais: TotaisDoEscopo,
  opcoes: { descartarEdicao?: boolean } = {},
): ResultadoDaAtualizacao {
  const v = linha.vinculo;
  if (!v) return { linha, atualizada: false, motivo: "sem_vinculo" };
  if (!mesmosValores(linha, v.trazido) && !opcoes.descartarEdicao) return { linha, atualizada: false, motivo: "editada" };
  const vivos = valoresVivos(totais, v.origem);
  if (!vivos) return { linha, atualizada: false, motivo: "sem_correspondente" };
  if (mesmosValores(linha, vivos) && mesmosValores(v.trazido, vivos)) return { linha, atualizada: false, motivo: "ja_atualizada" };
  return {
    linha: { ...linha, quantidade: vivos.quantidade, potenciaW: vivos.potenciaW, fp: vivos.fp, vinculo: { origem: v.origem, trazido: { ...vivos } } },
    atualizada: true,
  };
}

// ─── Avisos do cálculo ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Avisos do cálculo ligados ao escopo (spec §6): "Este cálculo não tem escopo…" quando não há levantamento no escopo
 * e também nenhuma linha digitada ("escolha o levantamento ou digite as cargas").
 */
export function avisosDoEscopo(calculo: Pick<CalculoEstudo, "escopo" | "linhas">): Mensagem[] {
  return calculo.escopo.levantamentoIds.length === 0 && calculo.linhas.length === 0 ? [MSG.calculoSemEscopo()] : [];
}

/** Avisos de vínculo de todas as linhas do cálculo, por id de linha (só as que têm aviso). */
export function avisosDeVinculo(calculo: Pick<CalculoEstudo, "linhas">, totais: TotaisDoEscopo): Map<string, Mensagem[]> {
  const mapa = new Map<string, Mensagem[]>();
  for (const l of calculo.linhas) {
    const { avisos } = estadoDoVinculo(l, totais);
    if (avisos.length > 0) mapa.set(l.id, avisos);
  }
  return mapa;
}
