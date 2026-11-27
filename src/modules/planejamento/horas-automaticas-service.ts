import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { gradesEmLote } from "@/modules/rh/escalas/queries";
import { atribuicaoAposEditar, horasAutomaticasDaLinha, perfilQueAPessoaOcupa, type PesoDaPessoa } from "./horas-automaticas";
import type { Papel } from "./recursos";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A pessoa escalada preenche a vaga do perfil da linha (`perfilQueAPessoaOcupa`), em vez de somar uma atribuição que
 * dividiria as horas com ele. `papel` nulo = o primeiro perfil que executa (o arrasto da tela por pessoa). As horas da
 * vaga ficam; hora digitada ao escalar vale como digitar na linha; vaga em zero hora vai para o automático (a de antes do
 * pool nasceu digitada em zero). Condicionado a "ainda perfil": duas pessoas ao mesmo tempo não ocupam a mesma vaga.
 *
 * Devolve o id da atribuição ocupada, ou `null` sem vaga (quem chama cria a atribuição nova). Não recalcula as horas:
 * quem chama já faz isso depois de qualquer mudança nas pessoas da linha.
 */
export async function ocuparVagaDoPerfilNoTx(
  tx: Prisma.TransactionClient,
  p: { tarefaId: string; userId: string; papel: Papel | null; horasDigitadas: number },
): Promise<string | null> {
  if (p.papel === "ext") return null;
  // A mesma trava da troca na tela por pessoa (`trocarPessoaNoPlanejador`, que já a tem — a trava é reentrante na mesma
  // transação): dois "Adicionar" ao mesmo tempo se enfileiram, e o segundo relê e cai no próximo perfil ou cria a sua.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"troca-pessoa:" + p.tarefaId}))`;
  const perfis = await tx.eapAtribuicao.findMany({
    where: { tarefaId: p.tarefaId, userId: null },
    select: { id: true, userId: true, papel: true, horasPrevistas: true, horasAutomaticas: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const vaga = perfilQueAPessoaOcupa(perfis, p.papel);
  if (!vaga) return null;
  const horasDaVaga = Number(vaga.horasPrevistas);
  const depois = atribuicaoAposEditar(
    { horas: horasDaVaga, automatica: vaga.horasAutomaticas },
    { userId: p.userId, papel: vaga.papel, horas: p.horasDigitadas > 0 ? p.horasDigitadas : horasDaVaga > 0 ? undefined : 0 },
  );
  const r = await tx.eapAtribuicao.updateMany({
    where: { id: vaga.id, userId: null },
    data: { userId: p.userId, horasPrevistas: depois.horas, horasAutomaticas: depois.automatica },
  });
  if (r.count !== 1) throw new ActionError("Outra pessoa acabou de ocupar este perfil. Atualize a tela.");
  return vaga.id;
}

/**
 * Regrava as horas das atribuições AUTOMÁTICAS do projeto pela regra de `horas-automaticas.ts` (pool de recursos,
 * decisões B e 2). Chamado depois de toda mudança que mexe na conta — duração da linha (`aposMudarEap`), pessoas da
 * linha (`recursos-actions.ts`), dedicação da disciplina —, ANTES de reagendar, porque o motor pondera o % pelas horas.
 *
 * Só escreve o que mudou. Leituras planas e em série: pode rodar dentro de uma transação (`Db`). A escala vem de
 * `gradesEmLote`, que lê fora da transação — nada aqui a altera.
 *
 * Devolve quantas atribuições mudaram.
 */
export async function recalcularHorasAutomaticas(db: Db, projetoId: string): Promise<number> {
  // Fora de uma transação (`aposMudarEap`), abre a sua: a trava abaixo só vale dentro de uma.
  if (db === prisma) return prisma.$transaction((tx) => recalcularNoTx(tx, projetoId));
  return recalcularNoTx(db as Prisma.TransactionClient, projetoId);
}

async function recalcularNoTx(db: Prisma.TransactionClient, projetoId: string): Promise<number> {
  // Uma conta por projeto de cada vez: duas gravações simultâneas (dedicação × duração) leriam o estado uma da outra pela
  // metade e a última a gravar deixaria horas velhas.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horas-automaticas:${projetoId}`}))`;
  const automaticas = await db.eapAtribuicao.findMany({
    where: { horasAutomaticas: true, tarefa: { projetoId } },
    select: { tarefaId: true },
    distinct: ["tarefaId"],
  });
  if (automaticas.length === 0) return 0;
  const tarefaIds = automaticas.map((a) => a.tarefaId);

  const linhas = await db.eapTarefa.findMany({
    where: { id: { in: tarefaIds } },
    select: { id: true, tipoEap: true, status: true, duracaoDias: true, disciplinaId: true },
  });
  const filhos = await db.eapTarefa.findMany({
    where: { parentId: { in: tarefaIds } },
    select: { parentId: true },
    distinct: ["parentId"],
  });
  const comFilhos = new Set(filhos.map((f) => f.parentId!));
  const atribuicoes = await db.eapAtribuicao.findMany({
    where: { tarefaId: { in: tarefaIds } },
    select: { id: true, tarefaId: true, userId: true, papel: true, horasPrevistas: true, horasAutomaticas: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const userIds = [...new Set(atribuicoes.map((a) => a.userId).filter((u): u is string => u != null))];
  const disciplinaIds = [...new Set(linhas.map((l) => l.disciplinaId).filter((d): d is string => d != null))];
  const dedicacoes = await db.disciplinaResponsavel.findMany({
    where: { disciplinaId: { in: disciplinaIds }, userId: { in: userIds }, dedicacao: { not: null } },
    select: { disciplinaId: true, userId: true, dedicacao: true },
  });
  // Só recurso ativo, como a carga da equipe: o inativo cai no padrão (100%).
  const recursos = await db.recurso.findMany({ where: { userId: { in: userIds }, ativo: true }, select: { userId: true, capacidade: true } });
  const usuarios = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, contratacao: true } });
  const grades = await gradesEmLote(usuarios, db);

  const dedicacaoNaDisciplina = new Map(dedicacoes.map((d) => [`${d.disciplinaId}|${d.userId}`, (d.dedicacao ?? 100) / 100]));
  const padrao = new Map(recursos.map((r) => [r.userId, Number(r.capacidade)]));
  const jornada = new Map(
    [...grades].map(([userId, g]) => [userId, g.filter((d) => d.ativo).reduce((s, d) => s + d.horasDia, 0)] as const),
  );

  let mudaram = 0;
  for (const l of linhas) {
    const daLinha = atribuicoes.filter((a) => a.tarefaId === l.id);
    const pesoDe = (userId: string): PesoDaPessoa => ({
      jornadaSemanal: jornada.get(userId) ?? 0,
      dedicacao: (l.disciplinaId ? dedicacaoNaDisciplina.get(`${l.disciplinaId}|${userId}`) : undefined) ?? padrao.get(userId) ?? 1,
    });
    const alvo = horasAutomaticasDaLinha(
      { tipoEap: l.tipoEap, ehResumo: comFilhos.has(l.id), duracaoDias: Number(l.duracaoDias), status: l.status },
      daLinha.map((a) => ({ id: a.id, userId: a.userId, papel: a.papel, horas: Number(a.horasPrevistas), automatica: a.horasAutomaticas })),
      pesoDe,
    );
    for (const a of daLinha) {
      const horas = alvo.get(a.id);
      if (horas === undefined || Math.abs(horas - Number(a.horasPrevistas)) < 0.005) continue;
      // Condicionado ao automático: se alguém digitou a hora no meio do caminho, a digitada vence.
      const r = await db.eapAtribuicao.updateMany({ where: { id: a.id, horasAutomaticas: true }, data: { horasPrevistas: horas } });
      mudaram += r.count;
    }
  }
  return mudaram;
}
