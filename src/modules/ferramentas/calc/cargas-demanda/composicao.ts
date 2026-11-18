/**
 * Composição da demanda de UM nível (CMD ou CPG) — **puro**. Spec §5, passos 15 a 18:
 *   apartamentos do nível pelo método da área útil da concessionária, com a quantidade DESSE nível (os fatores são
 *   refeitos para ela), mais os cálculos de carga instalada que estão no nível, pela fórmula de cada norma.
 * Quem monta os níveis (quais apartamentos e cálculos estão em cada CMD e no CPG) é `niveis.ts`.
 *
 * Fórmulas (todas conferidas contra o trecho literal da biblioteca ao carregar o módulo; trecho que não casa = erro):
 *   Neoenergia  Ded = Drf + Ds + Dc + Dve                                    (DIS-NOR-053, Anexo I)
 *   Equatorial  D = D1 × 1,2 + D2 + D3 [+ D4]; duplex: + D3dup × 1,4, D3dup = S × f + (a + b)   (NT.00004, 6.11.4.2)
 *               apart-hotel: apartamentos pela carga instalada (6.11.8), sem o 1,2
 *   Cemig       D = D1 + D2                                                  (ND-5.2, 7.2)
 *   Celesc      DP = k · (D1 + D2) + De + Ds                                 (N-321.0003, 5.6.2)
 *   Copel, Enel só pela carga instalada: D = Σ das demandas dos cálculos (decisão do engenheiro, 2026-11-12, Q23 e Q24;
 *               a NTC 900600 não é usada)
 *   Energisa    D = (d1 + d2) × 1,3 + dce; duplex: (d1 + d2dup + d3) × 1,52 + dce, d2dup = f × a + nD × b;
 *               misto: + nL × d3 × 1,1                                       (NDU-003, 9.4.1 a 9.4.3; kW → kVA)
 * Papel de cada cálculo por concessionária: `GRUPOS` (perguntas 24 a 27 do plano).
 */

import { CELESC_N3210003_TRECHOS } from "./biblioteca/celesc-n3210003-trechos";
import { CEMIG_ND52_TRECHOS } from "./biblioteca/cemig";
import { ENERGISA_NDU003_TRECHOS } from "./biblioteca/energisa-ndu003-trechos";
import { EQT_NT00004_TRECHOS } from "./biblioteca/equatorial";
import { DIS_NOR_053, NEO_TRECHOS } from "./biblioteca/neoenergia";
import * as celesc from "./concessionarias/celesc";
import * as cemig from "./concessionarias/cemig";
import * as copel from "./concessionarias/copel";
import * as energisa from "./concessionarias/energisa";
import * as equatorial from "./concessionarias/equatorial";
import * as neoenergia from "./concessionarias/neoenergia";
import { lerDoTrecho } from "./concessionarias/texto";
import {
  avisosAbaixoDaNorma,
  fator,
  type Ajustes,
  type FatorDoMetodo,
  type ResultadoAreaUtil,
  type TipoApartamento,
} from "./concessionarias/tipos";
import { MSG, type Mensagem } from "./mensagens";

export type IdConcessionaria = "neoenergia" | "equatorial" | "cemig" | "celesc" | "copel" | "energisa" | "enel";

/** Concessionárias que têm método de área útil (Copel e Enel vão só pela carga instalada). */
type IdComAreaUtil = Exclude<IdConcessionaria, "copel" | "enel">;

/** Copel e Enel: sem método de área útil; a demanda é a soma dos cálculos de carga instalada. */
export const soCargaInstalada = (c: IdConcessionaria): c is "copel" | "enel" => c === "copel" || c === "enel";

export const NOMES: Record<IdConcessionaria, string> = {
  neoenergia: neoenergia.NOME,
  equatorial: equatorial.NOME,
  cemig: cemig.NOME,
  celesc: celesc.NOME,
  copel: copel.NOME,
  energisa: energisa.NOME,
  enel: "Enel",
};

/**
 * Papel de um cálculo de carga instalada no nível (spec §3.1 e passo 16).
 * `duplex` = aquecimento e ar dos duplex (Energisa nD × b, Equatorial a + b); `apartamentos` = apart-hotel na
 * Equatorial (os apartamentos pela carga instalada).
 */
export type PapelCalculo = "condominio" | "incendio" | "especial" | "comercial" | "recarga" | "duplex" | "apartamentos";

