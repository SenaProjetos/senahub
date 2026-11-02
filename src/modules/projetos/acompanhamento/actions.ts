"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { campo } from "@/lib/campos/zod";
import { enviarAcompanhamento } from "./service";

/**
 * Envia o e-mail de acompanhamento do projeto ao cliente (Lote 3). Mesma permissão do link público
 * (`projetos:gerir`), só para a equipe interna. O serviço revalida a lista e só registra o envio depois
 * que o servidor de e-mail aceitou.
 */
export const enviarAcompanhamentoProjeto = defineAction(
  {
    modulo: "projetos",
    recurso: "projetos",
    permissao: "gerir",
    interno: true,
    acao: "enviar-acompanhamento-projeto",
    entidade: "EmailAcompanhamento",
    schema: z.object({
      projetoId: z.string().min(1),
      destinatarios: z.array(campo.email({ obrigatorio: true, mensagemObrigatorio: "E-mail inválido." })).min(1, "Informe ao menos um destinatário.").max(20),
      revisaoIds: z.array(z.string().min(1)).min(1, "Escolha ao menos uma revisão.").max(200),
      observacao: z.string().trim().max(1000, "A observação passa de 1000 caracteres.").optional(),
      copiaParaMim: z.boolean(),
    }),
    entidadeId: (_d, i) => i.projetoId,
  },
  async (input, { user }) => {
    // O escopo de dados vale aqui, não só na tela: id de projeto fora do escopo é "não encontrado".
    if (!(await projetoVisivel(user, input.projetoId))) throw new ActionError("Projeto não encontrado.");
    return enviarAcompanhamento({
      projetoId: input.projetoId,
      usuario: { id: user.id, email: user.email, name: user.name },
      destinatarios: input.destinatarios,
      revisaoIds: input.revisaoIds,
      observacao: input.observacao,
      copiaParaMim: input.copiaParaMim,
    });
  },
);
