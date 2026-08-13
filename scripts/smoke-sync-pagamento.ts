/**
 * Smoke da sincronização de pagamentos de projetista contra o banco de dev. Exercita o
 * que vitest não alcança: o I/O de `sincronizarPagamentosDisciplina` — criar o lançamento
 * que faltava numa linha de R$ 0,00, cancelar quem saiu da disciplina, soltar o cancelado
 * do lote e recalcular `FolhaProjetista.total` (agregado gravado). Bloco 7 cobre F4
 * (edição direta na folha) + `sincronizarValorDisciplina`: sem o write-back, editar um
 * pagamento e depois trocar o responsável da disciplina cancelaria o ajuste em silêncio.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-sync-pagamento.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  sincronizarPagamentosDisciplina,
  sincronizarPagamentosPorDisciplinaId,
  sincronizarValorDisciplina,
  liberarPagamentosProjetista,
} from "../src/modules/uploads/pagamento";
import { criarDespesaProjetistaPrevista } from "../src/modules/financeiro/custo/lancamento-custo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-sync-${Date.now()}`;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");

  // Lote throwaway vive no ano 2999 sob @@unique([ano, mes]): se um run anterior morreu
  // antes da limpeza, o resto ficaria travado no constraint. Limpa antes de começar.
  const orfaos = await prisma.folhaProjetista.findMany({ where: { ano: 2999 }, select: { id: true } });
  if (orfaos.length > 0) {
    const ids = orfaos.map((f) => f.id);
    await prisma.pagamentoProjetista.updateMany({ where: { folhaId: { in: ids } }, data: { folhaId: null } });
    await prisma.folhaProjetista.deleteMany({ where: { id: { in: ids } } });
  }

  // Dois projetistas PJ throwaway.
  const pjA = await prisma.user.create({
    data: { name: `${tag}-A`, email: `${tag}-a@teste.local`, role: "projetista_pj", emailVerified: false },
  });
  const pjB = await prisma.user.create({
    data: { name: `${tag}-B`, email: `${tag}-b@teste.local`, role: "projetista_pj", emailVerified: false },
  });

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

  // Disciplina concluída SEM valor — reproduz a origem das linhas de R$ 0,00.
  const disciplina = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      nome: "Estrutural",
      valor: null,
      responsaveis: { create: [{ userId: pjA.id }, { userId: pjB.id }] },
    },
  });

  const comResp = async () =>
    (await prisma.disciplina.findUniqueOrThrow({
      where: { id: disciplina.id },
      select: {
        id: true,
        nome: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    }));

  // 1) Liberação sem valor → dois pagamentos de R$ 0,00, nenhum lançamento.
  await prisma.$transaction(async (tx) => {
    await liberarPagamentosProjetista(tx, { disciplina: await comResp(), autorId: admin.id, agora: new Date() });
  });
  let pags = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id } });
  check("liberação sem valor cria 2 pagamentos", pags.length === 2, pags.length);
  check("pagamentos nascem zerados", pags.every((p) => Number(p.valor) === 0));
  check("nenhum lançamento para valor zero", pags.every((p) => p.lancamentoId === null));

  // 2) Vincula a um lote fechado, como jul/2026 na produção.
  const folha = await prisma.folhaProjetista.create({
    data: { ano: 2999, mes: 12, status: "fechada", fechadaEm: new Date(), total: 0 },
  });
  await prisma.pagamentoProjetista.updateMany({
    where: { disciplinaId: disciplina.id },
    data: { folhaId: folha.id },
  });

  // 3) Corrige o valor da disciplina → sincroniza.
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 1000 } });
  await prisma.$transaction(async (tx) => {
    await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
  });
  pags = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id } });
  check("valor rateado entre os 2 pagáveis", pags.every((p) => Number(p.valor) === 500), pags.map((p) => Number(p.valor)));
  check("lançamento criado onde faltava", pags.every((p) => p.lancamentoId !== null));
  const lancs = await prisma.lancamento.findMany({
    where: { pagamentoProjetistaId: { in: pags.map((p) => p.id) } },
  });
  check("lançamentos previstos com o valor certo", lancs.length === 2 && lancs.every((l) => Number(l.valor) === 500 && l.status === "previsto"));
  let f = await prisma.folhaProjetista.findUniqueOrThrow({ where: { id: folha.id } });
  check("total do lote recalculado (1000)", Number(f.total) === 1000, Number(f.total));

  // 4) Remove um responsável → pendente cancelado, solto do lote, lançamento cancelado.
  await prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId: disciplina.id, userId: pjB.id } });
  await prisma.$transaction(async (tx) => {
    await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
  });
  const pagB = await prisma.pagamentoProjetista.findFirstOrThrow({ where: { disciplinaId: disciplina.id, projetistaId: pjB.id } });
  const pagA = await prisma.pagamentoProjetista.findFirstOrThrow({ where: { disciplinaId: disciplina.id, projetistaId: pjA.id } });
  check("pagamento do removido cancelado", pagB.status === "cancelado", pagB.status);
  check("cancelado sai do lote", pagB.folhaId === null, pagB.folhaId);
  check("remanescente recebe o pool inteiro", Number(pagA.valor) === 1000, Number(pagA.valor));
  const lancB = await prisma.lancamento.findFirstOrThrow({ where: { pagamentoProjetistaId: pagB.id } });
  check("lançamento do removido cancelado", lancB.status === "cancelado", lancB.status);
  f = await prisma.folhaProjetista.findUniqueOrThrow({ where: { id: folha.id } });
  check("total do lote reflete só o remanescente (1000)", Number(f.total) === 1000, Number(f.total));

  // 5) Zerar o valor CANCELA o pendente em vez de gravar R$ 0,00.
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: null } });
  await prisma.$transaction(async (tx) => {
    await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
  });
  const pagAdepois = await prisma.pagamentoProjetista.findUniqueOrThrow({ where: { id: pagA.id } });
  check("valor limpo cancela o pendente", pagAdepois.status === "cancelado", pagAdepois.status);
  f = await prisma.folhaProjetista.findUniqueOrThrow({ where: { id: folha.id } });
  check("lote zera após cancelar tudo", Number(f.total) === 0, Number(f.total));

  // 6) Pagamento efetivado congela a disciplina.
  await prisma.pagamentoProjetista.update({ where: { id: pagA.id }, data: { status: "pago", pagoEm: new Date() } });
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 2000 } });
  let recusou = false;
  try {
    await prisma.$transaction(async (tx) => {
      await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
    });
  } catch (e) {
    recusou = /pagamento efetivado/i.test((e as Error).message);
  }
  check("recusa alterar disciplina com pagamento efetivado", recusou);

  // 7) F4 (edição direta na folha) + write-back — a sequência exata do risco: editar
  // via F4 NÃO deve ser desfeito na próxima sincronização por responsáveis, porque
  // sincronizarValorDisciplina mantém Disciplina.valor == soma dos pagamentos vivos.
  const pjC = await prisma.user.create({
    data: { name: `${tag}-C`, email: `${tag}-c@teste.local`, role: "projetista_pj", emailVerified: false },
  });
  const pjD = await prisma.user.create({
    data: { name: `${tag}-D`, email: `${tag}-d@teste.local`, role: "projetista_pj", emailVerified: false },
  });
  const disc2 = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      nome: "Elétrica",
      valor: null,
      responsaveis: { create: [{ userId: pjC.id }] },
    },
  });
  const comResp2 = async () =>
    (await prisma.disciplina.findUniqueOrThrow({
      where: { id: disc2.id },
      select: {
        id: true,
        nome: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    }));

  await prisma.$transaction(async (tx) => {
    await liberarPagamentosProjetista(tx, { disciplina: await comResp2(), autorId: admin.id, agora: new Date() });
  });
  const pagC = await prisma.pagamentoProjetista.findFirstOrThrow({ where: { disciplinaId: disc2.id } });
  check("F4 setup: liberado zerado, como a tela de produção", Number(pagC.valor) === 0);

  // Edição direta (o mesmo que `editarPagamentoProjetista` faz, sem a casca da action —
  // scripts não têm sessão para chamar a action com "use server" diretamente).
  await prisma.$transaction(async (tx) => {
    await tx.pagamentoProjetista.update({ where: { id: pagC.id }, data: { valor: 1500 } });
    const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
      pagamentoId: pagC.id,
      valor: 1500,
      tipoProfissional: pagC.tipoProfissional,
      projetistaNome: `${tag}-C`,
      disciplinaNome: "Elétrica",
      projetoId: projeto.id,
      projetoCodigo: projeto.codigo,
      autorId: admin.id,
      quando: new Date(),
    });
    await tx.pagamentoProjetista.update({ where: { id: pagC.id }, data: { lancamentoId } });
    await sincronizarValorDisciplina(tx, disc2.id);
  });
  const discAtual = await prisma.disciplina.findUniqueOrThrow({ where: { id: disc2.id } });
  check("write-back: Disciplina.valor acompanha o pagamento editado", Number(discAtual.valor) === 1500, Number(discAtual.valor));

  // Troca de responsável (o gatilho real: editarDisciplina/definirResponsaveis chamariam
  // sincronizarPagamentosPorDisciplinaId neste ponto).
  await prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId: disc2.id, userId: pjC.id } });
  await prisma.disciplinaResponsavel.create({ data: { disciplinaId: disc2.id, userId: pjD.id } });
  await prisma.$transaction(async (tx) => {
    await sincronizarPagamentosPorDisciplinaId(tx, disc2.id, admin.id);
  });
  const pagCdepois = await prisma.pagamentoProjetista.findUniqueOrThrow({ where: { id: pagC.id } });
  const pagD = await prisma.pagamentoProjetista.findFirstOrThrow({ where: { disciplinaId: disc2.id, projetistaId: pjD.id } });
  check(
    "sem write-back isto cancelaria por engano — com ele, o novo responsável HERDA os 1500 (não 0)",
    Number(pagD.valor) === 1500,
    Number(pagD.valor),
  );
  check("responsável trocado tem o pagamento antigo cancelado (correto, não é o bug)", pagCdepois.status === "cancelado");

  // Limpeza (bloco 7)
  const ids2 = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disc2.id }, select: { id: true } })).map((p) => p.id);
  await prisma.lancamento.deleteMany({ where: { pagamentoProjetistaId: { in: ids2 } } });
  await prisma.pagamentoProjetista.deleteMany({ where: { disciplinaId: disc2.id } });
  await prisma.disciplina.delete({ where: { id: disc2.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pjC.id, pjD.id] } } });

  // Limpeza
  const ids = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id }, select: { id: true } })).map((p) => p.id);
  await prisma.lancamento.deleteMany({ where: { pagamentoProjetistaId: { in: ids } } });
  await prisma.pagamentoProjetista.deleteMany({ where: { disciplinaId: disciplina.id } });
  await prisma.folhaProjetista.delete({ where: { id: folha.id } });
  await prisma.disciplina.delete({ where: { id: disciplina.id } });
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pjA.id, pjB.id] } } });

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