/** Resultado de um cálculo de carga instalada (passo 14), como entra no nível. */
export type CalculoNoNivel = {
  id: string;
  nome: string;
  papel: PapelCalculo;
  /** Σ P · FD ÷ FP (kVA). `null` = falta valor no cálculo. */
  demandaKVA: number | null;
  /** Σ P · FD (kW). Só a Energisa usa (d2, d3, b e lojas em kW, com o FP 0,92 embutido no 1,3/1,52/1,1). */
  demandaKW?: number | null;
  /** Σ P (kW) do cálculo, SEM fator de demanda, no escopo (Q28: a tabela do condomínio mostra carga instalada e demanda). */
  cargaInstaladaKW?: number | null;
};

/** Um tipo de apartamento no nível; `duplex` só muda a conta na Equatorial e na Energisa. */
export type TipoNoNivel = TipoApartamento & {
  duplex?: boolean;
  /** Carga instalada (kW) de UMA unidade do tipo, vinda do levantamento do apartamento (Q28). */
  cargaInstaladaKW?: number | null;
};

/** Ajustes do projetista, por nível (spec §3.1 regra 5: cada nível tem a sua sugestão, editável). */
export type AjustesDoNivel = { apartamentos?: Ajustes; duplex?: Ajustes; composicao?: Ajustes };

export type OpcoesDoNivel = { studio?: boolean; formaCemig?: cemig.FormaCemig; apartHotel?: boolean };

export type EntradaDoNivel = {
  concessionaria: IdConcessionaria;
  tipos: readonly TipoNoNivel[];
  calculos: readonly CalculoNoNivel[];
  ajustes?: AjustesDoNivel;
  opcoes?: OpcoesDoNivel;
};

export type ParcelaDoNivel = {
  chave: string;
  rotulo: string;
  simbolo: string;
  valor: number | null;
  unidade: "kVA" | "kW";
  /** Ids dos cálculos somados na parcela. */
  calculos: string[];
  /** Carga instalada da parcela (kW, sem FD); `null` = algum cálculo não informou. */
  cargaInstaladaKW: number | null;
};

export type ResultadoDoNivel = {
  /** Método da área útil dos apartamentos "tipo" do nível; `null` = sem apartamentos (ou apart-hotel). */
  apartamentos: ResultadoAreaUtil | null;
  /** Método da área útil dos duplex (Equatorial e Energisa); `null` = sem duplex. */
  duplex: ResultadoAreaUtil | null;
  /** Fatores da composição (fator do conjunto, 1,52, 1,4, 1,1), com sugerido × adotado. */
  fatores: FatorDoMetodo[];
  parcelas: ParcelaDoNivel[];
  /** A fórmula da norma, com os símbolos das parcelas (tela e relatório). */
  formula: string;
  referencia: string;
  demandaKVA: number | null;
  /** Carga instalada do nível (kW, sem FD): apartamentos do levantamento + cálculos; `null` = falta dado (Q28). */
  cargaInstaladaKW: number | null;
  /** A mesma conta só com os valores sugeridos (pergunta 1 do plano). */
  demandaCriterioKVA: number | null;
  avisos: Mensagem[];
};

// ─── Fórmulas lidas dos trechos ──────────────────────────────────────────────────────────────────────────────────

const NEO_053 = [{ fonte: DIS_NOR_053, ...NEO_TRECHOS.anexoIFormula }];
const F_NEO = lerDoTrecho(NEO_053, "Anexo I", /Ded = Drf \+ Ds \+ Dc \+ Dve/);
const F_EQT = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2 (apartamentos tipo iguais)", /D = \(D1\) x [\d,]+ \+ D2 \+ D3 \(2\)/);
const F_EQT_DUPLEX = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2 (tipo e duplex)", /\(D3\) x ([\d,]+) \+ D2 \+ D4 \(5\) D3 = S x f \+ \(a \+ b\)/);
const F_EQT_MISTO = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2 (misto)", /D = \(D1\) x [\d,]+ \+ D2 \+ D3 \+ D4 \(7\)/);
const F_EQT_APART_HOTEL = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.8", /critério da carga instalada/);
const F_CEMIG = lerDoTrecho(CEMIG_ND52_TRECHOS, "7.2", /D = D1 \+ D2 \(kVA\)/);
const F_CELESC = lerDoTrecho(CELESC_N3210003_TRECHOS, "5.6.2", /DP = k · \(D1 \+ D2\) \+ De \+ Ds/);
const F_ENERGISA = lerDoTrecho(ENERGISA_NDU003_TRECHOS, "9.4.1", /D = \(d1 \+ d2\) × [\d,]+ \+ dce/);
/** 1,52 do 9.4.2 e 1,1 do 9.4.3, lidos do texto. */
export const ENERGISA_DUPLEX = lerDoTrecho(ENERGISA_NDU003_TRECHOS, "9.4.2", /D = \(d1 \+ d2 \+ d3\) × ([\d,]+) \+ dce/);
export const ENERGISA_LOJAS = lerDoTrecho(ENERGISA_NDU003_TRECHOS, "9.4.3", /D2 = nL × d3 × ([\d,]+)/);
/** 1,4 do D3 (duplex) na Equatorial. */
export const EQUATORIAL_DUPLEX = F_EQT_DUPLEX;

