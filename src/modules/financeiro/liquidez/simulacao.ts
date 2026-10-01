/**
 * Ajustes de simulação do planejador (spec §6 e §10). Puro: recebe os eventos reais e devolve
 * OUTRA lista com as marcas da simulação — nada aqui grava, e a entrada nunca é mutada.
 *
 * O formato dos ajustes (e a validação) é um só, em `ajustes.ts`: simulação, rascunho e cenário
 * salvo usam o mesmo. O motor lê as marcas por `EventoCaixa.simulacao`.
 */
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";
import type { Confianca, DataIso, EventoCaixa, Prioridade } from "@/modules/financeiro/liquidez/tipos";

export type { AjusteSimulado, MovimentoSimulado } from "@/modules/financeiro/liquidez/ajustes";

/** Prefixo do id dos eventos criados pela simulação — nunca colide com um id do banco. */
export const PREFIXO_SIMULADO = "sim:";

export function idDoSimulado(ajusteId: string): string {
  return `${PREFIXO_SIMULADO}${ajusteId}`;
}

/**
 * Dá para simular outra data? Só não dá quando a data tem dono (P1 com prazo legal, taxa de ART,
 * aprovação pendente). A previsão do cronograma PODE ser simulada — só não será aplicada.
 */
export function podeSimularData(e: Pick<EventoCaixa, "naoProgramavel" | "status" | "origem">): boolean {
  return e.origem === "simulado" || e.naoProgramavel == null || e.status === "previsao";
}

/** O alvo do ajuste (`eventoId`), quando o ajuste mexe num evento que já existe. */
export function alvoDoAjuste(a: AjusteSimulado): string | null {
  return a.tipo === "INCLUIR" ? null : a.eventoId;
}

/**
 * Aplica os ajustes em ordem. Ajuste cujo alvo não existe mais é ignorado (`ajustesSemAlvo` diz
 * quais). Reprogramar um evento cuja data não pode ser simulada também é ignorado.
 */
export function aplicarSimulacao(eventos: readonly EventoCaixa[], ajustes: readonly AjusteSimulado[], hoje: DataIso): EventoCaixa[] {
  const lista: EventoCaixa[] = eventos.map((e) => ({ ...e, simulacao: e.simulacao ? { ...e.simulacao } : undefined }));
  const porId = new Map(lista.map((e) => [e.id, e]));

  for (const a of ajustes) {
    if (a.tipo === "INCLUIR") {
      const id = idDoSimulado(a.id);
      if (porId.has(id)) continue;
      const m = a.movimento;
      const novo: EventoCaixa = {
        id,
        origem: "simulado",
        tipo: m.tipo,
        natureza: m.natureza,
        valor: m.valor,
        data: m.data,
        vencido: m.data < hoje,
        descricao: m.descricao,
        favorecido: null,
        projeto: null,
        categoriaNome: m.categoriaNome ?? null,
        status: null,
        prioridade: m.tipo === "despesa" && m.natureza === "resultado" ? "p3" : null,
        confianca: null,
        caixinhaId: null,
        naoProgramavel: null,
        transferencia: null,
        simulacao: { forcado: true },
      };
      lista.push(novo);
      porId.set(id, novo);
      continue;
    }

    const e = porId.get(a.eventoId);
    if (!e) continue;
    const marcas = (e.simulacao ??= {});
    switch (a.tipo) {
      case "REPROGRAMAR_DATA":
        if (!podeSimularData(e)) break;
        if (marcas.dataOriginal === undefined) marcas.dataOriginal = e.data;
        e.data = a.data;
        e.vencido = a.data < hoje;
        break;
      case "ALTERAR_PRIORIDADE":
        if (e.tipo !== "despesa" || e.natureza === "transferencia") break;
        if (marcas.prioridadeOriginal === undefined) marcas.prioridadeOriginal = e.prioridade;
        e.prioridade = a.prioridade;
        break;
      case "ALTERAR_CONFIANCA":
        if (e.tipo !== "receita" || e.natureza === "transferencia") break;
        if (marcas.confiancaOriginal === undefined) marcas.confiancaOriginal = e.confianca;
        e.confianca = a.confianca;
        break;
      case "EXCLUIR":
        marcas.excluido = true;
        marcas.forcado = false;
        break;
      case "FORCAR_INCLUSAO":
        marcas.forcado = true;
        marcas.excluido = false;
        break;
    }
  }
  return lista;
}

