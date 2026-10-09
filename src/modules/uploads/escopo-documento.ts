import "server-only";
import { ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { podeVerTodasDisciplinas, responsavelOuVeTodas } from "@/modules/arquivos/acesso";

export type DisciplinaDoDocumento = { projetoId: string; responsaveis: { userId: string }[] };

/**
 * A muralha de escrita de um documento: a mesma do Upload (projeto visível + responsável da disciplina
 * ou `ver_todas_disciplinas`), com o DocumentoDisciplina como id público. Fora de um arquivo
 * `"use server"` de propósito: lá, uma função exportada viraria Server Action chamável de fora.
 */
export async function exigirEscopoDocumento(user: SessionUser, disciplina: DisciplinaDoDocumento): Promise<void> {
  const [podeVerProjeto, projeto, veTodas] = await Promise.all([
    can(user, "projetos", "ver"),
    projetoVisivel(user, disciplina.projetoId),
    podeVerTodasDisciplinas(user),
  ]);
  if (!podeVerProjeto) throw new ActionError("Sem permissão para gerir documentos.");

  const naoEncontrado = new ActionError("Documento não encontrado.");
  if (!projeto) throw naoEncontrado;
  if (!responsavelOuVeTodas(user.id, veTodas, disciplina.responsaveis)) throw naoEncontrado;
}
