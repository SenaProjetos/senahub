"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { reagendarProjeto } from "./agenda";
import { linhaAceitaAtribuicao, linhaAceitaHoras } from "./recursos";
import { herdarResponsaveisNoProjeto, sincronizarCards, sincronizarPrincipal } from "./recursos-service";

/**
 * Recursos na linha da EAP (F5 — D17, D18, D22, D23, D41). Mesma permissão de quem monta
 * a EAP: a atribuição é um atributo da linha, não um recurso à parte.
 *
 * Toda mudança acerta o principal e sincroniza os cards NA MESMA TRANSAÇÃO — card com
 * responsável que já saiu da linha é exatamente a divergência que a F5 existe para evitar.
 */
const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir", entidade: "EapAtribuicao" } as const;

const PAPEIS = ["dir", "ger", "coo", "eng", "pro", "mod", "rev", "apr"] as const;

const revProjeto = (projetoId: string) => {
  revalidatePath(`/planejamento/${projetoId}`);
  revalidatePath("/planejamento");
  revalidatePath("/recursos");
  revalidatePath("/tarefas");
};

/**
 * A mesma pessoa duas vezes no mesmo papel da linha — o banco recusa pelo índice único.
 * Pelo `code`, não por `instanceof`: a classe do erro pode vir de outra instância do módulo
 * (o mesmo racha tsx × webpack de `lib/socket.ts`), e aí o `instanceof` falha calado.
 */
function ehDuplicada(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "P2002";
}

async function linhaParaAtribuir(tarefaId: string) {
  const linha = await prisma.eapTarefa.findUnique({
    where: { id: tarefaId },
    select: { id: true, projetoId: true, tipoEap: true, duracaoDias: true, _count: { select: { filhas: true } } },
  });
  if (!linha) throw new ActionError("Linha do cronograma não encontrada.");
  return { ...linha, ehResumo: linha._count.filhas > 0, duracaoDias: Number(linha.duracaoDias) };
}

/**
 * Só gente da casa, ativa. Cliente fora — o mesmo corte de `exigirResponsaveisInternos` das
 * tarefas: escalado aqui, o cliente iria parar no card do projetista.
 */
async function pessoaAtiva(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { ativo: true, role: true } });
  if (!u?.ativo || u.role === "cliente") throw new ActionError("Pessoa não encontrada, inativa ou de fora da equipe.");
}

const salvarSchema = z.object({
  /** Presente = editar (inclui o "Substituir recurso": perfil → pessoa). */
  id: z.string().min(1).optional(),
  tarefaId: z.string().min(1),
  /** `null` = perfil (recurso genérico). */
  userId: z.string().min(1).nullable(),
  papel: z.enum(PAPEIS),
  horasPrevistas: z
    .number()
    .finite()
    .min(0, "As horas não podem ser negativas.")
    .max(99999, "Horas acima do limite."),
});

export const salvarAtribuicao = defineAction(
  {
    ...plan,
    acao: "salvar-atribuicao",
    schema: salvarSchema,
    capturarAntes: async (i) => (i.id ? prisma.eapAtribuicao.findUnique({ where: { id: i.id } }) : null),
  },
  async (i, { user }) => {
    const linha = await linhaParaAtribuir(i.tarefaId);
    const aceita = linhaAceitaAtribuicao(linha);
    if (!aceita.ok) throw new ActionError(aceita.motivo);
    if (i.horasPrevistas > 0 && !linhaAceitaHoras(linha)) {
      throw new ActionError("Marco não tem horas — ele não ocupa dia no cronograma.");
    }
    if (i.userId) await pessoaAtiva(i.userId);

    try {
      const id = await prisma.$transaction(async (tx) => {
        let atribuicaoId: string;
        if (i.id) {
          const atual = await tx.eapAtribuicao.findUnique({ where: { id: i.id }, select: { tarefaId: true } });
          if (!atual || atual.tarefaId !== i.tarefaId) throw new ActionError("Atribuição não encontrada nesta linha.");
          // Virou perfil: deixa de poder ser principal (o banco recusaria).
          await tx.eapAtribuicao.update({
            where: { id: i.id },
            data: {
              userId: i.userId,
              papel: i.papel,
              horasPrevistas: i.horasPrevistas,
              ...(i.userId == null ? { principal: false } : {}),
            },
          });
          atribuicaoId = i.id;
        } else {
          const nova = await tx.eapAtribuicao.create({
            data: { tarefaId: i.tarefaId, userId: i.userId, papel: i.papel, horasPrevistas: i.horasPrevistas },
            select: { id: true },
          });
          atribuicaoId = nova.id;
        }
        await sincronizarPrincipal(tx, i.tarefaId);
        await sincronizarCards(tx, linha.projetoId, user.id);
        return atribuicaoId;
      });
      revProjeto(linha.projetoId);
      return { id };
    } catch (e) {
      if (ehDuplicada(e)) throw new ActionError("Esta pessoa já está nesta linha com esse papel.");
      throw e;
    }
  },
);