// ─── Grupos: em que parcela entra cada papel ─────────────────────────────────────────────────────────────────────

type Grupo = "condominio" | "fora" | "comercial" | "recarga" | "duplex" | "apartamentos";

/**
 * Parcela de cada papel. "condominio" = dentro do fator do conjunto (Celesc k, Copel multiplicador, Energisa 1,3/1,52);
 * "fora" = somado à parte (Celesc De, Energisa dce, Copel cargas especiais). Incêndio = motor do condomínio, exceto na
 * Energisa, onde motor é dce (Tabelas 15 a 17) — pergunta 25.
 */
const GRUPOS: Record<IdComAreaUtil, Record<PapelCalculo, Grupo>> = {
  neoenergia: { condominio: "condominio", incendio: "condominio", especial: "condominio", comercial: "comercial", recarga: "recarga", duplex: "fora", apartamentos: "fora" },
  equatorial: { condominio: "condominio", incendio: "condominio", especial: "condominio", comercial: "comercial", recarga: "recarga", duplex: "duplex", apartamentos: "apartamentos" },
  cemig: { condominio: "condominio", incendio: "condominio", especial: "condominio", comercial: "condominio", recarga: "condominio", duplex: "condominio", apartamentos: "condominio" },
  celesc: { condominio: "condominio", incendio: "condominio", especial: "fora", comercial: "comercial", recarga: "fora", duplex: "fora", apartamentos: "fora" },
  energisa: { condominio: "condominio", incendio: "fora", especial: "fora", comercial: "comercial", recarga: "fora", duplex: "duplex", apartamentos: "fora" },
};

/** Σ da carga instalada (kW) dos cálculos; `null` se algum não informou. */
function cargaDosCalculos(calculos: readonly CalculoNoNivel[]): number | null {
  const vs = calculos.map((c) => c.cargaInstaladaKW);
  return vs.some((v) => v == null) ? null : vs.reduce<number>((t, v) => t + (v as number), 0);
}

function somar(calculos: readonly CalculoNoNivel[], campo: "demandaKVA" | "demandaKW"): { valor: number | null; ids: string[] } {
  const ids = calculos.map((c) => c.id);
  const vals = calculos.map((c) => c[campo]);
  return { valor: vals.some((v) => v == null) ? null : vals.reduce<number>((s, v) => s + (v as number), 0), ids };
}

const soma = (vs: readonly (number | null)[]): number | null =>
  vs.some((v) => v == null) ? null : vs.reduce<number>((s, v) => s + (v as number), 0);
const vezes = (a: number | null, b: number | null): number | null => (a == null || b == null ? null : a * b);

function metodo(c: IdComAreaUtil, tipos: readonly TipoApartamento[], ajustes: Ajustes | undefined, opcoes: OpcoesDoNivel | undefined): ResultadoAreaUtil {
  switch (c) {
    case "neoenergia":
      return neoenergia.demandaAreaUtil(tipos, ajustes, { studio: opcoes?.studio });
    case "equatorial":
      return equatorial.demandaAreaUtil(tipos, ajustes, { apartHotel: opcoes?.apartHotel });
    case "cemig":
      return cemig.demandaAreaUtil(tipos, ajustes, { forma: opcoes?.formaCemig });
    case "celesc":
      return celesc.demandaAreaUtil(tipos, ajustes);
    case "energisa":
      return energisa.demandaAreaUtil(tipos, ajustes);
  }
}

/** D1 do método (passo "d1", com os fatores adotados), antes do multiplicador. */
const d1De = (r: ResultadoAreaUtil): number | null => r.passos.find((p) => p.chave === "d1")?.valor ?? null;

