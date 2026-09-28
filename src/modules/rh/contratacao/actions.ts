"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { aplicarVinculo } from "@/modules/usuarios/vinculo/service";
import { roleLegadoDe } from "@/modules/usuarios/vinculo/mapa";
import { validarTrocaContratacao } from "@/modules/usuarios/vinculo/troca-contratacao";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
/** `<input type="date">` → meia-noite UTC, igual a toda coluna `@db.Date`. */
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

const trocarContratacaoSchema = z.object({
  userId: z.string().min(1),
  contratacao: z.enum(["clt", "estagio", "pj", "autonomo_rpa", "pro_labore"]),
  setor: z.enum(["diretoria", "administrativo", "juridico", "engenharia", "ti"]),
  cargo: z.string().optional(),
  cargaSemanal: z.number().positive().optional(),
  remuneracao: z.number().nonnegative().optional(),
  pjId: z.string().optional(),
  dataInicio: dataIso,
});

async function estadoContratacao(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      cpf: true,
      setor: true,
      contratacao: true,
      vinculoAtivo: { select: { id: true, dataInicio: true, contratacao: true, setor: true } },
    },
  });
}

/**
 * Troca a contratação de quem já está cadastrado (efetivar estagiário como CLT, corrigir um
 * cadastro errado, etc.) — abre um vínculo NOVO via `aplicarVinculo`; o anterior é encerrado,
 * nunca apagado. Decisões do dono em docs/superpowers/specs/2026-09-22-alterar-contratacao.md:
 *
 * - Papel legado (`User.role`) acompanha automaticamente (`roleLegadoDe`) — exceto `admin`, que
 *   não tem eixo de contratação no modelo e é recusado por `validarTrocaContratacao`.
 * - Data de início pode ser retroativa (a tela avisa sobre banco de horas fechado, não bloqueia).
 * - Mesma contratação (ex.: só troca de setor) também abre vínculo novo — comportamento uniforme.
 */
export const trocarContratacao = defineAction(
  {
    modulo: "rh",
    acao: "trocar-contratacao",
    roles: HR_ADMIN_ROLES,
    entidade: "User",
    schema: trocarContratacaoSchema,
    entidadeId: (_d, i) => i.userId,
    capturarAntes: async (i) => estadoContratacao(i.userId),
  },
  async (i) => {
    const u = await estadoContratacao(i.userId);
    if (!u) throw new ActionError("Pessoa não encontrada.");

    const erro = validarTrocaContratacao({
      roleAtual: u.role,
      contratacao: i.contratacao,
      cargaSemanal: i.cargaSemanal ?? null,
      pjId: i.pjId || null,
      cpfPreenchido: !!u.cpf,
    });
    if (erro) throw new ActionError(erro);

    // `tipo: "interno"` é seguro aqui: quem chega a este fluxo já é CADASTRO_ROLES menos admin
    // (o único "externo" é `cliente`, que nunca aparece na ficha de RH — `listarPessoas` o exclui).
    const novoRole = roleLegadoDe("interno", i.contratacao);

    const vinculo = await prisma.$transaction(async (tx) => {
      const novoVinculo = await aplicarVinculo(tx, i.userId, {
        contratacao: i.contratacao,
        setor: i.setor,
        cargo: i.cargo || null,
        cargaSemanal: i.cargaSemanal ?? null,
        remuneracao: i.remuneracao ?? null,
        pjId: i.pjId || null,
        dataInicio: dia(i.dataInicio),
      });
      if (novoRole !== u.role) {
        await tx.user.update({ where: { id: i.userId }, data: { role: novoRole } });
      }
      return novoVinculo;
    });

    revalidatePath(`/rh/pessoas/${i.userId}`);
    return { vinculoId: vinculo.id, roleAlterado: novoRole !== u.role, novoRole };
  },
);
