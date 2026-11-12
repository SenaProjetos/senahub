/**
 * Execução da linha (F7.0) — o "Atualizar tarefas" do MS Project: início real e término real.
 * Regras puras, sem I/O; a action é `registrarExecucao` (permissão `cronograma:executado`).
 *
 * Até aqui nada no sistema gravava `inicioReal`/`fimReal`/`status` de uma linha — o verificador
 * já cobrava "concluída sem término real", mas não havia como concluir. Duas coisas dependem disto:
 *  - o marco concluído, que oferece aprovar a fase ligada a ele (D31, liberação do pagamento);
 *  - o Valor Agregado (F8), que precisa do realizado.
 *
 * Desde o L1 o motor LÊ as datas reais (D6 — "atraso real empurra as sucessoras"): registrar a
 * execução reagenda o projeto (`registrarExecucao` → `aposMudarEap`).
 *
 * Datas em `YYYY-MM-DD` (dia-calendário, comparável como texto).
 */
import { z } from "zod";
import type { StatusEap } from "@/generated/prisma/client";

type Dia = string;

/**
 * Entrada da action `registrarExecucao` (aqui porque arquivo `"use server"` só exporta função
 * assíncrona, e o teste confere as mensagens). Lote 7: `progresso` e `custoRealTerceiro` ausentes =
 * não mudam. As faixas e as recusas são da regra pura (`aplicarExecucao`); aqui só o tipo e o teto.
 */
export const registrarExecucaoSchema = z.object({
  id: z.string().min(1),
  inicioReal: z.string().nullable(),
  fimReal: z.string().nullable(),
  progresso: z.number({ error: "Percentual inválido." }).optional(),
  custoRealTerceiro: z
    .number({ error: "Valor inválido." })
    .min(0, "O valor não pode ser negativo.")
    .max(9_999_999_999, "Valor alto demais.")
    .nullable()
    .optional(),
  /**
   * As datas reais que a tela mostrava ao abrir. Diferentes das gravadas = outra pessoa (ou outra aba) salvou no meio:
   * recusa em vez de sobrescrever as datas dela. Ausente = não confere (chamadas antigas, smoke). O % não entra: a tela
   * mostra o % do motor (agrupamento, data de status), que pode diferir do gravado sem ninguém ter mexido.
   */
  esperado: z.object({ inicioReal: z.string().nullable(), fimReal: z.string().nullable() }).optional(),
});

export type EntradaExecucao = {
  inicioReal: Dia | null;
  fimReal: Dia | null;
  /** Ausente = o % não muda. Só vale sem término real; com término real é sempre 100. */
  progresso?: number;
};

export type LinhaParaExecucao = {
  tipoEap: string;
  ehResumo: boolean;
  status: StatusEap;
  progresso: number;
};

export type ResultadoExecucao =
  | {
      ok: true;
      inicioReal: Dia | null;
      fimReal: Dia | null;
      status: StatusEap;
      progresso: number;
      /** Passou a concluída AGORA (não estava) — é o que dispara a oferta de aprovar a fase. */
      concluiu: boolean;
    }
  | { ok: false; motivo: string };

/** Suspensa, cancelada, arquivada: fora da execução. */
const FORA_DA_EXECUCAO = new Set<StatusEap>(["sus", "can", "arq"]);

function diaValido(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 2000 || ano > 2099) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const falha = (motivo: string): ResultadoExecucao => ({ ok: false, motivo });

/**
 * Aplica as datas reais informadas e devolve o novo estado da linha, ou a recusa.
 *
 * - Marco tem UMA data ("concluído em"): o início real é o próprio término.
 * - Término real conclui: status `con` e 100% — é a regra que o verificador cobra ao contrário
 *   (`con` exige término real). Apagar o término reabre (`and` se começou, senão `nin`); o % não
 *   é inventado de volta — a coordenação informa (D19). Marco reaberto volta a 0%.
 * - Início real sem término: `nin` vira `and`. Os status de fluxo (`agu`, `rev`, `apr`) ficam como
 *   estão — começar não os desfaz. Bloqueada continua bloqueada (e não conclui: desbloqueie antes).
 * - Nada no futuro: real é o que JÁ aconteceu.
 * - % informado (Lote 7): avanço de quem acompanha, sem concluir — por isso 100 só pelo término real
 *   ("marcar 100%" não diz que terminou como planejado). O status segue só as datas: % sem início real
 *   não vira "em andamento" (o verificador acusaria "em andamento sem início real"). Marco não tem %.
 */
