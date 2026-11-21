"use server";

import { defineAction, ActionError } from "@/lib/with-action";
import { acessoDoUsuarioAoProjetoDoPortal } from "./acesso";
import { gravarRespostasBriefing } from "@/modules/inputs/briefing-service";
import { gravarRespostasExtras } from "@/modules/inputs/extras-service";
import { notificarPreenchimentoInput } from "@/modules/inputs/notificar-preenchimento";
import { responderPerguntasDoPortalSchema, salvarBriefingDoPortalSchema } from "./briefing-schemas";

/**
 * O cliente preenche o briefing pelo portal. Sem permissão de catálogo (o portal não tem perfil para isso): o serviço
 * confere conta externa com acesso ao projeto, e a regra do canal (pedido aberto, não encerrado) é conferida DENTRO
 * da transação que grava.
 */

async function exigirClienteDoProjeto(
  user: { id: string; tipo: "interno" | "externo"; mustChangePassword: boolean },
  projetoId: string,
) {
  if (user.tipo !== "externo") throw new ActionError("Só o cliente responde pelo portal.");
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  if (!acesso.ok) throw new ActionError("Projeto não encontrado.");
}

export const salvarBriefingDoPortal = defineAction(
  {
    modulo: "portal",
    acao: "briefing-salvar",
    entidade: "BriefingProjeto",
    schema: salvarBriefingDoPortalSchema,
    entidadeId: (_data, input) => input.projetoId,
  },
  async (input, { user }) => {
    await exigirClienteDoProjeto(user, input.projetoId);
    const r = await gravarRespostasBriefing(input.projetoId, input.respostas, user.name, "portal");
    if (!r.ok) throw new ActionError(r.erro, r.campos);
    // Só a TRANSIÇÃO para completo fura a janela do aviso; o resto é "mexeu".
    const concluiu = r.status === "completo" && r.statusAnterior !== "completo";
    await notificarPreenchimentoInput(input.projetoId, concluiu ? "completo" : "parcial", "portal");
    return { status: r.status, descartados: r.descartados };
  },
);

export const responderPerguntasDoPortal = defineAction(
  {
    modulo: "portal",
    acao: "briefing-responder-extras",
    entidade: "InputProjeto",
    schema: responderPerguntasDoPortalSchema,
    entidadeId: (_data, input) => input.projetoId,
  },
  async (input, { user }) => {
    await exigirClienteDoProjeto(user, input.projetoId);
    const r = await gravarRespostasExtras(input.projetoId, input.respostas, "portal");
    if (!r.ok) throw new ActionError(r.erro);
    if (r.salvas > 0) await notificarPreenchimentoInput(input.projetoId, "parcial", "portal");
    return { salvas: r.salvas, ignoradas: r.ignoradas };
  },
);
