"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

// ── salvarDadosPNCP ───────────────────────────────────────────
export const salvarDadosPNCP = defineAction(
  {
    ...base,
    acao: "salvar-dados-pncp",
    entidade: "Licitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      numeroControlePNCP: z.string().optional().or(z.literal("")),
      pncpUrl: z.string().optional().or(z.literal("")),
      origemPNCP: z.boolean().optional(),
    }),
  },
  async (i) => {
    await prisma.licitacao.update({
      where: { id: i.licitacaoId },
      data: {
        numeroControlePNCP: i.numeroControlePNCP || null,
        pncpUrl: i.pncpUrl || null,
        origemPNCP: i.origemPNCP ?? false,
      },
    });
    rev();
    return { ok: true };
  },
);

// ── marcarPublicadoPNCP ───────────────────────────────────────
export const marcarPublicadoPNCP = defineAction(
  {
    ...base,
    acao: "marcar-publicado-pncp",
    entidade: "Licitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      publicado: z.boolean(),
    }),
  },
  async (i, { user }) => {
    const when = i.publicado ? new Date() : null;
    await prisma.$transaction(async (tx) => {
      const lic = await tx.licitacao.update({
        where: { id: i.licitacaoId },
        data: { publicadoPNCPEm: when },
        select: { numeroControlePNCP: true },
      });
      await tx.integracaoPNCPLog.create({
        data: {
          direcao: "publicacao",
          licitacaoId: i.licitacaoId,
          referencia: lic.numeroControlePNCP,
          status: "ok",
          mensagem: i.publicado
            ? "Marcado como publicado no PNCP (manual)."
            : "Publicação PNCP desmarcada.",
        },
      });
      await registrarHistorico(
        tx,
        i.licitacaoId,
        i.publicado ? "Publicado no PNCP." : "Publicação no PNCP desmarcada.",
        user.id,
      );
    });
    rev();
    return { ok: true };
  },
);

// TODO: integração API PNCP (modo "api") — endpoints a confirmar na documentação oficial vigente
