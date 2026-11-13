import {
  MAX_CALCULOS,
  MAX_LINHAS_POR_CALCULO,
  MAX_TIPOS_APARTAMENTO,
  type CalculoEstudo,
  type ConteudoCargasDemanda,
  type LinhaCargaEstudo,
  type MetodoCalculo,
  type OrigemVinculo,
} from "./conteudo";
import { novoId } from "./edicao";
import { REGRA_NEO_ADM_ILUMINACAO, REGRA_NEO_ADM_TOMADAS } from "./fd-linha";
import { atualizarDoLevantamento, origensDoEscopo, totaisDoEscopo, trazerLinha } from "./levantamento";

/**
 * Edições dos cálculos de demanda (etapa 2) — **puras**, no mesmo molde de `edicao.ts`: recebem o documento e devolvem
 * outro. Nada grava sozinho; o "trazer" e o "atualizar" do levantamento só rodam quando o projetista pede (spec §3.1, regra 3).
 */

export const MOTIVO_CALCULOS_CHEIO = `O estudo já tem o máximo de ${MAX_CALCULOS} cálculos.`;
export const MOTIVO_LINHAS_CHEIO = `O cálculo já tem o máximo de ${MAX_LINHAS_POR_CALCULO} linhas.`;
export const MOTIVO_TIPOS_CHEIO = `O cálculo já tem o máximo de ${MAX_TIPOS_APARTAMENTO} tipos de apartamento.`;

export function novoCalculo(metodo: Exclude<MetodoCalculo, "composicao">, nome: string): CalculoEstudo {
  return {
    id: novoId("calc_"),
    nome,
    metodo,
    papel: null,
    escopo: { levantamentoIds: [], quantidade: 1 },
    linhas: [],
    apartamentos: [],
    fdAquecimento: null,
    ajustes: {},
  };
}

export function novaLinhaCarga(parcial: Partial<LinhaCargaEstudo> = {}): LinhaCargaEstudo {
  return { id: novoId("lin_"), tipoCarga: null, descricao: "", quantidade: null, potenciaW: null, fp: null, fd: null, vinculo: null, regraFd: null, subtipo: null, ...parcial };
}

/**
 * Neoenergia, "Administração de edifícios de uso coletivo": a regra tem DUAS cargas, 1,00 da iluminação e 0,50 das
 * tomadas (resposta do engenheiro à Q36). Entram como duas linhas, cada uma com o seu FD sugerido pela regra (o valor
 * vem da biblioteca; a linha só guarda qual regra segue). Quantidade, potência e FP o projetista completa.
 */
export function linhasAdministracaoEdificios(): LinhaCargaEstudo[] {
  return [
    novaLinhaCarga({ tipoCarga: "iluminacao", descricao: "Administração — iluminação", regraFd: REGRA_NEO_ADM_ILUMINACAO }),
    novaLinhaCarga({ tipoCarga: "tomadas_uso_geral", descricao: "Administração — tomadas", regraFd: REGRA_NEO_ADM_TOMADAS }),
  ];
}

export function novoTipoApartamento(nome: string) {
  return { id: novoId("tipo_"), nome, quantidade: null, areaUtilM2: null, duplex: false, levantamentoId: null };
}

export function mapCalculo(c: ConteudoCargasDemanda, id: string, f: (k: CalculoEstudo) => CalculoEstudo): ConteudoCargasDemanda {
  return { ...c, calculos: c.calculos.map((k) => (k.id === id ? f(k) : k)) };
}

export function mapLinha(k: CalculoEstudo, id: string, f: (l: LinhaCargaEstudo) => LinhaCargaEstudo): CalculoEstudo {
  return { ...k, linhas: k.linhas.map((l) => (l.id === id ? f(l) : l)) };
}

// ─── Cópia e exclusão ────────────────────────────────────────────────────────────────────────────────────────────

export function copiarCalculo(k: CalculoEstudo): CalculoEstudo {
  return {
    ...k,
    id: novoId("calc_"),
    nome: `${k.nome.slice(0, 112)} (cópia)`,
    escopo: { ...k.escopo, levantamentoIds: [...k.escopo.levantamentoIds] },
    linhas: k.linhas.map((l) => ({ ...l, id: novoId("lin_"), vinculo: l.vinculo ? { origem: { ...l.vinculo.origem }, trazido: { ...l.vinculo.trazido } } : null })),
    // Tipos novos: o medidor de um CMD cita o tipo pelo id, e a cópia não pode roubar os medidores do original.
    apartamentos: k.apartamentos.map((t) => ({ ...t, id: novoId("tipo_") })),
    ajustes: { apartamentos: k.ajustes.apartamentos && { ...k.ajustes.apartamentos }, duplex: k.ajustes.duplex && { ...k.ajustes.duplex }, composicao: k.ajustes.composicao && { ...k.ajustes.composicao } },
  };
}

