import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { resolverTarefaDoPonto } from "@/modules/ponto/tarefa-ponto-service";
import { disciplinaDaSessao, motivoParaNaoMarcarNoProjeto } from "@/modules/ponto/disciplina-sessao";
import { disciplinasDaPessoaNaData } from "@/modules/projetos/responsaveis-service";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Disciplinas de que a pessoa era responsável no projeto NA DATA da sessão (R5, decisão 13): a
 * correção de um dia antigo usa quem era responsável naquele dia, não quem é hoje.
 */
export async function disciplinasDaPessoaNoProjeto(db: Db, userId: string, projetoId: string, quando: Date): Promise<string[]> {
  return disciplinasDaPessoaNaData(db, userId, projetoId, quando);
}

/**
 * Destino de uma sessão nova (R2 do rateio; decisões 10, 11 e 12): valida a tarefa (regra antiga),
 * confere se a pessoa pode marcar horas no projeto e decide a disciplina. Chamado por TODO caminho
 * que cria `SessaoTrabalho`. Leituras em série: `db` pode ser o cliente de uma transação.
 *
 * - `aoVivo`: marcação na hora (batida, troca, apontamento) — com 2+ disciplinas a tarefa é obrigatória.
 *   Correção do dia passa `false` e nunca falha por disciplina.
 * - `checarAcesso`: só equipe, responsável de disciplina ou quem tem card aberto no projeto.
 */
export async function resolverDestinoDaSessao(
  db: Db,
  p: {
    userId: string;
    alocacao: { projetoId: string | null; tipoAlocacao: TipoAlocacaoPonto };
    tarefaId?: string | null;
    quando: Date;
    aoVivo: boolean;
    checarAcesso: boolean;
  },
): Promise<{ tarefaId: string | null; disciplinaId: string | null }> {
  const tarefaId = await resolverTarefaDoPonto(db, p.userId, p.alocacao, p.tarefaId);
  const projetoId = p.alocacao.projetoId;
  if (!projetoId) return { tarefaId, disciplinaId: null };

  const disciplinas = await disciplinasDaPessoaNoProjeto(db, p.userId, projetoId, p.quando);

  if (p.checarAcesso) {
    const membro = await db.projetoMembro.findFirst({ where: { projetoId, userId: p.userId }, select: { id: true } });
    const card = membro || disciplinas.length > 0
      ? null
      : await db.tarefa.findFirst({
          where: { projetoId, arquivada: false, status: { concluido: false }, responsaveis: { some: { userId: p.userId } } },
          select: { id: true },
        });
    const motivo = motivoParaNaoMarcarNoProjeto({ membro: !!membro, responsavelDeDisciplina: disciplinas.length > 0, temCardAberto: !!card });
    if (motivo) throw new ActionError(motivo);
  }

  // Reunião ligada a projeto não carrega disciplina (envolve várias ao mesmo tempo).
  if (p.alocacao.tipoAlocacao !== "projeto") return { tarefaId, disciplinaId: null };

  const tarefa = tarefaId ? await db.tarefa.findUnique({ where: { id: tarefaId }, select: { disciplinaId: true } }) : null;
  const r = disciplinaDaSessao({
    disciplinaDaTarefa: tarefa?.disciplinaId,
    tarefaEscolhida: !!tarefaId,
    disciplinasDaPessoa: disciplinas,
    exigirTarefa: p.aoVivo,
  });
  if ("erro" in r) throw new ActionError(r.erro);
  return { tarefaId, disciplinaId: r.disciplinaId };
}
