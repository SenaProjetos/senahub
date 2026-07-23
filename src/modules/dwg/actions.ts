"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enfileirarConversaoDwg, enfileirarConversaoDwgDocumento } from "@/modules/dwg/service";
import { parseDesenhoId } from "@/modules/dwg/desenho-ref";
import { resolverAcessoDesenho } from "@/modules/dwg/acesso";
import { converterDwgSchema } from "@/modules/dwg/schemas";

export type StatusConversaoDwgProbe = { status: string; progresso: number | null; erro: string | null } | null;

/**
 * Leitura sob demanda do status de conversão (fila/processando/concluído/erro) —
 * mesmo padrão de `buscarVersoesConvertidas`/`buscarAgendaHoje`: função simples,
 * sem `defineAction` (não é mutação, não deve gerar linha de AuditLog a cada
 * polling de 2.5s). Usado pelo botão "Visualizar" enquanto a conversão está em
 * andamento. `null` se não autenticado, sem permissão, ou desenho inexistente.
 */
export async function buscarStatusConversaoDwg(desenhoId: string): Promise<StatusConversaoDwgProbe> {
  const session = await getSession();
  if (!session) return null;
  const dados = await resolverAcessoDesenho(session.user, desenhoId);
  if (!dados || !dados.autorizado) return null;
  return { status: dados.status, progresso: dados.progresso, erro: dados.erro };
}

const MOTIVO_LABEL: Record<string, string> = {
  nao_dwg: "O arquivo não é um DWG.",
  origem_inexistente: "Arquivo não encontrado.",
  tentativas_esgotadas: "Conversão falhou várias vezes — verifique o arquivo DWG.",
};

/**
 * (Re)converte um desenho DWG para DXF. Usado pro backfill de DWGs antigos
 * (pré-feature) e pra re-tentar conversões com erro. Força o reprocessamento
 * (zera o contador de tentativas). O trabalho pesado roda em job pg-boss.
 *
 * Gate em `arquivos:baixar` (não um recurso `dwg` próprio) — quem já pode ver/baixar
 * o arquivo pode pedir a conversão; não é uma ação de gestão do arquivo em si.
 */
export const converterDwg = defineAction(
  {
    modulo: "dwg",
    recurso: "arquivos",
    permissao: "baixar",
    acao: "converter-dwg",
    entidade: "ConversaoDesenho",
    schema: converterDwgSchema,
    entidadeId: (_d, i) => i.desenhoId,
  },
  async (input) => {
    const ref = parseDesenhoId(input.desenhoId);
    let projetoId: string | null;
    let r: Awaited<ReturnType<typeof enfileirarConversaoDwg>>;
    if (ref.tipo === "documento") {
      const versao = await prisma.documentoVersao.findUnique({
        where: { id: ref.id },
        select: { documento: { select: { projetoId: true, proposta: { select: { projetoId: true } } } } },
      });
      if (!versao) throw new ActionError("Arquivo não encontrado.");
      projetoId = versao.documento.projetoId ?? versao.documento.proposta?.projetoId ?? null;
      r = await enfileirarConversaoDwgDocumento(ref.id, { forcar: true });
    } else {
      const upload = await prisma.upload.findUnique({
        where: { id: ref.id },
        select: { disciplina: { select: { projetoId: true } } },
      });
      if (!upload) throw new ActionError("Arquivo não encontrado.");
      projetoId = upload.disciplina.projetoId;
      r = await enfileirarConversaoDwg(ref.id, { forcar: true });
    }

    if (!r.enfileirado && r.motivo !== "sem_worker" && r.motivo !== "em_andamento") {
      throw new ActionError(MOTIVO_LABEL[r.motivo] ?? "Não foi possível enfileirar a conversão.");
    }

    if (projetoId) revalidatePath(`/projetos/${projetoId}/arquivos`);
    // `sem_worker`: a linha ficou em `fila` mas não há dev:server/prod rodando os jobs.
    return { enfileirado: r.enfileirado, semWorker: !r.enfileirado && r.motivo === "sem_worker" };
  },
);