/** Passo 15 a 18 para um nível. */
export function demandaDoNivel(e: EntradaDoNivel): ResultadoDoNivel {
  const c = e.concessionaria;
  if (soCargaInstalada(c)) return demandaSoCargaInstalada(e, c);
  const nome = NOMES[c];
  const grupo = GRUPOS[c];
  const doGrupo = (g: Grupo) => e.calculos.filter((x) => grupo[x.papel] === g);
  const comDuplex = c === "equatorial" || c === "energisa";
  const apartHotel = c === "equatorial" && !!e.opcoes?.apartHotel;

  const tiposTipo = e.tipos.filter((t) => !(comDuplex && t.duplex));
  const tiposDuplex = comDuplex ? e.tipos.filter((t) => t.duplex) : [];
  const apartamentos = tiposTipo.length && !apartHotel ? metodo(c, tiposTipo, e.ajustes?.apartamentos, e.opcoes) : null;
  const duplex = tiposDuplex.length && !apartHotel ? metodo(c, tiposDuplex, e.ajustes?.duplex, e.opcoes) : null;
  const avisos: Mensagem[] = [...(apartamentos?.avisos ?? []), ...(duplex?.avisos ?? [])];
  if (apartHotel && e.tipos.length) avisos.push(MSG.apartHotelAreaUtil());

  const kva = (g: Grupo) => somar(doGrupo(g), "demandaKVA");
  const kw = (g: Grupo) => somar(doGrupo(g), "demandaKW");
  const parcela = (chave: string, rotulo: string, simbolo: string, s: { valor: number | null; ids: string[] }, unidade: "kVA" | "kW" = "kVA"): ParcelaDoNivel => ({
    chave,
    rotulo,
    simbolo,
    valor: s.valor,
    unidade,
    calculos: s.ids,
    cargaInstaladaKW: cargaDosCalculos(e.calculos.filter((x) => s.ids.includes(x.id))),
  });
  const apto = (usar: "adotado" | "sugerido") => (apartamentos ? (usar === "adotado" ? apartamentos.demandaKVA : apartamentos.demandaCriterioKVA) : 0);

  let fatores: FatorDoMetodo[] = [];
  let parcelas: ParcelaDoNivel[];
  let formula: string;
  let referencia: string;
  let total: (usar: "adotado" | "sugerido") => number | null;

  switch (c) {
    case "neoenergia": {
      const ds = kva("condominio"), dc = kva("comercial"), dve = kva("recarga"), outros = kva("fora");
      parcelas = [
        parcela("ds", "Demanda de serviço do condomínio", "Ds", ds),
        parcela("dc", "Demanda das cargas comerciais", "Dc", dc),
        parcela("dve", "Demanda da recarga de veículos elétricos", "Dve", dve),
        ...(outros.ids.length ? [parcela("outros", "Outras cargas", "Do", outros)] : []),
      ];
      formula = "Ded = Drf + Ds + Dc + Dve";
      referencia = F_NEO.referencia;
      total = (u) => soma([apto(u), ds.valor, dc.valor, dve.valor, outros.valor]);
      break;
    }
    case "equatorial": {
      const d2 = kva("condominio"), lojas = kva("comercial"), recarga = kva("recarga"), ab = kva("duplex");
      const apts = kva("apartamentos");
      if (apartHotel && e.tipos.length && !apts.ids.length) {
        apts.valor = null;
        avisos.push(MSG.campoObrigatorio("demanda dos apartamentos pela carga instalada"));
      }
      const m14 = fator("multiplicador_duplex", "Multiplicador dos duplex", F_EQT_DUPLEX.valores[0], F_EQT_DUPLEX.referencia, e.ajustes?.composicao);
      const sf = duplex ? d1De(duplex) : 0;
      const sfCriterio = duplex ? vezes(duplex.fatores.find((f) => f.chave === "s")!.sugerido, duplex.fatores.find((f) => f.chave === "f")!.sugerido) : 0;
      const d3dup = (u: "adotado" | "sugerido") => (duplex || ab.ids.length ? soma([u === "adotado" ? sf : sfCriterio, ab.valor]) : 0);
      if (duplex || ab.ids.length) fatores = [m14];
      parcelas = [
        ...(apartHotel ? [parcela("apartamentos", "Apartamentos pela carga instalada", "Da", apts)] : []),
        ...(duplex || ab.ids.length ? [parcela("ab", "Sauna e aquecedor de banheira dos duplex", "a + b", ab)] : []),
        parcela("d2", "Demanda do condomínio", "D2", d2),
        ...(lojas.ids.length ? [parcela("lojas", "Demanda das lojas", "D3", lojas)] : []),
        parcela("recarga", "Demanda da recarga de veículos elétricos", lojas.ids.length || duplex ? "D4" : "D3", recarga),
      ];
      if (apartHotel) {
        formula = "D = Da + D2 + D3 + D4 (apart-hotel, carga instalada)";
        referencia = F_EQT_APART_HOTEL.referencia;
        total = () => soma([apts.valor, d2.valor, lojas.valor, recarga.valor]);
      } else {
        // Duplex com lojas: a norma não traz a fórmula junta; soma as duas (pergunta 27).
        formula = duplex || ab.ids.length
          ? `D = D1 × 1,2 + D3 × 1,4 + D2${lojas.ids.length ? " + lojas" : ""} + D4`
          : lojas.ids.length
            ? "D = D1 × 1,2 + D2 + D3 + D4"
            : "D = D1 × 1,2 + D2 + D3";
        referencia = (duplex || ab.ids.length ? F_EQT_DUPLEX : lojas.ids.length ? F_EQT_MISTO : F_EQT).referencia;
        total = (u) => soma([apto(u), vezes(d3dup(u), m14[u]), d2.valor, lojas.valor, recarga.valor]);
      }
      break;
    }
    case "cemig": {
      const d2 = kva("condominio");
      parcelas = [parcela("d2", "Demanda do condomínio, lojas e outros", "D2", d2)];
      formula = "D = D1 + D2";
      referencia = F_CEMIG.referencia;
      total = (u) => soma([apto(u), d2.valor]);
      break;
    }
    case "celesc": {
      const k = apartamentos?.fatorDoConjunto ?? celesc.fatorDoConjunto(e.ajustes?.apartamentos);
      const d2 = kva("condominio"), de = kva("fora"), ds = kva("comercial");
      fatores = apartamentos ? [] : [k];
      parcelas = [
        parcela("d2", "Demanda do condomínio", "D2", d2),
        parcela("de", "Demanda das cargas especiais", "De", de),
        parcela("ds", "Demanda comercial", "Ds", ds),
      ];
      formula = "DP = k · (D1 + D2) + De + Ds";
      referencia = F_CELESC.referencia;
      // apto(u) já traz k · D1.
      total = (u) => soma([apto(u), vezes(k[u], d2.valor), de.valor, ds.valor]);
      break;
    }
    case "energisa": {
      const m13 = apartamentos?.fatorDoConjunto ?? energisa.fatorDoConjunto(e.ajustes?.apartamentos);
      const m152 = fator("multiplicador_duplex", "Fator multiplicativo (tipo e duplex)", ENERGISA_DUPLEX.valores[0], ENERGISA_DUPLEX.referencia, e.ajustes?.composicao);
      const m11 = fator("multiplicador_lojas", "Fator multiplicativo (lojas)", ENERGISA_LOJAS.valores[0], ENERGISA_LOJAS.referencia, e.ajustes?.composicao);
      const d2 = kw("condominio"), b = kw("duplex"), lojas = kw("comercial"), dce = kva("fora");
      const temDuplex = !!duplex || b.ids.length > 0;
      const d1 = (u: "adotado" | "sugerido") =>
        apartamentos ? (u === "adotado" ? d1De(apartamentos) : somaFA(apartamentos)) : 0;
      const fa = (u: "adotado" | "sugerido") => (duplex ? (u === "adotado" ? d1De(duplex) : somaFA(duplex)) : 0);
      const residencial = (u: "adotado" | "sugerido") =>
        temDuplex ? vezes(soma([d1(u), fa(u), b.valor, d2.valor]), m152[u]) : vezes(soma([d1(u), d2.valor]), m13[u]);
      const comLojas = lojas.ids.length > 0;
      fatores = [...(temDuplex ? [m152] : apartamentos ? [] : [m13]), ...(comLojas ? [m11] : [])];
      parcelas = [
        ...(temDuplex ? [parcela("b", "Aquecimento e ar-condicionado dos duplex (nD × b)", "nD × b", b, "kW")] : []),
        parcela(temDuplex ? "d3" : "d2", "Carga demandada do condomínio", temDuplex ? "d3" : "d2", d2, "kW"),
        ...(comLojas ? [parcela("lojas", "Carga demandada das lojas (nL × d3)", "nL × d3", lojas, "kW")] : []),
        parcela("dce", "Cargas especiais", "dce", dce),
      ];
      formula = [
        temDuplex ? "D = (d1 + d2 + d3) × 1,52" : "D = (d1 + d2) × 1,3",
        comLojas ? " + nL × d3 × 1,1" : "",
        " + dce",
      ].join("");
      referencia = (comLojas ? ENERGISA_LOJAS : temDuplex ? ENERGISA_DUPLEX : F_ENERGISA).referencia;
      total = (u) => soma([residencial(u), comLojas ? vezes(lojas.valor, m11[u]) : 0, dce.valor]);
      break;
    }
  }

  const todosFatores = [...fatores];
  avisos.push(...avisosAbaixoDaNorma(todosFatores, nome));
  return {
    apartamentos,
    duplex,
    fatores: todosFatores,
    parcelas,
    formula,
    referencia,
    demandaKVA: total("adotado"),
    cargaInstaladaKW: cargaInstaladaDoNivel(e, apartHotel),
    demandaCriterioKVA: total("sugerido"),
    avisos,
  };
}