export function aplicarExecucao(linha: LinhaParaExecucao, entrada: EntradaExecucao, hoje: Dia): ResultadoExecucao {
  if (linha.ehResumo) return falha("Linha de agrupamento: as datas reais vêm das atividades dentro dela.");
  if (FORA_DA_EXECUCAO.has(linha.status)) {
    return falha("Linha suspensa, cancelada ou arquivada não recebe datas reais.");
  }

  const marco = linha.tipoEap === "mrc";
  const fimReal = entrada.fimReal || null;
  const inicioReal = marco ? fimReal : entrada.inicioReal || null;

  for (const d of [inicioReal, fimReal]) {
    if (d != null && !diaValido(d)) return falha("Data inválida.");
  }
  if ((inicioReal != null && inicioReal > hoje) || (fimReal != null && fimReal > hoje)) {
    return falha("Data real não pode ser no futuro — é o que já aconteceu.");
  }
  if (fimReal != null && inicioReal == null) return falha("Informe o início real antes do término.");
  if (inicioReal != null && fimReal != null && fimReal < inicioReal) {
    return falha("O término real não pode ser antes do início real.");
  }
  if (fimReal != null && linha.status === "blq") return falha("Desbloqueie a linha antes de concluí-la.");
  const pct = entrada.progresso;
  if (pct !== undefined) {
    if (marco) return falha("Marco não tem percentual: informe a data em que aconteceu.");
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return falha("Percentual inválido.");
    if (fimReal == null && pct === 100) return falha("Para marcar 100%, informe o término real.");
  }

  let status: StatusEap = linha.status;
  let progresso = linha.progresso;
  if (fimReal != null) {
    status = "con";
    progresso = 100;
  } else if (linha.status !== "blq") {
    if (inicioReal != null) {
      if (linha.status === "nin" || linha.status === "con") status = "and";
    } else if (linha.status === "and" || linha.status === "con") {
      status = "nin";
    }
    if (marco && linha.status === "con") progresso = 0;
  }
  if (fimReal == null && pct !== undefined) progresso = pct;
  // Reabrir sem dizer o % deixaria a linha em 100% sem término real, e o motor a trataria como concluída (a
  // sucessora não voltaria a esperar). O % não é inventado (D19): quem reabre informa quanto falta.
  if (!marco && linha.status === "con" && status !== "con" && progresso >= 100) {
    return falha("Ao reabrir, informe o % concluído (até 99%).");
  }
  return { ok: true, inicioReal, fimReal, status, progresso, concluiu: status === "con" && linha.status !== "con" };
}

export const MOTIVO_REABRIR_NA_CELULA = "Para reabrir a tarefa, use Atualizar tarefa e informe o % concluído.";
export const MOTIVO_APAGAR_INICIO_COM_TERMINO = "Apague o término real antes do início real.";

/**
 * As datas reais digitadas direto na tabela do Gantt de Controle (colunas Iníc. real / Térm. real). Uma célula muda uma
 * data; esta regra completa a outra para a action `registrarExecucao`, que recebe as duas:
 *
 * - Marco tem uma data só: a célula do término é a data em que aconteceu (início = término). Apagar reabre (0%).
 * - Término sem início real: o início real vira o início previsto, como o MS Project faz ao informar só o término — ou o
 *   próprio término, se o previsto for depois dele. `inicioDeduzido` diz de onde veio (`previsto` | `termino`), para a tela
 *   contar à pessoa; `false` = a pessoa informou.
 * - Apagar o término de uma tarefa concluída é reabrir, e reabrir exige o % (D19: o % não é inventado) — a célula não tem
 *   onde informar, então recusa e aponta o "Atualizar tarefa".
 * - Apagar o início com término real deixaria término sem início: recusa (a action recusaria com outra frase).
 *
 * As demais recusas (futuro, término antes do início, bloqueada) ficam com `aplicarExecucao`, no servidor.
 */
export function execucaoDaCelula(
  linha: { marco: boolean; status: StatusEap; inicioReal: Dia | null; fimReal: Dia | null; inicioPrevisto: Dia | null },
  campo: "inicioReal" | "fimReal",
  dia: Dia | null,
): { ok: true; inicioReal: Dia | null; fimReal: Dia | null; inicioDeduzido: false | "previsto" | "termino" } | { ok: false; motivo: string } {
  if (linha.marco) {
    if (campo === "inicioReal") return { ok: false, motivo: "Marco tem uma data só: informe o término real." };
    return { ok: true, inicioReal: dia, fimReal: dia, inicioDeduzido: false };
  }
  if (campo === "inicioReal") {
    if (dia == null && linha.fimReal != null) return { ok: false, motivo: MOTIVO_APAGAR_INICIO_COM_TERMINO };
    return { ok: true, inicioReal: dia, fimReal: linha.fimReal, inicioDeduzido: false };
  }
  if (dia == null) {
    if (linha.status === "con") return { ok: false, motivo: MOTIVO_REABRIR_NA_CELULA };
    return { ok: true, inicioReal: linha.inicioReal, fimReal: null, inicioDeduzido: false };
  }
  if (linha.inicioReal != null) return { ok: true, inicioReal: linha.inicioReal, fimReal: dia, inicioDeduzido: false };
  if (linha.inicioPrevisto && linha.inicioPrevisto <= dia) {
    return { ok: true, inicioReal: linha.inicioPrevisto, fimReal: dia, inicioDeduzido: "previsto" };
  }
  return { ok: true, inicioReal: dia, fimReal: dia, inicioDeduzido: "termino" };
}

/**
 * Status ao desbloquear: volta ao que as datas reais dizem. Antes da F7.0 o desbloqueio punha
 * sempre `and` — linha que nunca começou saía "em andamento" sem início real, e o verificador a
 * acusava por isso.
 */
export function statusAoDesbloquear(p: { inicioReal: Dia | null; fimReal: Dia | null }): StatusEap {
  if (p.fimReal) return "con";
  return p.inicioReal ? "and" : "nin";
}

/**
 * O "antes" da auditoria de `registrarExecucao`, já legível: o `sanitize` da auditoria percorre
 * objeto por objeto, então um `Date` viraria `{}` e um `Decimal` os dígitos internos dele. Datas em
 * `YYYY-MM-DD` e o valor do terceiro em número (mesmo jeito de `financeiro/lancamentos`).
 */
export function fotoDaExecucao(l: {
  status: StatusEap;
  progresso: number;
  inicioReal: Date | null;
  fimReal: Date | null;
  /** `Decimal` do Prisma (ou número). */
  custoRealTerceiro: { toString(): string } | number | null;
}) {
  const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    status: l.status,
    progresso: l.progresso,
    inicioReal: dia(l.inicioReal),
    fimReal: dia(l.fimReal),
    custoRealTerceiro: l.custoRealTerceiro != null ? Number(l.custoRealTerceiro.toString()) : null,
  };
}
