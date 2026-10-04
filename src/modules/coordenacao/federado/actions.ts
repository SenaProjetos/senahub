// src/modules/coordenacao/federado/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { veModelosDoProjeto } from "@/modules/coordenacao/acesso";
import { bossVivo } from "@/modules/coordenacao/service";
import { ORIGEM_MODELO_FEDERADO } from "@/modules/documentos-cliente/origens";
import { candidatosDoProjeto, criarGeracao } from "./service";
import { FILA_FEDERAR_IFC, type CandidatoFederado } from "./regras";

// "use server": só funções async podem ser exportadas daqui — `base`, `exigirProjeto` e `revalidar` ficam internos.
const base = { modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir" } as const;

async function exigirProjeto(user: Parameters<typeof veModelosDoProjeto>[0], projetoId: string | null) {
  if (!projetoId || !(await veModelosDoProjeto(user, projetoId))) {
    throw new ActionError("Você não participa deste projeto. Peça ao coordenador para incluir você como membro do projeto.");
  }
}

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/coordenacao`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
  revalidatePath("/arquivos");
}

/** Leitura do diálogo (sem auditoria): modelos com schema, unidade e o que impede cada um. */
export const listarCandidatosFederado = defineAction(
  { ...base, acao: "listar-candidatos-federado", audit: false, schema: z.object({ projetoId: z.string().min(1) }) },
  async (i, ctx) => {
    await exigirProjeto(ctx.user, i.projetoId);
    // Sem o `item` (caminho em disco): o navegador não precisa dele.
    return (await candidatosDoProjeto(i.projetoId)).map(
      (c): CandidatoFederado => ({
        modeloId: c.modeloId, nome: c.nome, grupo: c.grupo, revisao: c.revisao, tamanho: c.tamanho,
        convertido: c.convertido, arquivoExiste: c.arquivoExiste, schema: c.schema, unidade: c.unidade,
      }),
    );
  },
);

export const gerarModeloFederado = defineAction(
  {
    ...base,
    acao: "gerar-modelo-federado",
    entidade: "GeracaoModeloFederado",
    entidadeId: (d) => (d as { geracaoId?: string } | undefined)?.geracaoId,
    schema: z.object({ projetoId: z.string().min(1), modeloIds: z.array(z.string().min(1)).min(2).max(50) }),
  },
  async (i, ctx) => {
    await exigirProjeto(ctx.user, i.projetoId);
    const boss = bossVivo();
    if (!boss) throw new ActionError("A geração roda em segundo plano e o servidor de tarefas não está ativo.");
    const { geracaoId } = await criarGeracao({ projetoId: i.projetoId, modeloIds: i.modeloIds, autorId: ctx.user.id });
    try {
      await boss.send(FILA_FEDERAR_IFC, { geracaoId }, { singletonKey: i.projetoId });
    } catch (e) {
      // Sem o job a linha ficaria em `fila` e travaria o projeto por 45 min: desfaz antes de falhar.
      await prisma.geracaoModeloFederado.updateMany({
        where: { id: geracaoId, status: "fila" },
        data: { status: "erro", erro: "Não foi possível enviar a geração para a fila de tarefas.", concluidoEm: new Date() },
      });
      throw e;
    }
    revalidar(i.projetoId);
    return { geracaoId };
  },
);

export const excluirVersaoModeloFederado = defineAction(
  { ...base, acao: "excluir-versao-modelo-federado", entidade: "DocumentoVersao", entidadeId: (_d, i) => i.versaoId, schema: z.object({ versaoId: z.string().min(1) }) },
  async (i, ctx) => {
    const v = await prisma.documentoVersao.findUnique({
      where: { id: i.versaoId },
      select: { caminho: true, documento: { select: { projetoId: true, origem: true, _count: { select: { versoes: true } } } } },
    });
    if (!v || v.documento.origem !== ORIGEM_MODELO_FEDERADO) throw new ActionError("Versão não encontrada.");
    await exigirProjeto(ctx.user, v.documento.projetoId);
    if (v.documento._count.versoes <= 1) throw new ActionError("Esta é a única versão. Exclua o modelo federado inteiro.");
    await prisma.documentoVersao.delete({ where: { id: i.versaoId } });
    await removerArquivo(v.caminho);
    revalidar(v.documento.projetoId!);
    return { versaoId: i.versaoId };
  },
);

export const excluirModeloFederado = defineAction(
  { ...base, acao: "excluir-modelo-federado", entidade: "Documento", entidadeId: (_d, i) => i.documentoId, schema: z.object({ documentoId: z.string().min(1) }) },
  async (i, ctx) => {
    const doc = await prisma.documento.findUnique({
      where: { id: i.documentoId },
      select: { projetoId: true, origem: true, versoes: { select: { caminho: true } } },
    });
    if (!doc || doc.origem !== ORIGEM_MODELO_FEDERADO) throw new ActionError("Modelo federado não encontrado.");
    await exigirProjeto(ctx.user, doc.projetoId);
    await prisma.documento.delete({ where: { id: i.documentoId } });
    for (const v of doc.versoes) await removerArquivo(v.caminho);
    revalidar(doc.projetoId!);
    return { documentoId: i.documentoId };
  },
);