/**
 * Carga instalada do nível (kW, sem FD) — Q28. Apartamentos: quantidade × carga de UMA unidade (do levantamento do
 * apartamento), exceto quando eles já vêm como cálculo de carga instalada (apart-hotel), que entra pela soma dos
 * cálculos. `null` = algum tipo ou cálculo sem a carga.
 */
function cargaInstaladaDoNivel(e: EntradaDoNivel, apartamentosPorCalculo: boolean): number | null {
  const calcs = cargaDosCalculos(e.calculos);
  let aptos = 0;
  if (!apartamentosPorCalculo) {
    for (const t of e.tipos) {
      if (t.cargaInstaladaKW == null) return null;
      aptos += t.quantidade * t.cargaInstaladaKW;
    }
  }
  return calcs == null ? null : aptos + calcs;
}

/** Copel e Enel (Q23 e Q24): a demanda é a soma das demandas dos cálculos de carga instalada, sem método de área útil. */
function demandaSoCargaInstalada(e: EntradaDoNivel, c: "copel" | "enel"): ResultadoDoNivel {
  const nome = NOMES[c];
  const parte = (papeis: readonly PapelCalculo[]) => e.calculos.filter((x) => papeis.includes(x.papel));
  const parcela = (chave: string, rotulo: string, simbolo: string, calculos: readonly CalculoNoNivel[]): ParcelaDoNivel => ({
    chave,
    rotulo,
    simbolo,
    valor: soma(calculos.map((x) => x.demandaKVA)),
    unidade: "kVA",
    calculos: calculos.map((x) => x.id),
    cargaInstaladaKW: cargaDosCalculos(calculos),
  });
  const apartamentos = parte(["apartamentos", "duplex"]);
  const avisos: Mensagem[] = [];
  const faltaApartamentos = e.tipos.length > 0 && apartamentos.length === 0;
  if (faltaApartamentos) avisos.push(MSG.campoObrigatorio("demanda dos apartamentos pela carga instalada"));
  // Incêndio entra na carga do condomínio, como a norma pede (resposta do engenheiro, Q28).
  const parcelas = [
    ...(apartamentos.length ? [parcela("apartamentos", "Apartamentos pela carga instalada", "Da", apartamentos)] : []),
    parcela("condominio", "Condomínio, com a bomba de incêndio", "D2", parte(["condominio", "incendio"])),
    ...(parte(["comercial"]).length ? [parcela("comercial", "Lojas e cargas comerciais", "Dc", parte(["comercial"]))] : []),
    ...(parte(["especial"]).length ? [parcela("especial", "Cargas especiais", "De", parte(["especial"]))] : []),
    ...(parte(["recarga"]).length ? [parcela("recarga", "Recarga de veículos elétricos", "Dve", parte(["recarga"]))] : []),
  ];
  const demanda = faltaApartamentos ? null : soma(e.calculos.map((x) => x.demandaKVA));
  return {
    apartamentos: null,
    duplex: null,
    fatores: [],
    parcelas,
    formula: "D = Σ demandas dos cálculos de carga instalada",
    referencia: `Método da carga instalada, critério informado pelo engenheiro para a ${nome} (sem método de área útil)`,
    demandaKVA: demanda,
    cargaInstaladaKW: cargaDosCalculos(e.calculos),
    demandaCriterioKVA: demanda,
    avisos,
  };
}

/** Energisa: Σ f × a só com os sugeridos (o critério). */
function somaFA(r: ResultadoAreaUtil): number | null {
  const fs = r.fatores.filter((f) => f.chave.startsWith("f:"));
  const as = r.fatores.filter((f) => f.chave.startsWith("a:"));
  return soma(fs.map((f, i) => vezes(f.sugerido, as[i]?.sugerido ?? null)));
}
