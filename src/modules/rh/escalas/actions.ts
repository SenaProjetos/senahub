"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  salvarEscalaRoleSchema,
  salvarEscalaUsuarioSchema,
  removerEscalaUsuarioSchema,
  diaGradeSchema,
} from "@/modules/rh/escalas/schemas";

const base = { modulo: "rh", recurso: "ponto", permissao: "gerir_escalas" } as const;
const rev = () => revalidatePath("/rh/escalas");

function camposDia(d: z.infer<typeof diaGradeSchema>) {
  return {
    entrada: d.entrada,
    saida: d.saida,
    descansos: d.descansos as unknown as Prisma.InputJsonValue,
    horasDia: d.horasDia,
    ativo: d.ativo,
    toleranciaMin: d.toleranciaMin,
  };
}

/**
 * Papel → contratação, para a escrita dupla da coexistência (Onda E). `admin`, `supervisor`,
 * `projetista_pj`, `freelancer` e `cliente` não aparecem: nenhum deles tem grade padrão salva
 * hoje, e `pj`/`pro_labore` não têm jornada controlada.
 */
const CONTRATACAO_DO_ROLE: Partial<Record<string, "clt" | "estagio">> = {
  clt: "clt",
  administrativo: "clt",
  ti: "clt",
  estagiario: "estagio",
};

/**
 * Salva a grade padrão (7 dias) de um perfil do sistema.
 *
 * **Escreve nas DUAS tabelas** enquanto a Onda E coexiste: `EscalaRole` (legado, ainda lido pelo
 * arnês de jornada) e `EscalaContratacao` (fonte real do cálculo desde a Onda E). Sem a segunda
 * escrita, editar a grade nesta tela seria um **no-op silencioso** — a pessoa salva, a tela
 * confirma, e nenhum cálculo muda. A tela passa a editar contratação diretamente quando
 * `EscalaRole` for dropada (passo 4 de §6.4).
 *
 * **Recusa** quando a edição faria `administrativo`/`clt`/`ti` divergirem entre si: as três
 * colapsam no mesmo slot `clt`, e gravar assim escolheria uma vencedora em silêncio — jornada
 * errada é banco de horas e falta errados retroativamente (R4).
 */
export const salvarEscalaRole = defineAction(
  { ...base, acao: "salvar-escala-role", entidade: "EscalaRole", schema: salvarEscalaRoleSchema },
  async (i) => {
    const contratacao = CONTRATACAO_DO_ROLE[i.role];

    if (contratacao === "clt") {
      const irmaos = (["clt", "administrativo", "ti"] as const).filter((r) => r !== i.role);
      const outras = await prisma.escalaRole.findMany({ where: { role: { in: irmaos as never } } });
      const chave = (d: { entrada: string | null; saida: string | null; horasDia: unknown; ativo: boolean }) =>
        `${d.entrada ?? "-"}|${d.saida ?? "-"}|${Number(d.horasDia)}|${d.ativo}`;
      const porDia = new Map(i.dias.map((d) => [d.diaSemana, chave(d)]));
      const conflito = outras.find((o) => porDia.has(o.diaSemana) && porDia.get(o.diaSemana) !== chave(o));
      if (conflito) {
        throw new ActionError(
          `As grades de CLT, Administrativo e TI precisam ser iguais: as três viram a contratação "CLT" ` +
            `no cálculo de jornada. Ajuste também o perfil "${conflito.role}" (dia ${conflito.diaSemana}) ou iguale os horários.`,
        );
      }
    }

    await prisma.$transaction([
      ...i.dias.map((d) =>
        prisma.escalaRole.upsert({
          where: { role_diaSemana: { role: i.role, diaSemana: d.diaSemana } },
          create: { role: i.role, diaSemana: d.diaSemana, ...camposDia(d) },
          update: camposDia(d),
        }),
      ),
      ...(contratacao
        ? i.dias.map((d) =>
            prisma.escalaContratacao.upsert({
              where: { contratacao_diaSemana: { contratacao, diaSemana: d.diaSemana } },
              create: { contratacao, diaSemana: d.diaSemana, ...camposDia(d) },
              update: camposDia(d),
            }),
          )
        : []),
    ]);
    rev();
    return { ok: true };
  },
);

/** Salva/ativa a grade personalizada (7 dias) de um usuário — passa a substituir a do perfil. */
export const salvarEscalaUsuario = defineAction(
  { ...base, acao: "salvar-escala-usuario", entidade: "EscalaUsuario", schema: salvarEscalaUsuarioSchema },
  async (i) => {
    await prisma.$transaction(
      i.dias.map((d) =>
        prisma.escalaUsuario.upsert({
          where: { userId_diaSemana: { userId: i.userId, diaSemana: d.diaSemana } },
          create: { userId: i.userId, diaSemana: d.diaSemana, ...camposDia(d) },
          update: camposDia(d),
        }),
      ),
    );
    rev();
    return { ok: true };
  },
);

/** Remove a escala personalizada — o usuário volta a seguir a escala do perfil. */
export const removerEscalaUsuario = defineAction(
  { ...base, acao: "remover-escala-usuario", entidade: "EscalaUsuario", schema: removerEscalaUsuarioSchema },
  async (i) => {
    await prisma.escalaUsuario.deleteMany({ where: { userId: i.userId } });
    rev();
    return { ok: true };
  },
);
