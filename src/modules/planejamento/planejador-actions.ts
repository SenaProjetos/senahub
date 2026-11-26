"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { paraDia } from "./agenda";
import { aposMudarEap } from "./pos-eap";
import { lerDataDigitada } from "./datas-linha";
import { comPassoDaAction, projetoDaLinha, rotuloDaLinha } from "./desfazer/passo";
import { avisarCoordenacaoDaMudanca, moverLinhaNoPlanejador, trocarPessoaNoPlanejador } from "./planejador-service";

/**
 * Arrastar na tela por pessoa (pool de recursos, parte 4). Mesma permissão e mesmo escopo da EAP (`planejamento:gerir` +
 * projeto que a pessoa enxerga, via `comPassoDaAction`), um passo de desfazer, auditoria pelo `defineAction`. Regras em
 * `planejador-acoes.ts`; escritas em `planejador-service.ts`.
 */

const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir" } as const;
/** A mesma validação do início digitado na EAP: 31/02 não vira 03/03. */
const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((v) => lerDataDigitada(v, "2000-01-01").ok, "Data inválida.");

const revisar = (projetoId: string) => {
  revalidatePath(`/planejamento/${projetoId}`);
  revalidatePath("/planejamento");
  revalidatePath("/recursos/por-pessoa");
  revalidatePath("/recursos");
};

/** Barra arrastada no tempo: novo início planejado (o alfinete), as seguintes com data fixada andam se pedido. */
export const moverBarraNoPlanejador = defineAction(
  {
    ...plan,
    acao: "mover-barra-planejador",
    entidade: "EapTarefa",
    schema: z.object({ id: z.string().min(1), inicio: dia, moverSeguintes: z.boolean().default(false) }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (i) => {
      const t = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { inicioPrevisto: true, restricaoTipo: true, restricaoData: true } });
      return t
        ? { inicio: paraDia(t.inicioPrevisto), restricaoTipo: t.restricaoTipo, restricaoData: t.restricaoData ? paraDia(t.restricaoData) : null }
        : null;
    },
  },
  comPassoDaAction({ projetoDe: (i) => projetoDaLinha(i.id), rotulo: rotuloDaLinha("Mover") }, async (i, { user }) => {
    // Rascunho ou revisão aberta (decisão 1): o serviço confere a trava na transação da gravação.
    const r = await moverLinhaNoPlanejador({ id: i.id, inicio: i.inicio, moverSeguintes: i.moverSeguintes });
    await aposMudarEap(r.projetoId, user.id);
    const t = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { inicioPrevisto: true } });
    const inicio = t ? paraDia(t.inicioPrevisto) : i.inicio;
    await avisarCoordenacaoDaMudanca({ projetoId: r.projetoId, autorId: user.id, mudanca: { tipo: "data", tarefa: r.nome, inicio } });
    revisar(r.projetoId);
    // O motor pode não começar no dia pedido (predecessora, dia não útil): a tela diz o dia de fato.
    return { inicio, pedido: i.inicio, movidas: r.movidas };
  }),
);

/** Barra arrastada para a faixa de outra pessoa (troca) ou tarefa sem ninguém arrastada para uma pessoa (atribui). */
export const trocarPessoaNoPlanejadorAction = defineAction(
  {
    ...plan,
    acao: "trocar-pessoa-planejador",
    entidade: "EapTarefa",
    schema: z.object({ tarefaId: z.string().min(1), de: z.string().min(1).nullable(), para: z.string().min(1) }),
    entidadeId: (_d, i) => i.tarefaId,
    capturarAntes: async (i) => ({
      atribuicoes: await prisma.eapAtribuicao.findMany({
        where: { tarefaId: i.tarefaId },
        select: { userId: true, papel: true, horasPrevistas: true, horasAutomaticas: true },
      }),
    }),
  },
  comPassoDaAction(
    { projetoDe: (i) => projetoDaLinha(i.tarefaId), rotulo: () => "Trocar a pessoa da tarefa" },
    async (i, { user }) => {
      const r = await trocarPessoaNoPlanejador({ tarefaId: i.tarefaId, de: i.de, para: i.para, autorId: user.id });
      await aposMudarEap(r.projetoId, user.id);
      await avisarCoordenacaoDaMudanca({ projetoId: r.projetoId, autorId: user.id, mudanca: { tipo: "pessoa", tarefa: r.nome, de: i.de, para: i.para } });
      revisar(r.projetoId);
      return { ok: true };
    },
  ),
);