/**
 * Tira o cálculo e tudo que o cita: os medidores do CMD (do cálculo, e os residenciais dos tipos dele), o CPG e a entrada
 * dele (o esquema recusa referência a algo que sumiu).
 */
export function removerCalculo(c: ConteudoCargasDemanda, id: string): ConteudoCargasDemanda {
  const tiposDele = new Set(c.calculos.find((k) => k.id === id)?.apartamentos.map((t) => t.id) ?? []);
  return {
    ...c,
    calculos: c.calculos.filter((k) => k.id !== id),
    centros: {
      ...c.centros,
      cmds: c.centros.cmds.map((m) => ({
        ...m,
        medidores: m.medidores.filter((md) => (md.tipo === "residencial" ? !tiposDele.has(md.tipoApartamentoId) : md.calculoId !== id)),
      })),
      calculosSoNoCpg: c.centros.calculosSoNoCpg.filter((x) => x !== id),
    },
    entradas: c.entradas.filter((e) => !(e.alvo.nivel === "calculo" && e.alvo.calculoId === id)),
  };
}

/** Tira o tipo de apartamento do cálculo e os medidores residenciais que o citavam. */
export function removerTipoApartamento(c: ConteudoCargasDemanda, calculoId: string, tipoId: string): ConteudoCargasDemanda {
  const sem = mapCalculo(c, calculoId, (k) => ({ ...k, apartamentos: k.apartamentos.filter((t) => t.id !== tipoId) }));
  return {
    ...sem,
    centros: { ...sem.centros, cmds: sem.centros.cmds.map((m) => ({ ...m, medidores: m.medidores.filter((md) => !(md.tipo === "residencial" && md.tipoApartamentoId === tipoId)) })) },
  };
}

// ─── Trazer e atualizar do levantamento ──────────────────────────────────────────────────────────────────────────

const mesmaOrigem = (a: OrigemVinculo, b: OrigemVinculo) => a.tipo === b.tipo && (("chave" in a ? a.chave : "") === ("chave" in b ? b.chave : ""));

export type ResultadoDoTrazer = { calculo: CalculoEstudo; trazidas: number; incompletas: number; jaTinha: number };

/**
 * "Trazer do levantamento" (regra 1): uma linha por origem completa do escopo que o cálculo ainda não tem. Origem
 * incompleta (FP em branco etc.) não vira linha (a tela mostra o informativo); origem que já tem linha não duplica.
 */
export function trazerDoLevantamento(c: ConteudoCargasDemanda, k: CalculoEstudo): ResultadoDoTrazer {
  const totais = totaisDoEscopo(c, k.escopo.levantamentoIds);
  const novas: LinhaCargaEstudo[] = [];
  let incompletas = 0;
  let jaTinha = 0;
  for (const origem of origensDoEscopo(totais)) {
    if (k.linhas.some((l) => l.vinculo && mesmaOrigem(l.vinculo.origem, origem))) {
      jaTinha += 1;
      continue;
    }
    const linha = trazerLinha(totais, origem, novoId("lin_"));
    if (linha) novas.push(linha);
    else incompletas += 1;
  }
  const linhas = [...k.linhas, ...novas].slice(0, MAX_LINHAS_POR_CALCULO);
  return { calculo: { ...k, linhas }, trazidas: Math.min(novas.length, MAX_LINHAS_POR_CALCULO - k.linhas.length), incompletas, jaTinha };
}

export type ResultadoDoAtualizar = { calculo: CalculoEstudo; atualizadas: number; editadas: number; semCorrespondente: number };

/**
 * "Atualizar do levantamento" (regra 3): só as linhas vinculadas, e uma linha EDITADA à mão não é tocada (conta em
 * `editadas`), a menos que `descartarEdicao` (o projetista escolheu refazê-la a partir do levantamento).
 */
export function atualizarDoLevantamentoNoCalculo(
  c: ConteudoCargasDemanda,
  k: CalculoEstudo,
  opcoes: { linhaId?: string; descartarEdicao?: boolean } = {},
): ResultadoDoAtualizar {
  const totais = totaisDoEscopo(c, k.escopo.levantamentoIds);
  let atualizadas = 0;
  let editadas = 0;
  let semCorrespondente = 0;
  const linhas = k.linhas.map((l) => {
    if (opcoes.linhaId && l.id !== opcoes.linhaId) return l;
    const r = atualizarDoLevantamento(l, totais, { descartarEdicao: opcoes.descartarEdicao });
    if (r.atualizada) atualizadas += 1;
    else if (r.motivo === "editada") editadas += 1;
    else if (r.motivo === "sem_correspondente") semCorrespondente += 1;
    return r.linha;
  });
  return { calculo: { ...k, linhas }, atualizadas, editadas, semCorrespondente };
}
