import { NBR5410_TABELA_33, NBR5410_TABELA_42, type MetodoReferencia } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr5410";
import {
  correnteCorrigida,
  correnteDaDemanda,
  disjuntorSugerido,
  tensaoDaLigacao,
  type Ligacao,
  type Sistema,
} from "@/modules/ferramentas/calc/cargas-demanda/corrente";
import {
  avisoDeAluminio,
  fatorDeAgrupamento,
  fatorDeResistividade,
  fatorDeTemperatura,
  formaSugerida,
  formasDoMetodo,
  meioDoMetodo,
  metodosDeReferencia,
  neutroSugerido,
  protecaoSugerida,
  secaoAdotada,
  secaoMinima,
  secaoPelaCapacidade,
  temperaturaDeReferencia,
  type FormaAgrupamento,
  type SugestaoCondutor,
  type ResultadoSecao,
  type ResultadoSecaoFinal,
} from "@/modules/ferramentas/calc/cargas-demanda/entrada";
import type { FatorDoMetodo } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/tipos";
import type { Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

import type { EntradaEstudo } from "./conteudo";

/**
 * Entrada (corrente, disjuntor, cabo) de um flat, de um CMD ou do CPG — **puro**. Liga o que o projetista escolheu
 * (`EntradaEstudo`, só entradas) ao motor de `entrada.ts` e de `corrente.ts` (spec §5, passos 19 a 24). Nada é gravado:
 * o que falta escolher vira `null` e a lista `faltam`, nunca um valor inventado.
 *
 * Contas, na ordem:  I = S ÷ (k·V)  →  Ib′ = I ÷ (FCT × FCA)  →  disjuntor = menor da série ≥ I  →  seção = menor com
 * capacidade ≥ Ib′ (e não menor que a mínima do uso)  →  neutro e proteção pela seção adotada.
 */

/** Linhas da Tabela 33 para a lista de métodos de instalação: número, descrição e os métodos de referência dele. */
export function metodosDeInstalacao(): { valor: string; descricao: string; referencia: string }[] {
  return NBR5410_TABELA_33.linhas.map((l) => ({
    valor: l.metodo_instalacao,
    descricao: l.descricao,
    referencia: [...new Set(l.metodo_referencia.map((m) => m.metodo))].join(" ou "),
  }));
}

export type OpcaoDeAgrupamento = { valor: string; rotulo: string; forma: FormaAgrupamento };

/**
 * Formas de agrupamento que a norma oferece para o método de referência, com o texto da própria tabela (a tela não cita a
 * tabela). O `valor` é a forma serializada, para o seletor.
 */
export function opcoesDeAgrupamento(metodo: MetodoReferencia): OpcaoDeAgrupamento[] {
  return formasDoMetodo(metodo).map((forma) => {
    const rotulo =
      forma.tabela === "42"
        ? (NBR5410_TABELA_42.linhas.find((l) => l.ref === forma.ref)?.forma_de_agrupamento ?? `Forma ${forma.ref}`)
        : forma.tabela === "43"
          ? "Camadas de condutores (circuitos por camada)"
          : forma.tabela === "44"
            ? `Cabos diretamente enterrados · distância entre cabos ${forma.distancia}`
            : `Eletrodutos enterrados (${forma.parte}) · espaçamento ${forma.espacamento}`;
    return { valor: JSON.stringify(forma), rotulo, forma };
  });
}

export type ResultadoEntrada = {
  /** Tensão e k da ligação; `null` = falta o sistema de tensão ou a ligação do estudo. */
  tensaoV: number | null;
  k: number | null;
  /** I = S ÷ (k·V), em A. */
  correnteA: number | null;
  /** Método de referência pela Tabela 33 (o primeiro quando há mais de um). */
  metodoReferencia: string | null;
  fct: FatorDoMetodo | null;
  fca: FatorDoMetodo | null;
  fatorResistividade: FatorDoMetodo | null;
  fatorCombinado: number | null;
  ibCorrigidaA: number | null;
  disjuntorSugeridoA: number | null;
  disjuntorAdotadoA: number | null;
  secao: ResultadoSecao | null;
  secaoFinal: ResultadoSecaoFinal | null;
  neutro: SugestaoCondutor | null;
  protecao: SugestaoCondutor | null;
  avisos: Mensagem[];
  /** O que ainda falta escolher, pelo nome da tela. */
  faltam: string[];
};

const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Entrada ainda sem nenhuma escolha (um CMD novo, sem registro de entrada). */
export function entradaVazia(alvo: EntradaEstudo["alvo"]): EntradaEstudo {
  return {
    alvo,
    metodoInstalacao: null,
    isolacao: null,
    material: null,
    carregados: null,
    disposicao: null,
    temperaturaC: null,
    fct: null,
    formaAgrupamento: null,
    circuitos: null,
    camadas: null,
    fca: null,
    resistividadeSoloKmW: null,
    disjuntorAdotadoA: null,
    secaoAdotadaMm2: null,
  };
}

/**
 * Cálculo da entrada de um nível. `demandaKVA` é a do flat, do CMD ou do CPG; `sistema` e `ligacao` são os do estudo.
 * O uso do circuito (seção mínima da Tabela 47) é força: a entrada de uma edificação alimenta cargas de uso geral.
 */
export function calcularEntrada(e: EntradaEstudo, demandaKVA: number | null, sistema: Sistema | null, ligacao: Ligacao | null): ResultadoEntrada {
  const faltam: string[] = [];
  const avisos: Mensagem[] = [];
  const vazio: ResultadoEntrada = {
    tensaoV: null, k: null, correnteA: null, metodoReferencia: null, fct: null, fca: null, fatorResistividade: null, fatorCombinado: null,
    ibCorrigidaA: null, disjuntorSugeridoA: null, disjuntorAdotadoA: null, secao: null, secaoFinal: null, neutro: null, protecao: null, avisos, faltam,
  };

  // Passo 19 — corrente da demanda.
  if (!sistema) faltam.push("sistema de tensão");
  if (!ligacao) faltam.push("ligação");
  if (!ehNumero(demandaKVA)) faltam.push("demanda");
  const tensao = sistema && ligacao ? tensaoDaLigacao(sistema, ligacao) : null;
  const correnteA = tensao && ehNumero(demandaKVA) ? correnteDaDemanda(demandaKVA * 1000, tensao.v, tensao.k) : null;
  const dj = correnteA == null ? null : disjuntorSugerido(correnteA);
  if (dj) avisos.push(...dj.avisos);
  const disjuntorAdotadoA = e.disjuntorAdotadoA ?? dj?.sugeridoA ?? null;

  // Passo 20 — condições de instalação (precisam das escolhas do projetista).
  const metodo = e.metodoInstalacao ? metodosDeReferencia(e.metodoInstalacao)[0]?.metodo ?? null : null;
  if (!e.metodoInstalacao) faltam.push("método de instalação");
  if (!e.isolacao) faltam.push("isolação");
  if (!e.material) faltam.push("material");
  if (!e.carregados) faltam.push("condutores carregados");

  const base = { ...vazio, tensaoV: tensao?.v ?? null, k: tensao?.k ?? null, correnteA, metodoReferencia: metodo, disjuntorSugeridoA: dj?.sugeridoA ?? null, disjuntorAdotadoA };
  if (!metodo || !e.isolacao || !e.material || !e.carregados || correnteA == null) return base;

  const meio = meioDoMetodo(metodo);
  const temperaturaC = ehNumero(e.temperaturaC) ? e.temperaturaC : temperaturaDeReferencia(meio);
  const fctR = fatorDeTemperatura({ isolacao: e.isolacao, meio, temperaturaC }, e.fct != null ? { fct: e.fct } : undefined);
  avisos.push(...fctR.avisos);
  if (fctR.recusa) avisos.push(fctR.recusa);

  const forma: FormaAgrupamento | null = (e.formaAgrupamento as FormaAgrupamento | null) ?? formaSugerida(metodo);
  const circuitos = e.circuitos ?? 1;
  const fca: FatorDoMetodo = forma
    ? fatorDeAgrupamento({ forma, circuitos, camadas: e.camadas ?? undefined }, e.fca != null ? { fca: e.fca } : undefined)
    : { chave: "fca", rotulo: "Fator de agrupamento", simbolo: "FCA", sugerido: null, adotado: e.fca, referencia: "", digitado: e.fca != null };
  const frs = meio === "solo" && ehNumero(e.resistividadeSoloKmW) ? fatorDeResistividade(e.resistividadeSoloKmW) : null;

  const fctAdotado = fctR.fator.adotado;
  if (fctAdotado == null) faltam.push("fator de temperatura");
  if (fca.adotado == null) faltam.push("fator de agrupamento");
  if (fctAdotado == null || fca.adotado == null) return { ...base, fct: fctR.fator, fca, fatorResistividade: frs };

  const combinado = fctAdotado * fca.adotado * (frs?.adotado ?? 1);
  const corr = correnteCorrigida(correnteA, combinado, 1);
  avisos.push(...corr.avisos);

  // Passos 22 e 23 — seção pela capacidade, mínima do uso e a adotada.
  const secao = secaoPelaCapacidade({ metodo, isolacao: e.isolacao, material: e.material, carregados: e.carregados, disposicao: e.disposicao ?? undefined, ibCorrigidaA: corr.ibCorrigida });
  avisos.push(...secao.avisos);
  const minima = secaoMinima("forca", e.material);
  const alu = avisoDeAluminio("forca", e.material);
  if (alu) avisos.push(alu);
  const final = secaoAdotada(secao.secaoMm2, minima, e.secaoAdotadaMm2 ?? undefined);
  avisos.push(...final.avisos);

  // Passo 24 — neutro e proteção pela seção adotada.
  const neutro = final.adotadaMm2 != null ? neutroSugerido(final.adotadaMm2, e.material) : null;
  const protecao = final.adotadaMm2 != null ? protecaoSugerida(final.adotadaMm2, e.material) : null;
  if (secao.secaoMm2 == null && e.secaoAdotadaMm2 == null) faltam.push("seção do cabo");

  return { ...base, fct: fctR.fator, fca, fatorResistividade: frs, fatorCombinado: combinado, ibCorrigidaA: corr.ibCorrigida, secao, secaoFinal: final, neutro, protecao };
}