/** Ajustes cujo alvo não está mais entre os eventos (pago, cancelado, fora do horizonte). */
export function ajustesSemAlvo(eventos: readonly Pick<EventoCaixa, "id">[], ajustes: readonly AjusteSimulado[]): AjusteSimulado[] {
  const ids = new Set(eventos.map((e) => e.id));
  return ajustes.filter((a) => {
    const alvo = alvoDoAjuste(a);
    return alvo != null && !ids.has(alvo);
  });
}

/**
 * Troca o ajuste do mesmo tipo e alvo (simular outra data duas vezes não empilha), e remove o
 * ajuste quando ele volta ao estado original (ex.: data de volta à original). Puro.
 */
export function registrarAjuste(
  ajustes: readonly AjusteSimulado[],
  novo: AjusteSimulado,
  original?: Pick<EventoCaixa, "data" | "prioridade" | "confianca">,
): AjusteSimulado[] {
  const mesmo = (a: AjusteSimulado) =>
    a.tipo === novo.tipo && alvoDoAjuste(a) === alvoDoAjuste(novo) && (novo.tipo !== "INCLUIR" || (a as { id: string }).id === novo.id);
  // Tirar e incluir à mão são opostos sobre o mesmo alvo: o mais recente vence.
  const oposto = (a: AjusteSimulado) =>
    (novo.tipo === "EXCLUIR" && a.tipo === "FORCAR_INCLUSAO" && a.eventoId === novo.eventoId) ||
    (novo.tipo === "FORCAR_INCLUSAO" && a.tipo === "EXCLUIR" && a.eventoId === novo.eventoId);
  const resto = ajustes.filter((a) => !mesmo(a) && !oposto(a));
  const volta =
    original &&
    ((novo.tipo === "REPROGRAMAR_DATA" && novo.data === original.data) ||
      (novo.tipo === "ALTERAR_PRIORIDADE" && novo.prioridade === original.prioridade) ||
      (novo.tipo === "ALTERAR_CONFIANCA" && novo.confianca === original.confianca));
  return volta ? resto : [...resto, novo];
}

const ROTULO_PRIORIDADE: Record<Prioridade, string> = { p1: "P1", p2: "P2", p3: "P3", p4: "P4" };
const ROTULO_CONFIANCA: Record<Confianca, string> = {
  confirmada_cliente: "confirmada pelo cliente",
  provavel: "provável",
  estimada: "estimada",
  incerta: "incerta",
};

/** Frase curta do ajuste para a lista "Ajustes nesta simulação". */
export function descreverAjuste(a: AjusteSimulado, alvo: Pick<EventoCaixa, "descricao" | "data" | "prioridade" | "confianca"> | undefined): string {
  if (a.tipo === "INCLUIR") {
    const m = a.movimento;
    const sinal = m.tipo === "receita" ? "+" : "−";
    return `${m.descricao}: ${sinal}${formatarCentavos(m.valor)} em ${diaMes(m.data)}`;
  }
  const nome = alvo?.descricao ?? "Movimento que não está mais na projeção";
  switch (a.tipo) {
    case "REPROGRAMAR_DATA":
      return `${nome}: ${alvo ? diaMes(alvo.data) : "?"} → ${diaMes(a.data)}`;
    case "ALTERAR_PRIORIDADE":
      return `${nome}: prioridade ${ROTULO_PRIORIDADE[a.prioridade]}`;
    case "ALTERAR_CONFIANCA":
      return `${nome}: confiança ${ROTULO_CONFIANCA[a.confianca]}`;
    case "EXCLUIR":
      return `${nome}: tirado da simulação`;
    case "FORCAR_INCLUSAO":
      return `${nome}: incluído fora do cenário`;
  }
}