export const removerAtribuicao = defineAction(
  {
    ...plan,
    acao: "remover-atribuicao",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.eapAtribuicao.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const atual = await prisma.eapAtribuicao.findUnique({
      where: { id: i.id },
      select: { tarefaId: true, tarefa: { select: { projetoId: true } } },
    });
    if (!atual) throw new ActionError("Atribuição não encontrada.");
    await prisma.$transaction(async (tx) => {
      await tx.eapAtribuicao.delete({ where: { id: i.id } });
      await sincronizarPrincipal(tx, atual.tarefaId);
      await sincronizarCards(tx, atual.tarefa.projetoId, user.id);
    });
    revProjeto(atual.tarefa.projetoId);
    return { id: i.id };
  },
);

/** Troca quem é o principal da linha (D41) — o que aparece no card e nos filtros. */
export const definirPrincipal = defineAction(
  { ...plan, acao: "definir-principal", schema: z.object({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const atual = await prisma.eapAtribuicao.findUnique({
      where: { id: i.id },
      select: { tarefaId: true, userId: true, tarefa: { select: { projetoId: true } } },
    });
    if (!atual) throw new ActionError("Atribuição não encontrada.");
    if (!atual.userId) throw new ActionError("Perfil não pode ser o principal — escale uma pessoa primeiro.");
    await prisma.$transaction(async (tx) => {
      // Desmarca antes de marcar: o índice único parcial não admite dois nem por um instante.
      await tx.eapAtribuicao.updateMany({
        where: { tarefaId: atual.tarefaId, principal: true, id: { not: i.id } },
        data: { principal: false },
      });
      await tx.eapAtribuicao.update({ where: { id: i.id }, data: { principal: true } });
      await sincronizarCards(tx, atual.tarefa.projetoId, user.id);
    });
    revProjeto(atual.tarefa.projetoId);
    return { id: i.id };
  },
);

/**
 * "Preencher linhas sem ninguém com o responsável da disciplina" — o mesmo da criação da
 * linha (D22), sob demanda, para o projeto inteiro. Linha com qualquer atribuição fica
 * como está.
 */
export const herdarResponsaveisDaDisciplina = defineAction(
  { ...plan, acao: "herdar-responsaveis", entidade: "EapTarefa", schema: z.object({ projetoId: z.string().min(1) }) },
  async (i, { user }) => {
    const criadas = await prisma.$transaction(async (tx) => {
      const n = await herdarResponsaveisNoProjeto(tx, i.projetoId);
      if (n > 0) await sincronizarCards(tx, i.projetoId, user.id);
      return n;
    });
    revProjeto(i.projetoId);
    return { criadas };
  },
);

const sugestaoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("atrasar"),
    linhaId: z.string().min(1),
    novoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  }),
  z.object({
    tipo: z.literal("passar"),
    atribuicaoId: z.string().min(1),
    deUserId: z.string().min(1),
    paraUserId: z.string().min(1),
  }),
]);

/**
 * Aplica, com um clique, a sugestão de sobrecarga (D18). O sistema sugere; é aqui que
 * alguém decide.
 *
 * Confere que o mundo ainda é o que a sugestão supôs — a tela pode estar aberta há uma
 * hora. Se a atribuição já mudou de dono, ou a linha ganhou outra restrição, recusa em vez
 * de aplicar por cima.
 */
export const aplicarSugestaoRecurso = defineAction(
  { ...plan, acao: "aplicar-sugestao-recurso", schema: sugestaoSchema },
  async (i, { user }) => {
    if (i.tipo === "atrasar") {
      const linha = await prisma.eapTarefa.findUnique({
        where: { id: i.linhaId },
        select: { projetoId: true, restricaoTipo: true },
      });
      if (!linha) throw new ActionError("Linha do cronograma não encontrada.");
      if (linha.restricaoTipo && linha.restricaoTipo !== "iniciar_nao_antes_de") {
        throw new ActionError("A linha ganhou outra restrição de data depois da sugestão. Revise antes de mexer.");
      }
      // O mesmo que arrastar a barra (D34): "não iniciar antes de", com o alfinete à vista.
      await prisma.eapTarefa.update({
        where: { id: i.linhaId },
        data: { restricaoTipo: "iniciar_nao_antes_de", restricaoData: new Date(`${i.novoInicio}T00:00:00.000Z`) },
      });
      const r = await reagendarProjeto(linha.projetoId, user.id);
      await sincronizarCards(prisma, linha.projetoId, user.id);
      revProjeto(linha.projetoId);
      return { tipo: "atrasar" as const, fimProjeto: r.fimProjeto };
    }

    const atrib = await prisma.eapAtribuicao.findUnique({
      where: { id: i.atribuicaoId },
      select: { userId: true, tarefaId: true, tarefa: { select: { projetoId: true } } },
    });
    if (!atrib) throw new ActionError("Atribuição não encontrada.");
    if (atrib.userId !== i.deUserId) {
      throw new ActionError("Essa atividade já mudou de responsável depois da sugestão. Revise antes de mexer.");
    }
    await pessoaAtiva(i.paraUserId);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.eapAtribuicao.update({ where: { id: i.atribuicaoId }, data: { userId: i.paraUserId } });
        await sincronizarPrincipal(tx, atrib.tarefaId);
        await sincronizarCards(tx, atrib.tarefa.projetoId, user.id);
      });
    } catch (e) {
      if (ehDuplicada(e)) throw new ActionError("Essa pessoa já está nesta atividade com o mesmo papel.");
      throw e;
    }
    revProjeto(atrib.tarefa.projetoId);
    return { tipo: "passar" as const, fimProjeto: null };
  },
);
