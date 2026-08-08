"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { registrarAlteracaoContratual } from "./service";
import { MOTIVOS_CONTRATUAIS } from "./motivos";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/**
 * Cargo, departamento e salário deixaram de ser editados no dialog de Cadastro (2.4): formam
 * UM estado contratual com vigência e motivo, não campos soltos como CEP ou RG. Este é o único
 * caminho de escrita restante para os três — ao lado de `editarCadastroFuncionario`, que agora
 * só toca identidade/endereço/contato.
 *
 * `cargoId`/`departamentoId` são sempre enviados pelo dialog (branco = limpar), mas
 * `remuneracao` só aparece no payload quando o dialog tem `rh:folha` — omitida (não `null`),
 * significa "não mexer no salário", e é assim que chega em `registrarAlteracaoContratual`.
 *
 * Mesmo gate de `salvarSalario`/`editarCadastroFuncionario` (role fixa, não a permissão fina
 * `rh:folha`/`rh:cadastro`) — consistente com o resto do módulo; diferenciar só esta action
 * criaria um gate inconsistente sem fechar a lacuna nas demais.
 */
export const registrarAlteracaoContratualAction = defineAction(
  {
    modulo: "rh",
    acao: "registrar-alteracao-contratual",
    roles: HR_ADMIN_ROLES,
    entidade: "HistoricoContratual",
    schema: z.object({
      userId: z.string().min(1),
      cargoId: opt(z.string()),
      departamentoId: opt(z.string()),
      remuneracao: z.number().min(0).nullable().optional(),
      vigenciaEm: opt(z.string()),
      motivo: z.enum(MOTIVOS_CONTRATUAIS),
      observacao: opt(z.string()),
    }),
  },
  async (i, ctx) => {
    const r = await prisma.$transaction((tx) =>
      registrarAlteracaoContratual(
        tx,
        i.userId,
        {
          cargoId: i.cargoId || null,
          departamentoId: i.departamentoId || null,
          // Ausente no payload = não mexe no salário (dialog sem rh:folha nem renderiza o campo).
          ...(i.remuneracao !== undefined ? { remuneracao: i.remuneracao } : {}),
          vigenciaEm: i.vigenciaEm ? new Date(`${i.vigenciaEm}T00:00:00Z`) : undefined,
          motivo: i.motivo,
          observacao: i.observacao || null,
        },
        ctx.user.id,
      ),
    );
    revalidatePath(`/rh/pessoas/${i.userId}`);
    revalidatePath("/rh/pessoas");
    return r;
  },
);
