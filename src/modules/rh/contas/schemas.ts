import { z } from "zod";
import { TIPOS_PIX } from "./pix";

/** Tipos de conta aceitos — mesma lista que existia em `User.tipoContaBancaria`. */
export const TIPOS_CONTA = ["corrente", "poupanca", "salario", "pagamento"] as const;

const texto = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const camposConta = {
  banco: texto(80),
  agencia: texto(20),
  conta: texto(30),
  tipoConta: z.enum(TIPOS_CONTA).optional().or(z.literal("")),
  titular: texto(120),
  pixTipo: z.enum(TIPOS_PIX).optional().or(z.literal("")),
  // Validada de verdade em `normalizarConta` → `validarChavePix`, que conhece o tipo.
  pixChave: texto(140),
};

export const criarContaSchema = z.object({ userId: z.string().min(1), ...camposConta });
export const editarContaSchema = z.object({ id: z.string().min(1), ...camposConta });
export const contaIdSchema = z.object({ id: z.string().min(1) });
