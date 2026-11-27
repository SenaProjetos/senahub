/**
 * Carga das horas automáticas nas atribuições de antes do pool de recursos (feedback do planejamento, 26/11/2026).
 *
 * A migração `pool_recursos_parte1` criou `EapAtribuicao.horasAutomaticas` com padrão `false`, então tudo o que já estava
 * escalado ficou "digitado" — e quem estava em ZERO hora continuou em zero, sem a conta dias úteis × 8 h. Este script
 * passa para o automático cada atribuição que a regra de hoje teria criado automática (`nasceAutomatica`: pessoa OU perfil
 * que executa, em zero hora) e recalcula as horas do projeto pela mesma função das telas (`recalcularHorasAutomaticas`).
 * Hora digitada (> 0) nunca muda.
 *
 * ATENÇÃO: a decisão 2 do Ryan (`docs/superpowers/specs/2026-11-25-pool-de-recursos-decisoes-ryan.md`) diz que as
 * atribuições antigas sem horas ficam como estão, até alguém digitar. Esta carga revoga isso de uma vez: é OPCIONAL e só
 * roda com o aval dele. Sem ela, digitar 0 na linha liga o automático daquela atribuição.
 *
 * SE APROVADA, RODAR UMA VEZ NO DEPLOY (simula primeiro):
 *
 *   npm run eap:horas-automaticas                (simula: lista o que mudaria)
 *   npm run eap:horas-automaticas -- --gravar    (grava, recalcula cada projeto tocado)
 *
 * Fora: linha encerrada (concluída, cancelada, arquivada — a hora dela já é história), marco, agrupamento, linha sem
 * duração e etapa de terceiro. Cronograma aprovado entra: pessoas e horas são acompanhamento, livres depois de aprovar; a
 * linha de base NÃO muda (para isso existe "Completar equipe"). Cada projeto grava numa transação, com uma linha de
 * auditoria por atribuição (acao `horas-automaticas-carga`), condicionada ao estado lido. Rodar de novo não muda nada.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { nasceAutomatica } from "../src/modules/planejamento/horas-automaticas";
import { recalcularHorasAutomaticas } from "../src/modules/planejamento/horas-automaticas-service";
import { ENCERRADA, ROTULO_PAPEL, linhaAceitaHoras } from "../src/modules/planejamento/recursos";

const gravar = process.argv.includes("--gravar");

async function main() {
  const candidatas = await prisma.eapAtribuicao.findMany({
    where: {
      horasAutomaticas: false,
      horasPrevistas: 0,
      papel: { in: ["pro", "mod", "est", "eng"] },
      tarefa: { tipoEap: "atv", status: { notIn: [...ENCERRADA] }, filhas: { none: {} }, atribuicoes: { none: { papel: "ext" } } },
    },
    select: {
      id: true,
      userId: true,
      papel: true,
      user: { select: { name: true } },
      tarefa: {
        select: {
          id: true,
          nome: true,
          tipoEap: true,
          duracaoDias: true,
          projeto: { select: { id: true, codigo: true, cronograma: { select: { aprovado: true } } } },
        },
      },
    },
    orderBy: [{ tarefa: { projetoId: "asc" } }, { tarefa: { ordem: "asc" } }],
  });

  const mudancas = candidatas.filter(
    (a) =>
      nasceAutomatica({ userId: a.userId, papel: a.papel, horas: 0 }) &&
      linhaAceitaHoras({ tipoEap: a.tarefa.tipoEap, ehResumo: false, duracaoDias: Number(a.tarefa.duracaoDias) }),
  );

  const porProjeto = new Map<string, { codigo: string; aprovado: boolean; ids: string[] }>();
  for (const a of mudancas) {
    const p = a.tarefa.projeto;
    const quem = a.user?.name ?? `(perfil) ${ROTULO_PAPEL[a.papel]}`;
    console.log(`  ${p.codigo}  ${Number(a.tarefa.duracaoDias)} d  ${quem}  —  ${a.tarefa.nome}`);
    const g = porProjeto.get(p.id) ?? { codigo: p.codigo, aprovado: p.cronograma?.aprovado ?? false, ids: [] };
    g.ids.push(a.id);
    porProjeto.set(p.id, g);
  }
  const aprovados = [...porProjeto.values()].filter((g) => g.aprovado).map((g) => g.codigo);
  console.log(`\n${mudancas.length} atribuição(ões) em zero hora passam para o automático, em ${porProjeto.size} projeto(s).`);
  if (aprovados.length > 0) {
    console.log(`Cronograma aprovado (a carga muda; a linha de base não — use "Completar equipe"): ${aprovados.join(", ")}`);
  }

  if (!gravar) {
    console.log("Simulação: nada gravado. Rode com --gravar para aplicar.");
    return;
  }
  if (mudancas.length === 0) return;
  // Autor da trilha: um superusuário ativo (não há sessão num script).
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Sem superusuário ativo para assinar a carga — nada gravado.");
    process.exitCode = 1;
    return;
  }

  let ligadas = 0;
  let horas = 0;
  for (const [projetoId, g] of porProjeto) {
    const r = await prisma.$transaction(
      async (tx) => {
        let n = 0;
        for (const id of g.ids) {
          // Condicionado ao estado lido: alguém digitou hora ou ligou o automático no meio da carga → fica como está.
          const u = await tx.eapAtribuicao.updateMany({ where: { id, horasAutomaticas: false, horasPrevistas: 0 }, data: { horasAutomaticas: true } });
          if (u.count !== 1) continue;
          n++;
          await tx.auditLog.create({
            data: {
              userId: admin.id,
              modulo: "planejamento",
              acao: "horas-automaticas-carga",
              entidade: "EapAtribuicao",
              entidadeId: id,
              detalhe: { antes: { horasAutomaticas: false, horasPrevistas: 0 }, novo: { horasAutomaticas: true } },
            },
          });
        }
        const recalculadas = n > 0 ? await recalcularHorasAutomaticas(tx, projetoId) : 0;
        return { n, recalculadas };
      },
      { timeout: 60_000 },
    );
    ligadas += r.n;
    horas += r.recalculadas;
    console.log(`  ${g.codigo}: ${r.n} ligada(s) ao automático, ${r.recalculadas} com horas recalculadas.`);
  }
  console.log(`Gravado: ${ligadas} atribuição(ões) no automático, ${horas} com horas recalculadas, ${porProjeto.size} projeto(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
