/**
 * Smoke do pool de recursos, parte 1 (spec `docs/superpowers/specs/2026-11-25-pool-de-recursos-design.md`) contra o banco
 * de dev. Monta dois projetos, confere e apaga.
 *
 *   1. Horas automáticas (decisões B e 2): o herdado nasce automático; o total da tarefa (dias úteis × 8 h) se divide
 *      pela jornada × dedicação; dedicação na disciplina muda a divisão e não mexe no padrão do cadastro; duração nova
 *      recalcula; hora digitada vence e sai do total; zero volta ao automático; estagiário de 6 h pesa menos; linha
 *      concluída não muda; atribuição antiga (sem a marca) fica como está.
 *   2. Conflito por dia (decisões A e J): o choque de UM dia aparece; o rascunho enxerga o aprovado e os outros
 *      rascunhos (marcados); o aprovado não ganha alerta por causa de rascunho.
 *
 * Uso: npm run smoke:pool-recursos
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { herdarResponsaveisNoProjeto } from "../src/modules/planejamento/recursos-service";
import { recalcularHorasAutomaticas } from "../src/modules/planejamento/horas-automaticas-service";
import { atribuicaoAposEditar, nasceAutomatica } from "../src/modules/planejamento/horas-automaticas";
import { conflitosDeRecursosDoProjeto } from "../src/modules/planejamento/recursos-queries";
import { definirDedicacao, substituirResponsaveis } from "../src/modules/projetos/responsaveis-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-pool-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function horasDe(tarefaId: string): Promise<Record<string, { horas: number; auto: boolean }>> {
  const as = await prisma.eapAtribuicao.findMany({ where: { tarefaId }, select: { userId: true, horasPrevistas: true, horasAutomaticas: true } });
  return Object.fromEntries(as.map((a) => [a.userId ?? "perfil", { horas: Number(a.horasPrevistas), auto: a.horasAutomaticas }]));
}

async function main() {
  const usuario = (sufixo: string, contratacao: "pj" | "estagio") =>
    prisma.user.create({
      data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", contratacao, emailVerified: false },
    });
  const mireli = await usuario("A-mireli", "pj");
  const joao = await usuario("B-joao", "pj");
  const estag = await usuario("C-estag", "estagio");
  // Estagiário de 6 h por dia (30 h na semana).
  await prisma.escalaUsuario.createMany({ data: [1, 2, 3, 4, 5].map((diaSemana) => ({ userId: estag.id, diaSemana, horasDia: 6 })) });
  await prisma.recurso.create({ data: { userId: mireli.id, capacidade: 1 } });

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const novoProjeto = (sufixo: string, n: number) =>
    prisma.projeto.create({
      data: {
        codigo: `${Date.now() + n}`.slice(-6),
        ano: 2026,
        sequencial: Number(`${Date.now() + n}`.slice(-5)),
        nome: `${tag}-${sufixo}`,
        clienteId: cliente.id,
      },
    });
  const X = await novoProjeto("X", 1);
  const Y = await novoProjeto("Y", 2);
  const projetos = [X.id, Y.id];

  try {
    // ── 1. Horas automáticas ───────────────────────────────────────────────
    const disciplina = await prisma.disciplina.create({ data: { projetoId: X.id, disciplinaTextoLegado: "Elétrica" } });
    await substituirResponsaveis(prisma, disciplina.id, [mireli.id, joao.id]);
    await prisma.cronogramaProjeto.create({ data: { projetoId: X.id, inicioProjeto: d("2026-12-14") } });
    const base = { projetoId: X.id, disciplinaId: disciplina.id, inicioPrevisto: d("2026-12-14"), fimPrevisto: d("2026-12-18") };
    const grupo = await prisma.eapTarefa.create({ data: { ...base, nome: "Elétrica", tipoEap: "disc", ordem: 0 } });
    const A = await prisma.eapTarefa.create({ data: { ...base, parentId: grupo.id, nome: "Detalhamento elétrico", tipoEap: "atv", duracaoDias: 5, ordem: 1 } });

    await herdarResponsaveisNoProjeto(prisma, X.id);
    let h = await horasDe(A.id);
    check("o herdado nasce automático (ainda 0 h até recalcular)", h[mireli.id]?.auto === true && h[joao.id]?.auto === true, h);
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(A.id);
    check("Mireli e João Vitor a 100%, 5 dias: 20 h cada", h[mireli.id]?.horas === 20 && h[joao.id]?.horas === 20, h);
    check("o agrupamento não recebe ninguém", (await prisma.eapAtribuicao.count({ where: { tarefaId: grupo.id } })) === 0);

    await definirDedicacao(prisma, disciplina.id, mireli.id, 50);
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(A.id);
    check("Mireli a 50% na disciplina: 13,33 h e João Vitor 26,67 h", h[mireli.id]?.horas === 13.33 && h[joao.id]?.horas === 26.67, h);
    const recurso = await prisma.recurso.findUniqueOrThrow({ where: { userId: mireli.id }, select: { capacidade: true } });
    check("o padrão do cadastro de Recursos não muda", Number(recurso.capacidade) === 1, recurso);
    check("dedicação de quem não é responsável é recusada", (await definirDedicacao(prisma, disciplina.id, estag.id, 50)) === false);

    await prisma.eapTarefa.update({ where: { id: A.id }, data: { duracaoDias: 10 } });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(A.id);
    check("duração 10 dias: as horas acompanham (26,66 h e 53,34 h)", h[mireli.id]?.horas === 26.66 && h[joao.id]?.horas === 53.34, h);

    // Digitar as horas do João Vitor (o que `salvarAtribuicao` faz com `atribuicaoAposEditar`).
    const atJoao = await prisma.eapAtribuicao.findFirstOrThrow({ where: { tarefaId: A.id, userId: joao.id } });
    const digitada = atribuicaoAposEditar({ horas: Number(atJoao.horasPrevistas), automatica: true }, { userId: joao.id, papel: "pro", horas: 30 });
    await prisma.eapAtribuicao.update({ where: { id: atJoao.id }, data: { horasPrevistas: digitada.horas, horasAutomaticas: digitada.automatica } });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(A.id);
    check("hora digitada vence e sai do total: João 30 h fixas, Mireli 50 h", h[joao.id]?.horas === 30 && !h[joao.id]?.auto && h[mireli.id]?.horas === 50, h);

    const zerada = atribuicaoAposEditar({ horas: 30, automatica: false }, { userId: joao.id, papel: "pro", horas: 0 });
    await prisma.eapAtribuicao.update({ where: { id: atJoao.id }, data: { horasPrevistas: zerada.horas, horasAutomaticas: zerada.automatica } });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(A.id);
    check("zero volta ao automático", h[joao.id]?.auto === true && h[joao.id]?.horas === 53.34, h);
    await definirDedicacao(prisma, disciplina.id, mireli.id, null);

    // Estagiário de 6 h por dia, numa linha nova de 5 dias com a Mireli.
    const B = await prisma.eapTarefa.create({ data: { ...base, parentId: grupo.id, nome: "Quadro de cargas", tipoEap: "atv", duracaoDias: 5, ordem: 2 } });
    await prisma.eapAtribuicao.createMany({
      data: [
        { tarefaId: B.id, userId: mireli.id, papel: "pro", principal: true, horasAutomaticas: nasceAutomatica({ userId: mireli.id, papel: "pro", horas: 0 }) },
        { tarefaId: B.id, userId: estag.id, papel: "est", horasAutomaticas: nasceAutomatica({ userId: estag.id, papel: "est", horas: 0 }) },
      ],
    });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(B.id);
    check("jornadas diferentes: Mireli 22,85 h e estagiário (6 h/dia) 17,15 h", h[mireli.id]?.horas === 22.85 && h[estag.id]?.horas === 17.15, h);

    // Quem acompanha não divide as horas; atribuição antiga (sem a marca) fica como está.
    const C = await prisma.eapTarefa.create({ data: { ...base, parentId: grupo.id, nome: "Antiga", tipoEap: "atv", duracaoDias: 5, ordem: 3 } });
    await prisma.eapAtribuicao.createMany({
      data: [
        { tarefaId: C.id, userId: joao.id, papel: "pro", principal: true },
        { tarefaId: C.id, userId: mireli.id, papel: "coo", horasAutomaticas: nasceAutomatica({ userId: mireli.id, papel: "coo", horas: 0 }) },
      ],
    });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(C.id);
    check("atribuição antiga sem hora fica sem hora; coordenador não recebe automática", h[joao.id]?.horas === 0 && !h[joao.id]?.auto && h[mireli.id]?.horas === 0 && !h[mireli.id]?.auto, h);

    await prisma.eapTarefa.update({ where: { id: B.id }, data: { status: "con", duracaoDias: 8 } });
    await recalcularHorasAutomaticas(prisma, X.id);
    h = await horasDe(B.id);
    check("linha concluída não muda", h[mireli.id]?.horas === 22.85 && h[estag.id]?.horas === 17.15, h);

    // ── 2. Conflito por dia ────────────────────────────────────────────────
    // Limpa as linhas de 1 e monta: X com a Mireli 8 h/dia de 14 a 18/12; Y com ela 8 h só no dia 16.
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: X.id } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: X.id, parentId: { not: null } } });
    const X1 = await prisma.eapTarefa.create({ data: { ...base, parentId: grupo.id, nome: "Modelagem sanitária", tipoEap: "atv", duracaoDias: 5, ordem: 1 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: X1.id, userId: mireli.id, papel: "pro", horasPrevistas: 40, principal: true } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: Y.id, inicioProjeto: d("2026-12-16") } });
    const Y1 = await prisma.eapTarefa.create({
      data: { projetoId: Y.id, nome: "Revisão interna", tipoEap: "atv", duracaoDias: 1, ordem: 0, inicioPrevisto: d("2026-12-16"), fimPrevisto: d("2026-12-16") },
    });
    await prisma.eapAtribuicao.create({ data: { tarefaId: Y1.id, userId: mireli.id, papel: "pro", horasPrevistas: 8, principal: true } });

    const hoje = "2026-12-01";
    let cx = await conflitosDeRecursosDoProjeto(X.id, { verCargaDaEquipe: true, hoje });
    check(
      "dois rascunhos: X enxerga o Y no dia 16 (e só nele), marcado como rascunho",
      cx.length === 1 && cx[0].dia === "2026-12-16" && cx[0].carga === 16 && cx[0].outros?.[0]?.projetoId === Y.id && cx[0].outros?.[0]?.rascunho === true,
      cx,
    );

    await prisma.cronogramaProjeto.update({ where: { projetoId: Y.id }, data: { aprovado: true } });
    cx = await conflitosDeRecursosDoProjeto(X.id, { verCargaDaEquipe: true, hoje });
    check("Y aprovado: X (rascunho) vê o conflito com o Y, agora sem a marca de rascunho", cx.length === 1 && cx[0].outros?.[0]?.rascunho === false, cx);
    const cy = await conflitosDeRecursosDoProjeto(Y.id, { verCargaDaEquipe: true, hoje });
    check("o aprovado (Y) não ganha alerta por causa do rascunho (X)", cy.length === 0, cy);

    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { aprovado: true } });
    const cy2 = await conflitosDeRecursosDoProjeto(Y.id, { verCargaDaEquipe: true, hoje });
    check("os dois aprovados: Y vê o conflito com o X no dia 16", cy2.length === 1 && cy2[0].dia === "2026-12-16" && cy2[0].outros?.[0]?.projetoId === X.id, cy2);
  } finally {
    await prisma.tarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.eapBaseline.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: { in: projetos } } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos }, parentId: { not: null } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.recurso.deleteMany({ where: { userId: mireli.id } });
    await prisma.user.deleteMany({ where: { id: { in: [mireli.id, joao.id, estag.id] } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
