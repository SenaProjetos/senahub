"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { brl } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { refletirSincroniaCanais } from "@/lib/socket";
import { fichasLinkaveis, previaVinculo, projetosLinkaveis } from "./queries";
import { desvincularProjetoDaFicha, vincularProjetoNaFicha } from "./service";
import { candidatosSchema, desfazerSchema, linkarSchema, previaSchema } from "./schemas";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;

/** Linkar mexe num projeto: além de `comercial:gerir` (do `base`), exige `projetos:gerir`. */
async function exigirProjetosGerir(user: SessionUser) {
  if (!(await can(user, "projetos", "gerir"))) throw new ActionError("Sem permissão para alterar projetos.");
}

function revalidar(projetoId: string) {
  revalidatePath("/comercial/funil");
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

export const candidatosParaVinculo = defineAction(
  { ...base, acao: "candidatos-vinculo", entidade: "Projeto", schema: candidatosSchema, audit: false },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    if (i.modo === "ficha") {
      const projetos = await projetosLinkaveis(ctx.user, i.id);
      return projetos.map((p) => ({ id: p.id, rotulo: `${p.codigo} · ${p.nome}`, detalhe: null as string | null }));
    }
    const fichas = await fichasLinkaveis(ctx.user, i.id);
    return fichas.map((f) => ({
      id: f.id,
      rotulo: f.titulo,
      detalhe: f.valorNegociado != null ? brl(f.valorNegociado) : (null as string | null),
    }));
  },
);

export const previaDoVinculo = defineAction(
  { ...base, acao: "previa-vinculo", entidade: "Projeto", schema: previaSchema, audit: false },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    return previaVinculo(ctx.user, i.projetoId, i.negociacaoId);
  },
);

export const linkarProjeto = defineAction(
  {
    ...base,
    acao: "linkar-projeto-ficha",
    entidade: "Projeto",
    schema: linkarSchema,
    entidadeId: (_d, i) => i.projetoId,
  },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    const r = await vincularProjetoNaFicha(ctx.user, i);
    // Novo coordenador entra no chat do projeto (mesma sincronia das outras mudanças de equipe).
    if (r.coordenadorCriado) refletirSincroniaCanais(await ensureCanaisProjeto(i.projetoId));
    revalidar(i.projetoId);
    return r;
  },
);

export const desfazerLinkProjeto = defineAction(
  {
    ...base,
    acao: "desfazer-link-projeto-ficha",
    entidade: "Projeto",
    schema: desfazerSchema,
    entidadeId: (_d, i) => i.projetoId,
  },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    const r = await desvincularProjetoDaFicha(ctx.user, i.projetoId);
    revalidar(i.projetoId);
    return r;
  },
);
