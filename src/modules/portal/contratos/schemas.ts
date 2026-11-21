import { z } from "zod";

/** Pedido de assinatura de contrato pelo portal (spec 2026-11-21-portal-assinatura-contrato-design.md). */

export const pedirAssinaturaPortalSchema = z.object({
  documentoId: z.string().min(1),
  versaoId: z.string().min(1),
});

export const cancelarAssinaturaPortalSchema = z.object({
  pedidoId: z.string().min(1),
});

export const assinarContratoNoPortalSchema = z.object({
  pedidoId: z.string().min(1),
  concordo: z.literal(true, { message: "Marque que leu e concorda com o documento." }),
});
