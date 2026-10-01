/**
 * Ajustes de cenário (spec §6 e §11): o formato único — o mesmo na simulação da tela, no rascunho
 * do navegador e no cenário salvo. Puro (Zod é só validação de dado).
 *
 * Ajuste que mexe num lançamento guarda a foto `antes` (campos observados) e o `rotulo` (descrição
 * no momento da simulação): é com eles que o "aplicar ao financeiro" detecta que o real mudou e diz
 * o quê, mesmo quando o lançamento já sumiu.
 */
import { z } from "zod";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { Confianca, Observado, Prioridade, StatusLancamento } from "@/modules/financeiro/liquidez/tipos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const prioridade = z.enum(["p1", "p2", "p3", "p4"]);
const confianca = z.enum(["confirmada_cliente", "provavel", "estimada", "incerta"]);

export const observadoSchema = z.object({
  status: z.enum(["previsto", "aguardando_aprovacao", "confirmado", "cancelado", "previsao"]),
  excluido: z.boolean(),
  data,
  valor: z.number().int(),
  prioridade: prioridade.nullable(),
  confianca: confianca.nullable(),
  /** Ausente nos cenários salvos antes da F4: lê como "sem caixinha". */
  caixinhaId: z.string().nullable().default(null),
});

/** Campos comuns aos ajustes que miram um lançamento. */
const alvo = {
  eventoId: z.string().min(1),
  /** Foto do lançamento quando foi simulado. Ausente em rascunho antigo (antes da F3). */
  antes: observadoSchema.optional(),
  /** Descrição quando foi simulado — para dizer qual era, se o lançamento sumir. */
  rotulo: z.string().max(300).optional(),
};

export const movimentoSchema = z.object({
  tipo: z.enum(["receita", "despesa"]),
  natureza: z.enum(["resultado", "fora_do_resultado", "transferencia"]),
  valor: z.number().int().positive(),
  data,
  descricao: z.string().min(1).max(200),
  /** Obrigatória só para aplicar ao financeiro: o lançamento real precisa de categoria. */
  categoriaId: z.string().min(1).optional(),
  categoriaNome: z.string().max(200).optional(),
});

export const ajusteSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("REPROGRAMAR_DATA"), ...alvo, data }),
  z.object({ tipo: z.literal("ALTERAR_PRIORIDADE"), ...alvo, prioridade }),
  z.object({ tipo: z.literal("ALTERAR_CONFIANCA"), ...alvo, confianca }),
  /** `caixinhaId: null` = tirar da caixinha. `caixinhaNome` é só para descrever o ajuste. */
  z.object({
    tipo: z.literal("ALTERAR_CAIXINHA"),
    ...alvo,
    caixinhaId: z.string().min(1).nullable(),
    caixinhaNome: z.string().max(200).nullable().optional(),
  }),
  z.object({ tipo: z.literal("EXCLUIR"), ...alvo }),
  z.object({ tipo: z.literal("FORCAR_INCLUSAO"), ...alvo }),
  z.object({ tipo: z.literal("INCLUIR"), id: z.string().min(1).max(64), movimento: movimentoSchema }),
]);

export type MovimentoSimulado = z.infer<typeof movimentoSchema>;
export type AjusteSimulado = z.infer<typeof ajusteSchema>;
export type TipoAjuste = AjusteSimulado["tipo"];
export type AjusteDeLancamento = Exclude<AjusteSimulado, { tipo: "INCLUIR" }>;

/** Premissas de um cenário salvo (spec §11: só a intenção). */
export const premissasSchema = z.object({
  eixos: z.object({
    entradas: z.enum(["confirmadas", "provaveis", "estimadas", "todas"]),
    compromissos: z.enum(["todos", "p1p2", "p1"]),
  }),
  horizonteDias: z.number().int().min(7).max(180),
});
export type Premissas = z.infer<typeof premissasSchema>;

export function ehAjusteDeLancamento(a: AjusteSimulado): a is AjusteDeLancamento {
  return a.tipo !== "INCLUIR";
}

// ── Diferenças e estado (spec §11) ────────────────────────────────────────────

const ROTULO_PRIORIDADE: Record<Prioridade, string> = { p1: "P1", p2: "P2", p3: "P3", p4: "P4" };
const ROTULO_CONFIANCA: Record<Confianca, string> = {
  confirmada_cliente: "confirmada pelo cliente",
  provavel: "provável",
  estimada: "estimada",
  incerta: "incerta",
};
const ROTULO_STATUS: Record<StatusLancamento, string> = {
  previsto: "em aberto",
  aguardando_aprovacao: "aguardando aprovação",
  confirmado: "pago ou recebido",
  cancelado: "cancelado",
  previsao: "previsão do cronograma",
};

const prioridadeTexto = (p: Prioridade | null) => (p ? ROTULO_PRIORIDADE[p] : "a da categoria");
const confiancaTexto = (c: Confianca | null) => (c ? ROTULO_CONFIANCA[c] : "a padrão");

/**
 * O que mudou entre a foto e o estado de agora, em frases curtas ("o vencimento mudou de 10/10 para
 * 12/10"). Vazio = nada mudou. Excluído e realizado vêm primeiro: o resto não importa mais.
 */
