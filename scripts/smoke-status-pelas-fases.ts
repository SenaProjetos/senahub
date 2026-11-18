/**
 * Smoke do status da disciplina calculado pelas fases (spec
 * `docs/superpowers/specs/2026-11-13-status-disciplina-pelas-fases.md`) contra o banco de dev. Exercita o I/O
 * que o vitest não alcança: envio/desfazer da fase, aprovação da fase e da disciplina inteira (PJ e 100% CLT),
 * reabertura e reaprovação sem pagamento novo, apontamentos, disciplina paga inteira antes das fases,
 * disciplina sem fase, a corrida de dois envios e a prévia da migração (não grava). Notificador falso.
 *
 * Uso: npm run smoke:status-pelas-fases
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { StatusDisciplina } from "../src/generated/prisma/client";
import type { notificarMuitos } from "../src/lib/notificar";
import { desfazerEnvioEtapa, enviarEtapaParaAnalise } from "../src/modules/projetos/envio-etapa-service";
import { liberarPagamentosDaFase, liberarPagamentosProjetista } from "../src/modules/uploads/pagamento";
import {
  aprovarFasesSemPagamento,
  devolverFaseEntregueParaRevisao,
  disciplinasComStatusDivergente,
  marcarFaseEmRevisao,
  recalcularStatusDisciplina,
} from "../src/modules/projetos/status-pelas-fases-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const notificar = (async () => undefined) as unknown as typeof notificarMuitos;
const tag = `smoke-status-fases-${Date.now()}`;

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const fasesCat = await prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    take: 3,
    select: { id: true, sigla: true },
  });
  if (fasesCat.length < 3) throw new Error("O catálogo de fases do dev tem menos de 3 fases ativas.");

  const pj = await prisma.user.create({ data: { name: `${tag}-pj`, email: `${tag}-pj@teste.local`, tipo: "interno", contratacao: "pj", perfil: { connect: { chave: "projetista_pj" } }, emailVerified: false } });
  const clt = await prisma.user.create({ data: { name: `${tag}-clt`, email: `${tag}-clt@teste.local`, tipo: "interno", contratacao: "clt", perfil: { connect: { chave: "clt" } }, emailVerified: false } });
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-projeto`,
      clienteId: cliente.id,
    },
  });

  const discIds: string[] = [];
  async function novaDisciplina(nome: string, p: { resp: string; status?: StatusDisciplina; fases: StatusDisciplina[]; valor?: number }) {
    const d = await prisma.disciplina.create({
      data: { projetoId: projeto.id, disciplinaTextoLegado: nome, valor: p.valor ?? 10000, status: p.status ?? "aguardando" },
    });
    discIds.push(d.id);
    await prisma.disciplinaResponsavel.create({ data: { disciplinaId: d.id, userId: p.resp } });
    const pct = p.fases.length === 3 ? [40, 35, 25] : p.fases.length === 2 ? [50, 50] : [100];
    const fases = [];
    for (const [i, status] of p.fases.entries()) {
      fases.push(
        await prisma.disciplinaEtapa.create({
          data: { disciplinaId: d.id, etapaId: fasesCat[i].id, percentual: pct[i], ordem: i, status },
        }),
      );
    }
    return { id: d.id, fases };
  }
  const statusDe = async (id: string) =>
    (await prisma.disciplina.findUniqueOrThrow({ where: { id }, select: { status: true, entregueEm: true } }));
  const faseDe = async (id: string) =>
    prisma.disciplinaEtapa.findUniqueOrThrow({ where: { id }, select: { status: true, liberadaEm: true, valorPagamento: true } });
  const comResp = (id: string) =>
    prisma.disciplina.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, contratacao: true, pjId: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });
  const pagamentos = (disciplinaId: string) => prisma.pagamentoProjetista.count({ where: { disciplinaId, status: { not: "cancelado" } } });
  const enviar = (etapaId: string) => enviarEtapaParaAnalise({ etapaId, userId: pj.id, notificar });

  // ── A. Disciplina PJ, 3 fases, do envio à reaprovação ───────────────────────────────────────────────
  const A = await novaDisciplina("Estrutural", { resp: pj.id, fases: ["aguardando", "aguardando", "aguardando"] });
  await enviar(A.fases[0].id);
  check("1 de 3 fases enviada → Em andamento", (await statusDe(A.id)).status === "em_andamento", await statusDe(A.id));
  await enviar(A.fases[1].id);
  check("2 de 3 → continua Em andamento", (await statusDe(A.id)).status === "em_andamento");
  await enviar(A.fases[2].id);
  const a3 = await statusDe(A.id);
  check("as 3 enviadas → Entregue, com data de entrega", a3.status === "entregue" && a3.entregueEm != null, a3);
  await desfazerEnvioEtapa({ etapaId: A.fases[2].id, userId: pj.id, notificar });
  const a4 = await statusDe(A.id);
  check("desfazer uma → volta a Em andamento e limpa a data", a4.status === "em_andamento" && a4.entregueEm == null, a4);
  await enviar(A.fases[2].id);

  await prisma.$transaction(async (tx) =>
    liberarPagamentosDaFase(tx, { disciplina: await comResp(A.id), faseId: A.fases[0].id, autorId: admin.id, agora: new Date() }),
  );
  check("1ª fase aprovada, outras entregues → Entregue", (await statusDe(A.id)).status === "entregue");

  // Aprovação da disciplina inteira (o que `validarEntrega` faz): grava aprovado e libera as fases que faltam.
  await prisma.$transaction(async (tx) => {
    await tx.disciplina.updateMany({ where: { id: A.id, status: { not: "aprovado" } }, data: { status: "aprovado", entregueEm: new Date() } });
    await liberarPagamentosProjetista(tx, { disciplina: await comResp(A.id), autorId: admin.id, agora: new Date() });
  });
  const fasesA = await Promise.all(A.fases.map((f) => faseDe(f.id)));
  check("aprovação global: disciplina e as 3 fases aprovadas", (await statusDe(A.id)).status === "aprovado" && fasesA.every((f) => f.status === "aprovado" && f.liberadaEm != null), fasesA);
  const pagA = await pagamentos(A.id);
  check("aprovação global: 1 pagamento por fase", pagA === 3, pagA);

  // Reabertura (o que `reabrirDisciplina` faz com fases): a fase que define o prazo volta a revisão.
  await prisma.$transaction(async (tx) => {
    await marcarFaseEmRevisao(tx, A.id, null);
    await tx.disciplina.update({ where: { id: A.id }, data: { status: "em_revisao" } });
    await recalcularStatusDisciplina(tx, A.id, { autorId: admin.id, motivo: "smoke: reabertura" });
  });
  const fasesReab = await Promise.all(A.fases.map((f) => faseDe(f.id)));
  check("reabrir: disciplina Em revisão", (await statusDe(A.id)).status === "em_revisao");
  check(
    "reabrir: só a última fase (sem prazo, maior ordem) em revisão, ainda liberada",
    fasesReab[2].status === "em_revisao" && fasesReab[2].liberadaEm != null && fasesReab[0].status === "aprovado",
    fasesReab,
  );
  check("reabrir: pagamentos intactos", (await pagamentos(A.id)) === pagA);

  // Projetista corrige e reenvia a fase em revisão → Entregue (aguarda a reaprovação).
  await enviar(A.fases[2].id);
  check("fase em revisão reenviada → disciplina Entregue", (await statusDe(A.id)).status === "entregue");

  // Reaprovação global (ramo `jaTemPagamento`): fases pendentes a aprovado sem pagamento novo.
  await prisma.$transaction(async (tx) => {
    await tx.disciplina.update({ where: { id: A.id }, data: { status: "aprovado", entregueEm: new Date() } });
    await aprovarFasesSemPagamento(tx, A.id, new Date());
    await recalcularStatusDisciplina(tx, A.id, { autorId: admin.id, motivo: "smoke: reaprovação" });
  });
  check("reaprovar: disciplina e fases aprovadas", (await statusDe(A.id)).status === "aprovado" && (await faseDe(A.fases[2].id)).status === "aprovado");
  check("reaprovar: nenhum pagamento novo", (await pagamentos(A.id)) === pagA);

  // Apontamentos em disciplina aprovada, no documento da 2ª fase.
  await prisma.$transaction(async (tx) => {
    await marcarFaseEmRevisao(tx, A.id, fasesCat[1].id);
    await recalcularStatusDisciplina(tx, A.id, { autorId: admin.id, motivo: "smoke: apontamentos" });
  });
  check("apontamentos na aprovada: a fase DO DOCUMENTO em revisão", (await faseDe(A.fases[1].id)).status === "em_revisao" && (await faseDe(A.fases[2].id)).status === "aprovado");
  check("apontamentos na aprovada: disciplina Em revisão", (await statusDe(A.id)).status === "em_revisao");

  // ── B. 100% CLT: aprovar a disciplina inteira aprova as fases (antes saía cedo, sem tocar nelas) ────
  const B = await novaDisciplina("Hidráulica", { resp: clt.id, fases: ["entregue", "aguardando"] });
  await prisma.$transaction(async (tx) => {
    await tx.disciplina.updateMany({ where: { id: B.id }, data: { status: "aprovado", entregueEm: new Date() } });
    await liberarPagamentosProjetista(tx, { disciplina: await comResp(B.id), autorId: admin.id, agora: new Date() });
  });
  const fasesB = await Promise.all(B.fases.map((f) => faseDe(f.id)));
  check(
    "CLT: as fases são liberadas com R$ 0 e aprovadas",
    fasesB.every((f) => f.status === "aprovado" && f.liberadaEm != null && Number(f.valorPagamento) === 0),
    fasesB,
  );
  check("CLT: disciplina aprovada e sem pagamento", (await statusDe(B.id)).status === "aprovado" && (await pagamentos(B.id)) === 0);

  // ── C. Paga inteira antes das fases: aprovado não cai; reabrir/reaprovar funcionam ────────────────
  const C = await novaDisciplina("Elétrica", { resp: pj.id, status: "aprovado", fases: ["aguardando", "aguardando"] });
  const rc = await prisma.$transaction((tx) => recalcularStatusDisciplina(tx, C.id, { autorId: null, motivo: "smoke" }));
  check("aprovada com fases aguardando continua aprovada (regra 4)", !rc.mudou && rc.depois === "aprovado", rc);
  await prisma.$transaction(async (tx) => {
    await marcarFaseEmRevisao(tx, C.id, null);
    await recalcularStatusDisciplina(tx, C.id, { autorId: null, motivo: "smoke: reabertura" });
  });
  check("reabrir a paga inteira: fase aguardando vai a revisão e a disciplina também", (await statusDe(C.id)).status === "em_revisao");
  await prisma.$transaction(async (tx) => {
    await tx.disciplina.update({ where: { id: C.id }, data: { status: "aprovado" } });
    await aprovarFasesSemPagamento(tx, C.id, new Date());
    await recalcularStatusDisciplina(tx, C.id, { autorId: null, motivo: "smoke: reaprovação" });
  });
  const fasesC = await Promise.all(C.fases.map((f) => faseDe(f.id)));
  check(
    "reaprovar a paga inteira: todas as fases aprovadas, nenhuma liberada",
    (await statusDe(C.id)).status === "aprovado" && fasesC.every((f) => f.status === "aprovado" && f.liberadaEm == null),
    fasesC,
  );

  // ── D. Apontamentos em disciplina NÃO aprovada (ponto 5) ─────────────────────────────────────────
  const D = await novaDisciplina("Incêndio", { resp: pj.id, status: "entregue", fases: ["entregue", "aguardando"] });
  const devolveu = await prisma.$transaction(async (tx) => {
    const a = await devolverFaseEntregueParaRevisao(tx, D.id, fasesCat[0].id);
    const b = await devolverFaseEntregueParaRevisao(tx, D.id, fasesCat[1].id);
    await recalcularStatusDisciplina(tx, D.id, { autorId: null, motivo: "smoke: apontamentos" });
    return [a, b];
  });
  check("apontamentos: só a fase entregue volta a revisão", devolveu[0] && !devolveu[1] && (await faseDe(D.fases[1].id)).status === "aguardando", devolveu);
  check("apontamentos: disciplina Em revisão", (await statusDe(D.id)).status === "em_revisao");

  // ── E. Sem fase: continua manual ────────────────────────────────────────────────────────────────
  const E = await novaDisciplina("Climatização", { resp: pj.id, status: "em_andamento", fases: [] });
  const re = await prisma.$transaction((tx) => recalcularStatusDisciplina(tx, E.id, { autorId: null, motivo: "smoke" }));
  check("sem fase: não deriva nem muda", !re.derivado && !re.mudou && (await statusDe(E.id)).status === "em_andamento", re);

  // ── F. Prévia da migração: acha a divergente e não grava ──────────────────────────────────────────
  const F = await novaDisciplina("PPCI", { resp: pj.id, status: "em_revisao", fases: ["aguardando"] });
  const previa = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return disciplinasComStatusDivergente(tx, { projetoId: projeto.id });
  });
  check(
    "prévia: só o card do print (Em revisão com a fase aguardando) diverge → Aguardando",
    previa.length === 1 && previa[0].disciplinaId === F.id && previa[0].para === "aguardando",
    previa.map((p) => [p.disciplina, p.de, p.para]),
  );
  check("prévia não gravou", (await statusDe(F.id)).status === "em_revisao");

  // ── G. Corrida: duas fases enviadas ao mesmo tempo terminam com o status que considera as duas ───
  let corridasOk = 0;
  for (let i = 0; i < 5; i++) {
    const G = await novaDisciplina(`Corrida ${i}`, { resp: pj.id, fases: ["aguardando", "aguardando"] });
    await Promise.all(G.fases.map((f) => enviar(f.id)));
    if ((await statusDe(G.id)).status === "entregue") corridasOk++;
  }
  check("corrida: 5 de 5 disciplinas Entregue depois de dois envios simultâneos", corridasOk === 5, corridasOk);

  const auditoria = await prisma.auditLog.count({ where: { acao: "status-derivado-das-fases", entidadeId: { in: discIds } } });
  check("cada mudança derivada deixou AuditLog", auditoria > 0, auditoria);

  // Limpeza — lançamentos antes dos pagamentos, pagamentos antes das fases (FK).
  const pagIds = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: { in: discIds } }, select: { id: true } })).map((p) => p.id);
  await prisma.lancamento.deleteMany({ where: { pagamentoProjetistaId: { in: pagIds } } });
  await prisma.pagamentoProjetista.deleteMany({ where: { id: { in: pagIds } } });
  await prisma.auditLog.deleteMany({ where: { acao: "status-derivado-das-fases", entidadeId: { in: discIds } } });
  await prisma.disciplinaEtapa.deleteMany({ where: { disciplinaId: { in: discIds } } });
  await prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId: { in: discIds } } });
  await prisma.disciplina.deleteMany({ where: { id: { in: discIds } } });
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pj.id, clt.id] } } });

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
