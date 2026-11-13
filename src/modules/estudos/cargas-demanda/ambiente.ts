import {
  avaliarComodo,
  iluminacaoSugeridaVA,
  potenciaTomadasMinimaVA,
  tomadasMinimas,
} from "@/modules/ferramentas/calc/cargas-demanda/habitacao";
import { calcularLux, type ResultadoLux } from "@/modules/ferramentas/calc/cargas-demanda/lux";
import { emDaAtividade } from "@/modules/ferramentas/calc/cargas-demanda/atividades";
import { MSG, type Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";
import { verificarPerimetro } from "@/modules/ferramentas/calc/cargas-demanda/validacao";

import type { AmbienteEstudo, CriterioIluminacao, LuminariaEstudo, PontoEstudo } from "./conteudo";

/**
 * Valores de UM ambiente do levantamento — **puro**. Junta o que a pessoa digitou com o que a norma sugere
 * (spec §3.2: azul = sugerido, pode alterar). Regra única para a tela e para os totais do levantamento
 * (`levantamento.ts`): campo de habitação sem valor ADOTA o sugerido; o valor digitado vale sempre.
 *
 * Só a habitação tem sugestão (NBR 5410, 9.5.2): iluminação pela área, quantidade e potência de tomadas pelo tipo do
 * cômodo, área e perímetro. Fora dela o campo fica vazio até a pessoa digitar (spec §3.3, "sem padrão").
 */

export type IluminacaoDoAmbiente = {
  /** Habitação: sugerido pela área (VA); `null` sem área. */
  sugeridoVA: number | null;
  /** Habitação: mínimo da norma (VA); só para o alerta. */
  minimoVA: number | null;
  /** O valor que vale (digitado ou, se vazio, o sugerido); `null` = ainda falta dado. */
  va: number | null;
  w: number | null;
  /** `true` quando o valor que vale é o sugerido (campo mostrado em azul). */
  ehSugerido: boolean;
  /** Só no critério de lux. */
  lux: ResultadoLux | null;
  /** Em sugerido pela atividade (lux). */
  emSugerido: number | null;
};

const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Iluminação do ambiente pelo critério do estudo. */
/** A luminária que vale no ambiente: a do catálogo, se escolheu uma; senão a digitada no próprio ambiente. */
export function luminariaDoAmbiente(
  a: Pick<AmbienteEstudo, "iluminacao">,
  catalogo: readonly Pick<LuminariaEstudo, "id" | "fluxoLm" | "potenciaW" | "fp">[],
): { fluxoLm: number | null; potenciaW: number | null; fp: number | null } {
  const id = a.iluminacao.luminariaId;
  const doCatalogo = id != null ? catalogo.find((l) => l.id === id) : undefined;
  return doCatalogo ? { fluxoLm: doCatalogo.fluxoLm, potenciaW: doCatalogo.potenciaW, fp: doCatalogo.fp } : a.iluminacao.luminaria;
}

export function iluminacaoDoAmbienteCompleta(
  a: AmbienteEstudo,
  criterio: CriterioIluminacao | null,
  peDireitoM: number | null,
  catalogo: readonly LuminariaEstudo[] = [],
): IluminacaoDoAmbiente {
  const il = a.iluminacao;
  const vazio: IluminacaoDoAmbiente = { sugeridoVA: null, minimoVA: null, va: null, w: null, ehSugerido: false, lux: null, emSugerido: null };
  if (criterio === "habitacao") {
    const sugerido = ehNumero(a.areaM2) && a.areaM2 > 0 ? iluminacaoSugeridaVA(a.areaM2) : null;
    const va = il.vaAdotado ?? sugerido;
    return {
      ...vazio,
      sugeridoVA: sugerido,
      minimoVA: ehNumero(a.areaM2) && a.areaM2 > 0 ? avaliarComodoMinimoIluminacao(a.areaM2) : null,
      va,
      w: va != null && il.fp != null ? va * il.fp : null,
      ehSugerido: il.vaAdotado == null && sugerido != null,
    };
  }
  if (criterio === "lux") {
    const em = il.emLux ?? emDaAtividade(a.atividadeId).emLux;
    const emSugerido = emDaAtividade(a.atividadeId).emLux;
    const { areaM2, perimetroM, alturaPlanoM } = a;
    const { fu, fm } = il;
    const luminaria = luminariaDoAmbiente(a, catalogo);
    if (
      peDireitoM == null || areaM2 == null || perimetroM == null || alturaPlanoM == null || em == null || fu == null ||
      fm == null || luminaria.fluxoLm == null || luminaria.potenciaW == null || luminaria.fp == null
    ) {
      return { ...vazio, emSugerido };
    }
    // Altura útil ≤ 0 (plano de trabalho acima do pé-direito) não tem conta: fica sem valor, e a validação mostra.
    if (peDireitoM - alturaPlanoM <= 0 || areaM2 <= 0 || perimetroM <= 0) return { ...vazio, emSugerido };
    const lux = calcularLux({
      areaM2,
      perimetroM,
      peDireitoM,
      alturaPlanoM,
      emLux: em,
      fu,
      fm,
      luminaria: { fluxoLm: luminaria.fluxoLm, potenciaW: luminaria.potenciaW, fp: luminaria.fp },
      quantidade: il.quantidade ?? undefined,
    });
    return { ...vazio, va: lux.potenciaVA, w: lux.potenciaW, lux, emSugerido, ehSugerido: il.quantidade == null };
  }
  return vazio;
}

/** Mínimo da norma de iluminação (VA) pela área — o mesmo do alerta de `avaliarComodo`. */
function avaliarComodoMinimoIluminacao(areaM2: number): number {
  return avaliarComodo({ tipo: "demais", areaM2, perimetroM: 1, iluminacaoVA: 0, tomadas: 0, tomadasVA: 0 }).iluminacaoMinimaVA;
}

/** Os pontos TUG do ambiente, na ordem. O PRIMEIRO é o que recebe o sugerido da norma. */
export function ehPrimeiroTug(a: Pick<AmbienteEstudo, "pontos">, ponto: Pick<PontoEstudo, "id">): boolean {
  return a.pontos.find((p) => p.tipo === "tug")?.id === ponto.id;
}

export type PontoDoAmbiente = {
  id: string;
  quantidade: number | null;
  /** VA por ponto que vale (digitado ou sugerido). */
  vaPorPonto: number | null;
  /** Total = quantidade × VA por ponto (é o que a tela mostra na coluna VA). */
  vaTotal: number | null;
  w: number | null;
  fp: number | null;
  quantidadeSugerida: number | null;
  vaTotalSugerido: number | null;
  /** Quantidade e potência que valem vêm do sugerido (azul na tela). */
  quantidadeEhSugerida: boolean;
  vaEhSugerido: boolean;
};

/** Ponto de tomada com o sugerido da habitação aplicado ao primeiro TUG. */
export function pontoDoAmbiente(a: AmbienteEstudo, p: PontoEstudo, criterio: CriterioIluminacao | null): PontoDoAmbiente {
  const comSugestao = criterio === "habitacao" && p.tipo === "tug" && ehPrimeiroTug(a, p) && a.tipo != null && ehNumero(a.areaM2) && ehNumero(a.perimetroM) && a.areaM2 > 0 && a.perimetroM > 0;
  const quantidadeSugerida = comSugestao ? tomadasMinimas(a.tipo!, a.areaM2!, a.perimetroM!) : null;
  const vaTotalSugerido = quantidadeSugerida != null ? potenciaTomadasMinimaVA(a.tipo!, quantidadeSugerida, a.tomadasAlternativa) : null;

  const quantidade = p.quantidade ?? quantidadeSugerida;
  // Potência mínima para a quantidade que VALE (a adotada, não só a sugerida).
  const vaMinimoParaQuantidade = comSugestao && quantidade != null && quantidade > 0 ? potenciaTomadasMinimaVA(a.tipo!, quantidade, a.tomadasAlternativa) : null;
  const vaPorPonto = p.vaPorPonto ?? (vaMinimoParaQuantidade != null && quantidade! > 0 ? vaMinimoParaQuantidade / quantidade! : null);
  const vaTotal = quantidade != null && vaPorPonto != null ? quantidade * vaPorPonto : null;
  return {
    id: p.id,
    quantidade,
    vaPorPonto,
    vaTotal,
    w: vaTotal != null && p.fp != null ? vaTotal * p.fp : null,
    fp: p.fp,
    quantidadeSugerida,
    vaTotalSugerido,
    quantidadeEhSugerida: p.quantidade == null && quantidadeSugerida != null,
    vaEhSugerido: p.vaPorPonto == null && vaPorPonto != null,
  };
}

/** Alertas de campo de um ambiente (spec §6): perímetro, iluminação e tomadas abaixo do mínimo, iluminância final. */
export function avisosDoAmbiente(
  a: AmbienteEstudo,
  criterio: CriterioIluminacao | null,
  peDireitoM: number | null,
  catalogo: readonly LuminariaEstudo[] = [],
): Mensagem[] {
  const avisos: Mensagem[] = [];
  if (ehNumero(a.areaM2) && ehNumero(a.perimetroM)) {
    const m = verificarPerimetro(a.areaM2, a.perimetroM);
    if (m) avisos.push(m);
  }
  if (criterio === "habitacao" && a.tipo != null && ehNumero(a.areaM2) && ehNumero(a.perimetroM) && a.areaM2 > 0 && a.perimetroM > 0) {
    const il = iluminacaoDoAmbienteCompleta(a, criterio, peDireitoM, catalogo);
    const tug = a.pontos.find((p) => p.tipo === "tug");
    const pt = tug ? pontoDoAmbiente(a, tug, criterio) : null;
    const r = avaliarComodo({
      tipo: a.tipo,
      areaM2: a.areaM2,
      perimetroM: a.perimetroM,
      iluminacaoVA: il.va ?? 0,
      tomadas: pt?.quantidade ?? 0,
      tomadasVA: pt?.vaTotal ?? 0,
      alternativa: a.tomadasAlternativa,
    });
    // Sem iluminação ou sem ponto de tomada lançados não há o que comparar: o campo já aparece em branco.
    avisos.push(
      ...r.avisos.filter((m) => {
        if (il.va == null && m.id === "iluminacao_abaixo_minimo") return false;
        if (pt == null && (m.id === "tug_abaixo_minimo" || m.id === "potencia_tomada_abaixo_minimo")) return false;
        return true;
      }),
    );
  }
  if (criterio === "lux") {
    const il = iluminacaoDoAmbienteCompleta(a, criterio, peDireitoM, catalogo);
    if (il.lux) avisos.push(...il.lux.avisos);
    if (a.atividadeId == null && a.iluminacao.emLux == null) avisos.push(MSG.atividadeNaoListada());
  }
  return avisos;
}
