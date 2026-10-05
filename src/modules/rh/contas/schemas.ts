import { z } from "zod";
import { campo } from "@/lib/campos/zod";
import { TIPOS_PIX } from "./pix";

/** Tipos de conta aceitos — mesma lista que existia em `User.tipoContaBancaria`. */
export const TIPOS_CONTA = ["corrente", "poupanca", "salario", "pagamento"] as const;

const texto = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** Estrito ao criar; `legado` ao editar (o inválido já gravado passa — a action confere com `exigirCamposValidos`). */
const camposConta = (legado: boolean) => ({
  banco: texto(80),
  agencia: campo.agencia({ legado }),
  conta: campo.conta({ legado }),
  tipoConta: z.enum(TIPOS_CONTA).optional().or(z.literal("")),
  titular: texto(120),
  pixTipo: z.enum(TIPOS_PIX).optional().or(z.literal("")),
  // Validada de verdade em `normalizarConta` → `validarChavePix`, que conhece o tipo.
  pixChave: texto(140), // campo-ok: validada em normalizarConta (validarChavePix), que conhece o tipo
});

export const criarContaSchema = z.object({ userId: z.string().min(1), ...camposConta(false) });
export const editarContaSchema = z.object({ id: z.string().min(1), ...camposConta(true) });
export const contaIdSchema = z.object({ id: z.string().min(1) });
