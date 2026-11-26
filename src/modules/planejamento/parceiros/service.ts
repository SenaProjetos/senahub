import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import {
  MOTIVO_NOME_REPETIDO,
  motivoDoNomeParceiro,
  motivoParaNaoExcluirParceiro,
  normalizarNomeParceiro,
} from "./regras";

/**
 * Escritas do cadastro de parceiros externos (pool de recursos, parte 6). Nome único sem diferença de maiúscula: o banco
 * garante (`parceiro_externo_nome_unico`), e dois cadastros ao mesmo tempo terminam em P2002 → a mesma frase.
 */

const codigo = (e: unknown) => (e as { code?: unknown } | null)?.code;

function exigirNome(nome: string): string {
  const motivo = motivoDoNomeParceiro(nome);
  if (motivo) throw new ActionError(motivo, { nome: motivo });
  return normalizarNomeParceiro(nome);
}

async function exigirDisciplina(disciplinaId: string | null): Promise<void> {
  if (!disciplinaId) return;
  const d = await prisma.disciplinaCatalogo.findUnique({ where: { id: disciplinaId }, select: { id: true } });
  if (!d) throw new ActionError("Disciplina não encontrada.");
}

async function comNomeUnico<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (codigo(e) === "P2002") throw new ActionError(MOTIVO_NOME_REPETIDO, { nome: MOTIVO_NOME_REPETIDO });
    throw e;
  }
}

export async function criarParceiro(i: { nome: string; disciplinaId: string | null }) {
  const nome = exigirNome(i.nome);
  await exigirDisciplina(i.disciplinaId);
  return comNomeUnico(() => prisma.parceiroExterno.create({ data: { nome, disciplinaId: i.disciplinaId }, select: { id: true } }));
}

export async function editarParceiro(i: { id: string; nome: string; disciplinaId: string | null }) {
  const nome = exigirNome(i.nome);
  await exigirDisciplina(i.disciplinaId);
  const r = await comNomeUnico(() => prisma.parceiroExterno.updateMany({ where: { id: i.id }, data: { nome, disciplinaId: i.disciplinaId } }));
  if (r.count !== 1) throw new ActionError("Parceiro não encontrado.");
  return { id: i.id };
}

/** Arquivar tira o parceiro das escolhas da EAP; as tarefas que já o têm seguem com o nome. */
export async function definirParceiroAtivo(i: { id: string; ativo: boolean }) {
  const r = await prisma.parceiroExterno.updateMany({ where: { id: i.id }, data: { ativo: i.ativo } });
  if (r.count !== 1) throw new ActionError("Parceiro não encontrado.");
  return { id: i.id };
}

/** Excluir só sem uso. A FK `Restrict` segura a corrida (alguém escolheu o parceiro entre a contagem e o delete). */
export async function excluirParceiro(i: { id: string }) {
  const tarefas = await prisma.eapAtribuicao.count({ where: { parceiroId: i.id } });
  const motivo = motivoParaNaoExcluirParceiro(tarefas);
  if (motivo) throw new ActionError(motivo);
  try {
    const r = await prisma.parceiroExterno.deleteMany({ where: { id: i.id } });
    if (r.count !== 1) throw new ActionError("Parceiro não encontrado.");
  } catch (e) {
    if (codigo(e) === "P2003") throw new ActionError(motivoParaNaoExcluirParceiro(1)!);
    throw e;
  }
  return { id: i.id };
}
