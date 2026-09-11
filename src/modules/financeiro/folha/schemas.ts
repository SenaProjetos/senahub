import { z } from "zod";
import { MSG_CONTA_OBRIGATORIA } from "./status";

/**
 * Campos comuns aos três caminhos de efetivar pagamento de produção (individual, lote,
 * selecionados). Moram aqui e não em `actions.ts`: arquivo "use server" só pode exportar
 * função — exportar um schema de lá quebra em runtime, não no `tsc`.
 */

/**
 * Conta obrigatória (decisão N3 do plano): sem conta o lançamento entra no caixa sem conta
 * bancária e não concilia no extrato. Vale daqui pra frente — não mexe no histórico.
 */
export const contaPagamento = z.string().min(1, MSG_CONTA_OBRIGATORIA);

/** Forma é opcional — string vazia = sem forma. */
export const formaPagamento = z.string().optional().or(z.literal(""));

/** `yyyy-mm-dd` de um `<input type="date">`; vazio = hoje (ver `quandoDoPagamento`). */
export const dataPagamento = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal(""));
