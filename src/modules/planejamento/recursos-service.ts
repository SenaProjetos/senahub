import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { paraDataUtc, planoDoProjeto } from "./agenda";
import { ehEtapaDeTerceiro, escolherPrincipal, herdarResponsaveis, linhaGeraCard } from "./recursos";

/**
 * Recursos na linha (F5) — o lado com I/O das regras de `recursos.ts`.
 *
 * Tudo aqui aceita `tx` para rodar dentro da transação de quem chama: herdar responsável
 * ao criar a linha, ou acertar o principal ao remover alguém, tem de acontecer junto com
 * a mudança que o motivou — nunca num segundo passo que pode falhar sozinho.
 */
type Db = Prisma.TransactionClient | typeof prisma;

/** Linhas do projeto que têm filho — o motor as trata como resumo, seja qual for o TEAP. */
async function idsComFilhos(db: Db, projetoId: string): Promise<Set<string>> {
  const filhos = await db.eapTarefa.findMany({
    where: { projetoId, parentId: { not: null } },
    select: { parentId: true },
    distinct: ["parentId"],
  });
  return new Set(filhos.map((f) => f.parentId!));
}

/**
 * Herança do responsável da disciplina (D22) para as linhas do projeto ainda sem ninguém.
 * `somente` restringe às linhas recém-criadas; sem ele, varre o projeto inteiro.
 *
 * Só gente ATIVA desce: herdar alguém desligado criaria carga para quem não trabalha mais
 * aqui. Ordem por nome — o primeiro vira principal; é arbitrário, mas estável e à vista.
 */
export async function herdarResponsaveisNoProjeto(
  db: Db,
  projetoId: string,
  somente?: readonly string[],
): Promise<number> {
  const [linhas, comFilhos] = await Promise.all([
    db.eapTarefa.findMany({
      where: { projetoId, ...(somente ? { id: { in: [...somente] } } : {}) },
      select: { id: true, tipoEap: true, disciplinaId: true, _count: { select: { atribuicoes: true } } },
    }),
    idsComFilhos(db, projetoId),
  ]);
  const disciplinaIds = [...new Set(linhas.map((l) => l.disciplinaId).filter((d): d is string => d != null))];
  if (disciplinaIds.length === 0) return 0;

  const responsaveis = await db.disciplinaResponsavel.findMany({
    where: { disciplinaId: { in: disciplinaIds }, user: { ativo: true } },
    select: { disciplinaId: true, userId: true },
    orderBy: { user: { name: "asc" } },
  });
  const porDisciplina = new Map<string, string[]>();
  for (const r of responsaveis) porDisciplina.set(r.disciplinaId, [...(porDisciplina.get(r.disciplinaId) ?? []), r.userId]);

  const novas = herdarResponsaveis(
    linhas.map((l) => ({
      id: l.id,
      tipoEap: l.tipoEap,
      ehResumo: comFilhos.has(l.id),
      disciplinaId: l.disciplinaId,
      temAtribuicao: l._count.atribuicoes > 0,
    })),
    porDisciplina,
  );
  if (novas.length === 0) return 0;
  const r = await db.eapAtribuicao.createMany({ data: novas, skipDuplicates: true });
  return r.count;
}

/**
 * Acerta o principal da linha depois de qualquer mudança nas atribuições. Desmarca antes
 * de marcar: o índice único parcial recusaria dois principais nem que fosse por um
 * instante dentro da mesma transação.
 */