export function diferencasObservadas(antes: Observado, atual: Observado): string[] {
  if (atual.excluido && !antes.excluido) return ["foi excluído"];
  if (atual.status !== antes.status) {
    if (atual.status === "confirmado") return ["já foi pago ou recebido"];
    if (atual.status === "cancelado") return ["foi cancelado"];
  }
  const d: string[] = [];
  if (atual.status !== antes.status) d.push(`a situação mudou de ${ROTULO_STATUS[antes.status]} para ${ROTULO_STATUS[atual.status]}`);
  if (atual.data !== antes.data) d.push(`o vencimento mudou de ${diaMes(antes.data)} para ${diaMes(atual.data)}`);
  if (atual.valor !== antes.valor) d.push(`o valor mudou de ${formatarCentavos(antes.valor)} para ${formatarCentavos(atual.valor)}`);
  if (atual.prioridade !== antes.prioridade)
    d.push(`a prioridade mudou de ${prioridadeTexto(antes.prioridade)} para ${prioridadeTexto(atual.prioridade)}`);
  if (atual.confianca !== antes.confianca)
    d.push(`a confiança mudou de ${confiancaTexto(antes.confianca)} para ${confiancaTexto(atual.confianca)}`);
  if ((atual.caixinhaId ?? null) !== (antes.caixinhaId ?? null)) d.push("a caixinha mudou");
  return d;
}

export type EstadoAjuste =
  | { estado: "valido"; motivo: null }
  | { estado: "obsoleto"; motivo: string }
  | { estado: "inexistente"; motivo: string }
  | { estado: "aplicado"; motivo: string };

/**
 * Estado de um ajuste ao abrir um cenário (spec §11). `atual` = foto de agora do lançamento alvo
 * (`null` = não existe mais). Ajuste obsoleto continua simulado — a intenção vale —, só não é
 * aplicável até alguém atualizar o "antes".
 */
export function estadoDoAjuste(a: AjusteSimulado, atual: Observado | null | undefined, aplicadoEm?: string | null): EstadoAjuste {
  if (aplicadoEm) return { estado: "aplicado", motivo: `aplicado em ${diaMes(aplicadoEm.slice(0, 10))}` };
  if (!ehAjusteDeLancamento(a)) return { estado: "valido", motivo: null };
  if (!atual) return { estado: "inexistente", motivo: "o lançamento não existe mais" };
  if (!a.antes) return { estado: "valido", motivo: null };
  const d = diferencasObservadas(a.antes, atual);
  return d.length ? { estado: "obsoleto", motivo: d.join("; ") } : { estado: "valido", motivo: null };
}

/** "Atualizar ajustes": regrava o `antes` com a foto de agora (a pessoa reviu e aceita o real). */
export function atualizarAntes(a: AjusteSimulado, atual: Observado | null | undefined): AjusteSimulado {
  if (!ehAjusteDeLancamento(a) || !atual) return a;
  return { ...a, antes: { ...atual } };
}

// ── Linha do banco (spec §6: alvo, antes, depois) ────────────────────────────

export type LinhaAjuste = {
  tipo: TipoAjuste;
  lancamentoId: string | null;
  alvo: { lancamento: string; rotulo?: string } | { simulado: string };
  antes: Observado | null;
  depois: Record<string, unknown>;
};

export function paraLinha(a: AjusteSimulado): LinhaAjuste {
  if (a.tipo === "INCLUIR") {
    return { tipo: a.tipo, lancamentoId: null, alvo: { simulado: a.id }, antes: null, depois: { movimento: a.movimento } };
  }
  const depois =
    a.tipo === "REPROGRAMAR_DATA"
      ? { data: a.data }
      : a.tipo === "ALTERAR_PRIORIDADE"
        ? { prioridade: a.prioridade }
        : a.tipo === "ALTERAR_CONFIANCA"
          ? { confianca: a.confianca }
          : a.tipo === "ALTERAR_CAIXINHA"
            ? { caixinhaId: a.caixinhaId, caixinhaNome: a.caixinhaNome ?? null }
            : a.tipo === "EXCLUIR"
              ? { efeito: "nenhum" }
              : {};
  return {
    tipo: a.tipo,
    lancamentoId: a.eventoId,
    alvo: a.rotulo ? { lancamento: a.eventoId, rotulo: a.rotulo } : { lancamento: a.eventoId },
    antes: a.antes ?? null,
    depois,
  };
}

/** Linha do banco → ajuste. Linha que não valida (versão antiga, editada à mão) vira `null`. */
export function daLinha(l: { tipo: string; alvo: unknown; antes: unknown; depois: unknown }): AjusteSimulado | null {
  const alvo = (l.alvo ?? {}) as Record<string, unknown>;
  const depois = (l.depois ?? {}) as Record<string, unknown>;
  const bruto =
    l.tipo === "INCLUIR"
      ? { tipo: l.tipo, id: alvo.simulado, movimento: depois.movimento }
      : { tipo: l.tipo, eventoId: alvo.lancamento, rotulo: alvo.rotulo, antes: l.antes ?? undefined, ...depois };
  const r = ajusteSchema.safeParse(bruto);
  return r.success ? r.data : null;
}
