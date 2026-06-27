"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { TERMOS, tipoTermoPorRole } from "./termos";
import { aceitarTermoSchema } from "./schemas";

/**
 * Registra o aceite do Termo de Uso pelo usuário atual. Self-service (sem permissão
 * fina): só exige sessão. Grava versão, IP, user-agent e hash SHA-256 do conteúdo
 * exibido como prova. Idempotente por (usuário, tipo, versão) via upsert.
 */
export const aceitarTermo = defineAction(
  { modulo: "legal", acao: "aceitar-termo", entidade: "AceiteTermo", schema: aceitarTermoSchema },
  async (input, ctx) => {
    const tipo = tipoTermoPorRole(ctx.user.role);
    if (input.tipo !== tipo) throw new ActionError("Termo não aplicável ao seu perfil.");

    const termo = TERMOS[tipo];
    if (input.versao !== termo.versao) {
      throw new ActionError("Versão do termo desatualizada. Recarregue a página.");
    }

    const conteudoHash = createHash("sha256").update(termo.conteudo).digest("hex");
    const userAgent = (await headers()).get("user-agent");

    await prisma.aceiteTermo.upsert({
      where: { userId_tipo_versao: { userId: ctx.user.id, tipo, versao: termo.versao } },
      create: {
        userId: ctx.user.id,
        tipo,
        versao: termo.versao,
        conteudoHash,
        ip: ctx.ip,
        userAgent,
      },
      update: {},
    });

    return { ok: true };
  },
);
