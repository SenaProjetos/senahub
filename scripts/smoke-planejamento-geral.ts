/**
 * Smoke do Planejamento geral (pool de recursos, parte 5 — decisões 7, 10 e J) contra o banco de dev. Monta os projetos,
 * confere e apaga.
 *
 *   1. Quais projetos entram: em andamento com EAP, aprovados e rascunhos; cancelado fica fora.
 *   2. Conflito por linha: dois aprovados no mesmo dia marcam a pessoa nas duas linhas; o rascunho que estoura o dia marca
 *      só a linha do rascunho (o aprovado não ganha alerta por rascunho).
 *   3. EDT pela árvore e as datas do motor.
 *   4. Filtros (pessoa, cronograma, período) e o contador.
 *
 * Uso: npm run smoke:planejamento-geral
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { recalcularHorasAutomaticas } from "../src/modules/planejamento/horas-automaticas-service";
import { planejamentoGeral } from "../src/modules/planejamento/planejamento-geral-queries";
import { filtrarPlanejamentoGeral, SEM_FILTRO } from "../src/modules/planejamento/planejamento-geral";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-pgeral-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const usuario = (sufixo: string) =>
    prisma.user.create({ data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", contratacao: "pj", emailVerified: false } });
  const mireli = await usuario("mireli");
  const pessoas = [mireli.id];
  await prisma.recurso.create({ data: { userId: mireli.id, capacidade: 1 } });

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  let n = 0;
  const novoProjeto = async (sufixo: string, extra: Record<string, unknown> = {}) => {
    n++;
    return prisma.projeto.create({
      data: {
        codigo: `${Date.now() + n}`.slice(-6),
        ano: 2026,
        sequencial: Number(`${Date.now() + n}`.slice(-5)),
        nome: `${tag}-${sufixo}`,
        clienteId: cliente.id,
        situacao: "em_andamento",
        ...extra,
      },
    });
  };
  const A1 = await novoProjeto("A1");
  const A2 = await novoProjeto("A2");
  const R1 = await novoProjeto("R1");
  const C1 = await novoProjeto("C1", { situacao: "cancelado" });
  const projetos = [A1.id, A2.id, R1.id, C1.id];

  const linha = (projetoId: string, nome: string, duracaoDias: number, extra: Record<string, unknown> = {}) =>
    prisma.eapTarefa.create({
      data: { projetoId, nome, tipoEap: "atv", duracaoDias, ordem: n++, inicioPrevisto: d("2027-01-04"), fimPrevisto: d("2027-01-04"), ...extra },
    });
  const comMireli = async (tarefaId: string) =>
    prisma.eapAtribuicao.create({ data: { tarefaId, userId: mireli.id, papel: "pro", principal: true, horasAutomaticas: true } });

  try {
    // A1 (aprovado): Grupo → Tarefa A1, 04 a 08/01, Mireli. A2 (aprovado): 06 a 12/01, Mireli. R1 (rascunho): 04 a 08/01, Mireli.
    await prisma.cronogramaProjeto.create({ data: { projetoId: A1.id, inicioProjeto: d("2027-01-04"), aprovado: true } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: A2.id, inicioProjeto: d("2027-01-06"), aprovado: true } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: R1.id, inicioProjeto: d("2027-01-04") } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: C1.id, inicioProjeto: d("2027-01-04"), aprovado: true } });
    const G = await prisma.eapTarefa.create({
      data: { projetoId: A1.id, nome: "Elétrica", tipoEap: "disc", ordem: n++, inicioPrevisto: d("2027-01-04"), fimPrevisto: d("2027-01-04") },
    });
    const TA1 = await linha(A1.id, "Tarefa A1", 5, { parentId: G.id });
    const TA2 = await linha(A2.id, "Tarefa A2", 5);
    const TR1 = await linha(R1.id, "Tarefa R1", 5);
    const TC1 = await linha(C1.id, "Tarefa C1", 5);
    for (const t of [TA1, TA2, TR1, TC1]) await comMireli(t.id);
    for (const p of projetos) await recalcularHorasAutomaticas(prisma, p);

    const t0 = Date.now();
    const periodo = { de: "2027-01-04", ate: "2027-01-31" };
    const dados = await planejamentoGeral(periodo, "2026-11-26");
    const ms = Date.now() - t0;
    console.log(`  (planejamentoGeral: ${dados.projetos.length} projetos em ${ms} ms)`);

    const ids = new Set(dados.projetos.map((p) => p.id));
    check("aprovados e rascunho em andamento entram; cancelado fica fora", ids.has(A1.id) && ids.has(A2.id) && ids.has(R1.id) && !ids.has(C1.id));
    const pA1 = dados.projetos.find((p) => p.id === A1.id)!;
    const pR1 = dados.projetos.find((p) => p.id === R1.id)!;
    check("selo: aprovado × rascunho", pA1.aprovado && !pR1.aprovado);

    const lA1 = pA1.linhas.find((l) => l.id === TA1.id)!;
    check("EDT pela árvore e datas do motor (04 a 08/01)", pA1.linhas.map((l) => l.codigo).join(",") === "1,1.1" && lA1.inicio === "2027-01-04" && lA1.fim === "2027-01-08", {
      codigos: pA1.linhas.map((l) => l.codigo),
      lA1,
    });

    const diasDe = (projetoId: string, tarefaId: string) =>
      dados.projetos.find((p) => p.id === projetoId)?.linhas.find((l) => l.id === tarefaId)?.responsaveis.find((r) => r.userId === mireli.id)?.conflitos ?? [];
    check("dois aprovados no mesmo dia: Mireli vermelha nas duas linhas (06 a 08/01)", diasDe(A1.id, TA1.id).join() === "2027-01-06,2027-01-07,2027-01-08" && diasDe(A2.id, TA2.id).join() === "2027-01-06,2027-01-07,2027-01-08", {
      A1: diasDe(A1.id, TA1.id),
      A2: diasDe(A2.id, TA2.id),
    });
    check(
      "o rascunho estoura 04 e 05/01: vermelha na linha do rascunho, não na do aprovado (decisão J)",
      diasDe(R1.id, TR1.id).join() === "2027-01-04,2027-01-05,2027-01-06,2027-01-07,2027-01-08" && !diasDe(A1.id, TA1.id).includes("2027-01-04"),
      { R1: diasDe(R1.id, TR1.id) },
    );

    const nossos = dados.projetos.filter((p) => projetos.includes(p.id));
    const soRascunhoDaMireli = filtrarPlanejamentoGeral(nossos, { ...SEM_FILTRO, userId: mireli.id, cronograma: "rascunho" }, periodo);
    check("filtro pessoa + rascunho: só o R1, contador 1 de 3", soRascunhoDaMireli.projetos.map((p) => p.id).join() === R1.id && soRascunhoDaMireli.vistos === 1 && soRascunhoDaMireli.total === 3);
    const doisProjetos = filtrarPlanejamentoGeral(nossos, { ...SEM_FILTRO, projetoIds: [A1.id, A2.id] }, periodo);
    check("vários projetos: A1 e A2, com os dias de conflito contados", doisProjetos.vistos === 2 && doisProjetos.projetos.every((p) => p.conflitos === 3), doisProjetos.projetos.map((p) => p.conflitos));
    const fora = filtrarPlanejamentoGeral(nossos, SEM_FILTRO, { de: "2027-03-01", ate: "2027-03-31" });
    check("período sem tarefa: nenhum projeto", fora.vistos === 0 && fora.total === 3);

    const semConflitoNoPeriodo = await planejamentoGeral({ de: "2027-01-11", ate: "2027-01-31" }, "2026-11-26");
    const diasDepois =
      semConflitoNoPeriodo.projetos.find((p) => p.id === A2.id)?.linhas.find((l) => l.id === TA2.id)?.responsaveis.find((r) => r.userId === mireli.id)?.conflitos ?? null;
    check("conflito só dentro do período (11 a 31/01: nenhum)", diasDepois != null && diasDepois.length === 0, { diasDepois });
  } finally {
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: { in: projetos } } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.recurso.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.user.deleteMany({ where: { id: { in: pessoas } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
