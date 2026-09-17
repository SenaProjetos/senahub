"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction } from "@/lib/with-action";
import { ActionError } from "@/lib/action-error";
import { catalogosPrancha, mapaCanonico } from "@/modules/projetos/pranchas/queries";
import { registrarEventoUploads } from "@/modules/uploads/historico/service";

/**
 * Marca como validados os arquivos (PDF + planilha) da Lista Mestre recém-gerada.
 *
 * A Lista Mestre é derivada: ela só lista documentos que JÁ passaram pela validação humana, e o
 * arquivo em si é um render do servidor — não há prancha nova para alguém conferir. Sem isto ela
 * ficava com o selo "não validado" e, pior, `validado: true` é o filtro do link público
 * (`projetos/arquivos/link-publico.ts`): a lista nunca chegava ao cliente que ela existe para servir.
 *
 * Por que uma ação própria, e não `validarArquivo`:
 *  - aquela recusa disciplina em `aprovado`, e disciplina aprovada é justamente quando se gera a
 *    lista final. Validar aqui não reabre nada financeiro — pagamento sai só de `finalizarEntrega`;
 *  - aquela exige o gate de apontamentos, que não faz sentido em arquivo gerado.
 *
 * O que NÃO se afrouxa: a permissão continua `uploads:validar`. Gerar a lista é gated em
 * `projetos:ver`; se isso bastasse para validar, qualquer pessoa que enxerga o projeto criaria um
 * arquivo validado — o mesmo que publicá-lo para o cliente.
 */
export const validarListaMestreGerada = defineAction(
  {
    modulo: "uploads",
    recurso: "uploads",
    permissao: "validar",
    acao: "validar-lista-mestre",
    entidade: "Upload",
    schema: z.object({ revisaoId: z.string() }),
  },
  async (input, { user }) => {
    // A revisão é a âncora: os arquivos validados são os DESTE envio, não uma lista de ids que o
    // navegador escolheu. O tipo do documento é redescoberto aqui (mesmo caminho de `service.ts`)
    // — sem essa conferência a ação validaria qualquer arquivo de quem soubesse uma revisaoId.
    const revisao = await prisma.documentoRevisao.findUnique({
      where: { id: input.revisaoId },
      select: {
        documento: {
          select: { id: true, tipoId: true, chave: true, disciplina: { select: { projetoId: true } } },
        },
        uploads: { where: { excluidoEm: null }, select: { id: true } },
      },
    });
    if (!revisao?.documento) throw new ActionError("Revisão não encontrada.");

    const catalogos = await catalogosPrancha(revisao.documento.disciplina.projetoId);
    const canonico = mapaCanonico(catalogos.tipo);
    const siglaTipo = canonico.get("LMS") ?? canonico.get("LME");
    const tipo = siglaTipo ? catalogos.tipo.find((t) => t.sigla.toUpperCase() === siglaTipo) : undefined;
    if (!tipo) throw new ActionError("Tipo Lista Mestre não cadastrado.");

    // Pacote A (`chave` começa em "A/"): a Lista Mestre mora em Pranchas, nunca no backup.
    if (revisao.documento.tipoId !== tipo.id || !revisao.documento.chave.startsWith("A/")) {
      throw new ActionError("Esta ação só valida os arquivos da Lista Mestre.");
    }

    const ids = revisao.uploads.map((u) => u.id);
    if (ids.length === 0) throw new ActionError("Revisão sem arquivos.");

    await prisma.upload.updateMany({
      where: { id: { in: ids } },
      data: { validado: true, validadoPorId: user.id, validadoEm: new Date() },
    });
    await registrarEventoUploads({ uploadIds: ids, tipo: "validacao", userId: user.id });

    const { projetoId } = revisao.documento.disciplina;
    revalidatePath(`/projetos/${projetoId}`);
    revalidatePath(`/projetos/${projetoId}/arquivos`);
    return { uploadIds: ids };
  },
);