export async function sincronizarPrincipal(db: Db, tarefaId: string): Promise<void> {
  const atribuicoes = await db.eapAtribuicao.findMany({
    where: { tarefaId },
    select: { id: true, userId: true, papel: true, principal: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const escolhido = escolherPrincipal(atribuicoes);
  const atual = atribuicoes.find((a) => a.principal)?.id ?? null;
  if (escolhido === atual) return;
  await db.eapAtribuicao.updateMany({
    where: { tarefaId, principal: true, ...(escolhido ? { id: { not: escolhido } } : {}) },
    data: { principal: false },
  });
  if (escolhido) await db.eapAtribuicao.update({ where: { id: escolhido }, data: { principal: true } });
}

/**
 * Cards do projetista a partir da EAP (D24, D32 — "estrutura desce, progresso sobe").
 *
 * Só com cronograma APROVADO (D14). Linha elegível sem card ganha um, na primeira coluna do
 * quadro. Linha com card tem título, prazo, disciplina e responsáveis ACOMPANHANDO a EAP:
 * são estrutura, e a EAP é a fonte — o card que o projetista editasse à parte divergiria
 * do cronograma na primeira reprogramação. Progresso e checklist são do card e não são
 * tocados.
 *
 * NUNCA apaga card. Linha que deixou de ser elegível (concluída, cancelada, sem gente)
 * mantém o card como está: ele pode ter comentário, checklist e histórico.
 *
 * Sem notificação nesta versão: aprovar um cronograma de 200 linhas não pode disparar 200
 * avisos. O card aparece no quadro de quem é responsável.
 *
 * O PRAZO vem do MOTOR, não de `fimPrevisto` gravado: a coluna só se atualiza quando alguém
 * reagenda, e a baseline, a qualidade e a carga da equipe já leem o motor. Com a coluna, o
 * card de um cronograma aprovado sem reagendar nasceria com prazo diferente do combinado.
 * (O motor lê o que está gravado — dentro de uma transação, enxerga o estado de antes dela;
 * nenhuma mudança de atribuição mexe em data, então não há o que perder.)
 */
export async function sincronizarCards(
  db: Db,
  projetoId: string,
  autorId: string,
): Promise<{ criados: number; atualizados: number }> {
  const cronograma = await db.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true } });
  if (!cronograma?.aprovado) return { criados: 0, atualizados: 0 };

  const [linhas, comFilhos, plano] = await Promise.all([
    db.eapTarefa.findMany({
      where: { projetoId },
      select: {
        id: true,
        nome: true,
        tipoEap: true,
        status: true,
        duracaoDias: true,
        disciplinaId: true,
        fimPrevisto: true,
        atribuicoes: { select: { userId: true, papel: true, principal: true } },
      },
    }),
    idsComFilhos(db, projetoId),
    planoDoProjeto(projetoId),
  ]);
  const prazoDe = (l: { id: string; fimPrevisto: Date }) => {
    const fim = plano?.resultado.linhas.get(l.id)?.fim;
    return fim ? paraDataUtc(fim) : l.fimPrevisto;
  };

  const elegiveis = linhas.filter((l) =>
    linhaGeraCard(
      {
        tipoEap: l.tipoEap,
        ehResumo: comFilhos.has(l.id),
        duracaoDias: Number(l.duracaoDias),
        status: l.status,
        deTerceiro: ehEtapaDeTerceiro(l.atribuicoes),
        pessoas: l.atribuicoes.filter((a) => a.userId != null).map((a) => a.userId!),
      },
      true,
    ),
  );
  if (elegiveis.length === 0) return { criados: 0, atualizados: 0 };

  const [cards, primeira] = await Promise.all([
    db.tarefa.findMany({
      where: { eapTarefaId: { in: elegiveis.map((l) => l.id) } },
      select: {
        id: true,
        eapTarefaId: true,
        titulo: true,
        prazo: true,
        disciplinaId: true,
        responsaveis: { select: { userId: true } },
      },
    }),
    db.tarefaStatus.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true } }),
  ]);
  if (!primeira) throw new Error("Nenhuma coluna de tarefas configurada.");
  const cardPorLinha = new Map(cards.map((c) => [c.eapTarefaId!, c]));

  let criados = 0;
  let atualizados = 0;
  for (const l of elegiveis) {
    // Principal primeiro: é quem o quadro mostra quando há espaço para um só.
    const pessoas = [...l.atribuicoes]
      .filter((a) => a.userId != null)
      .sort((a, b) => Number(b.principal) - Number(a.principal))
      .map((a) => a.userId!);
    const unicas = [...new Set(pessoas)];
    const card = cardPorLinha.get(l.id);

    if (!card) {
      await db.tarefa.create({
        data: {
          titulo: l.nome,
          descricao: "Gerada do cronograma (EAP).",
          statusId: primeira.id,
          prazo: prazoDe(l),
          projetoId,
          disciplinaId: l.disciplinaId,
          criadorId: autorId,
          eapTarefaId: l.id,
          responsaveis: { create: unicas.map((userId) => ({ userId })) },
        },
      });
      criados++;
      continue;
    }

    const atuais = new Set(card.responsaveis.map((r) => r.userId));
    const entram = unicas.filter((u) => !atuais.has(u));
    const saem = [...atuais].filter((u) => !unicas.includes(u));
    const prazo = prazoDe(l);
    const mudouCampo =
      card.titulo !== l.nome ||
      card.disciplinaId !== l.disciplinaId ||
      card.prazo?.toISOString().slice(0, 10) !== prazo.toISOString().slice(0, 10);
    if (!mudouCampo && entram.length === 0 && saem.length === 0) continue;

    await db.tarefa.update({
      where: { id: card.id },
      data: {
        ...(mudouCampo ? { titulo: l.nome, prazo, disciplinaId: l.disciplinaId } : {}),
        responsaveis: {
          ...(saem.length ? { deleteMany: { userId: { in: saem } } } : {}),
          ...(entram.length ? { create: entram.map((userId) => ({ userId })) } : {}),
        },
      },
    });
    atualizados++;
  }
  return { criados, atualizados };
}
