/**
 * Smoke do pagamento por fase (F7.4 — D31/D38) contra o banco de dev. Exercita o I/O que o
 * vitest de `pagamento-fase.ts` não alcança: a liberação grava o pool congelado na fase, cria
 * um pagamento por PJ com `etapaId` e a despesa prevista com a sigla; o valor da disciplina só
 * mexe nas fases pendentes; o ajuste na Produção anda o total pela diferença; aprovar a
 * disciplina inteira libera as fases que faltam e fecha no centavo; e o banco recusa apagar
 * fase com pagamento. F7.0: concluir o marco ligado à fase oferece a MESMA liberação — e só quando
 * a fase está entregue e ainda não liberada. L3: a fila "Fases a aprovar" traz a fase entregue e ainda não
 * liberada, e deixa de fora a de disciplina que já pagou inteira e a fase que já foi liberada.
 *
 * Uso: npm run smoke:pagamento-fase
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  liberarPagamentosDaFase,
  liberarPagamentosProjetista,
  sincronizarPagamentosDisciplina,
  sincronizarValorDisciplina,
  situacaoPagamento,
} from "../src/modules/uploads/pagamento";
import { MOTIVO_JA_PAGA_INTEIRA } from "../src/modules/uploads/pagamento-fase";
import { INCLUDE_PAGAMENTO, comLancamentos } from "../src/modules/financeiro/folha/queries";
import { disciplinasForaDeSLA, fasesAAprovar } from "../src/modules/projetos/queries";
import { registrarExecucaoNaLinha } from "../src/modules/planejamento/execucao-service";
import { paraDia } from "../src/modules/planejamento/agenda";
import { inicioDoDiaUtc } from "../src/lib/data";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-fase-${Date.now()}`;
const soma = (xs: { valor: unknown }[]) => Math.round(xs.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const fasesCat = await prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    take: 3,
    select: { id: true, sigla: true },
  });
  if (fasesCat.length < 3) throw new Error("O catálogo de fases do dev tem menos de 3 fases ativas.");

  const pjA = await prisma.user.create({ data: { name: `${tag}-A`, email: `${tag}-a@teste.local`, role: "projetista_pj", emailVerified: false } });
  const pjB = await prisma.user.create({ data: { name: `${tag}-B`, email: `${tag}-b@teste.local`, role: "freelancer", emailVerified: false } });
  const clt = await prisma.user.create({ data: { name: `${tag}-C`, email: `${tag}-c@teste.local`, role: "clt", emailVerified: false } });
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
  const disciplina = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      disciplinaTextoLegado: "Estrutural",
      valor: 10000,
      responsaveis: { create: [{ userId: pjA.id }, { userId: pjB.id }, { userId: clt.id }] },
    },
  });
  const [bs, ex, ab] = await Promise.all(
    [40, 35, 20].map((percentual, ordem) =>
      prisma.disciplinaEtapa.create({
        data: { disciplinaId: disciplina.id, etapaId: fasesCat[ordem].id, percentual, ordem, status: "entregue" },
      }),
    ),
  );
  const siglaBS = fasesCat[0].sigla;

  const comResp = async () =>
    prisma.disciplina.findUniqueOrThrow({
      where: { id: disciplina.id },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });
  const liberar = async (faseId: string) =>
    prisma.$transaction(async (tx) =>
      liberarPagamentosDaFase(tx, { disciplina: await comResp(), faseId, autorId: admin.id, agora: new Date() }),
    );
  const pagamentosDe = (etapaId: string) =>
    prisma.pagamentoProjetista.findMany({ where: { etapaId, status: { not: "cancelado" } }, orderBy: { valor: "desc" } });

  // 1) Soma ≠ 100 → recusa, dizendo onde ajustar. Nada gravado.
  const e1 = await erroDe(() => liberar(bs.id));
  check("soma 95% é recusada com o caminho da correção", !!e1 && /somam 95%/.test(e1) && /Etapas/.test(e1), e1);
  check("recusa não liberou nada", (await prisma.pagamentoProjetista.count({ where: { disciplinaId: disciplina.id } })) === 0);
  await prisma.disciplinaEtapa.update({ where: { id: ab.id }, data: { percentual: 25 } });

  // 2) Libera o Básico: 40% de 10000, dividido entre os 2 PJ (o CLT não recebe por entrega).
  const r2 = await liberar(bs.id);
  const pBS = await pagamentosDe(bs.id);
  check("Básico: 2 pagamentos (só os PJ/freelancer)", pBS.length === 2 && r2.pagaveis.length === 2, pBS.length);
  check("Básico: 2000 + 2000", pBS.every((p) => Number(p.valor) === 2000), pBS.map((p) => Number(p.valor)));
  const bsDepois = await prisma.disciplinaEtapa.findUniqueOrThrow({ where: { id: bs.id } });
  check("fase congela pool 4000, liberada e aprovada", Number(bsDepois.valorPagamento) === 4000 && bsDepois.liberadaEm != null && bsDepois.status === "aprovado");
  const lancBS = await prisma.lancamento.findMany({ where: { pagamentoProjetistaId: { in: pBS.map((p) => p.id) } } });
  check(
    `despesa prevista nomeia a fase ("Estrutural · ${siglaBS}")`,
    lancBS.length === 2 && lancBS.every((l) => l.status === "previsto" && l.descricao.includes(`Estrutural · ${siglaBS}`)),
    lancBS.map((l) => l.descricao),
  );
  const sit2 = await situacaoPagamento(prisma, disciplina.id);
  check("modo fixado em 'fase', ainda falta liberar", sit2.modo === "fase" && !sit2.jaLiberouTudo, sit2);

  // 2b) Com o Básico liberado e o resto pendente, a disciplina entregue há 30 dias continua
  // "aguardando validação" — antes da F7.4 o filtro era "não tem pagamento" e ela sumiria do SLA.
  await prisma.disciplina.update({
    where: { id: disciplina.id },
    data: { status: "entregue", entregueEm: new Date(Date.now() - 30 * 86_400_000) },
  });
  const viewer = { id: admin.id, role: "admin" as const, superUsuario: true, escopoGlobalPerfil: true };
  const sla = await disciplinasForaDeSLA(viewer);
  check("SLA: fase parcial continua aguardando validação", sla.some((d) => d.id === disciplina.id));
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { status: "aguardando", entregueEm: null } });

  // 3) Idempotente: liberar de novo não cria nada.
  const r3 = await liberar(bs.id);
  check("segunda liberação da mesma fase é no-op", r3.jaLiberada && (await pagamentosDe(bs.id)).length === 2);

  // 4) Produção mostra "Estrutural · SIGLA".
  const linhas = await comLancamentos(
    await prisma.pagamentoProjetista.findMany({ where: { etapaId: bs.id }, include: INCLUDE_PAGAMENTO }),
  );
  check("Produção: rótulo com a sigla da fase", linhas.every((l) => l.rotuloDisciplina === `Estrutural · ${siglaBS}`), linhas.map((l) => l.rotuloDisciplina));

  // 5) Valor da disciplina muda → só as pendentes sentem; o Básico congelado não mexe.
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 12000 } });
  await prisma.$transaction(async (tx) => {
    await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
  });
  check("valor novo não mexe na fase liberada", soma(await pagamentosDe(bs.id)) === 4000);

  // 6) Valor abaixo do já liberado → recusa.
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 3000 } });
  const e6 = await erroDe(() =>
    prisma.$transaction(async (tx) => {
      await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
    }),
  );
  check("valor abaixo do liberado é recusado", !!e6 && /abaixo do já liberado/.test(e6), e6);
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 12000 } });

  // 7) Ajuste na Produção (+500 no pagamento do A, no Básico): o total anda pela diferença.
  const alvo = (await pagamentosDe(bs.id))[0];
  await prisma.$transaction(async (tx) => {
    await tx.pagamentoProjetista.update({ where: { id: alvo.id }, data: { valor: 2500 } });
    await tx.lancamento.updateMany({ where: { pagamentoProjetistaId: alvo.id }, data: { valor: 2500 } });
    await sincronizarValorDisciplina(tx, disciplina.id, alvo.etapaId);
  });
  const d7 = await prisma.disciplina.findUniqueOrThrow({ where: { id: disciplina.id }, select: { valor: true } });
  const bs7 = await prisma.disciplinaEtapa.findUniqueOrThrow({ where: { id: bs.id }, select: { valorPagamento: true } });
  check("write-back por fase: pool do Básico 4500, disciplina 12500", Number(bs7.valorPagamento) === 4500 && Number(d7.valor) === 12500, {
    pool: Number(bs7.valorPagamento),
    valor: Number(d7.valor),
  });

  // 8) Aprovar a disciplina inteira libera as fases que faltam: o que falta (8000) reparte 35:25.
  await prisma.$transaction(async (tx) =>
    liberarPagamentosProjetista(tx, { disciplina: await comResp(), autorId: admin.id, agora: new Date() }),
  );
  const [pEX, pAB] = await Promise.all([pagamentosDe(ex.id), pagamentosDe(ab.id)]);
  check("Executivo: 4666,67 (35/60 de 8000)", soma(pEX) === 4666.67, soma(pEX));
  check("As-built: 3333,33 (a última absorve o centavo)", soma(pAB) === 3333.33, soma(pAB));
  const vivos = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id, status: { not: "cancelado" } } });
  check("soma de todos os pagamentos = valor da disciplina (12500)", soma(vivos) === 12500, soma(vivos));
  check("nenhum pagamento sem fase (um modo só)", vivos.every((p) => p.etapaId != null));
  check("nenhum pagamento de R$ 0,00", vivos.every((p) => Number(p.valor) > 0));
  const sit8 = await situacaoPagamento(prisma, disciplina.id);
  check("tudo liberado: reaprovação não gera de novo", sit8.jaLiberouTudo, sit8);

  // 9) Tudo liberado: mudar o total manda para a Produção.
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 13000 } });
  const e9 = await erroDe(() =>
    prisma.$transaction(async (tx) => {
      await sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId: admin.id });
    }),
  );
  check("com todas liberadas, mudar o total é recusado", !!e9 && /Produção/.test(e9), e9);
  await prisma.disciplina.update({ where: { id: disciplina.id }, data: { valor: 12500 } });

  // 10) O banco recusa apagar fase com pagamento (FK NoAction) — a action recusa antes, com texto.
  const e10 = await erroDe(() => prisma.disciplinaEtapa.delete({ where: { id: bs.id } }));
  check("FK impede apagar fase com pagamento", e10 != null);

  // 11) Disciplina que já pagou inteira não libera por fase depois.
  const disc2 = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      disciplinaTextoLegado: "Hidráulica",
      valor: 1000,
      responsaveis: { create: [{ userId: pjA.id }] },
    },
  });
  const comResp2 = () =>
    prisma.disciplina.findUniqueOrThrow({
      where: { id: disc2.id },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });
  await prisma.$transaction(async (tx) =>
    liberarPagamentosProjetista(tx, { disciplina: await comResp2(), autorId: admin.id, agora: new Date() }),
  );
  const fase2 = await prisma.disciplinaEtapa.create({
    data: { disciplinaId: disc2.id, etapaId: fasesCat[0].id, percentual: 100, ordem: 0, status: "entregue" },
  });
  const e11 = await erroDe(() =>
    prisma.$transaction(async (tx) =>
      liberarPagamentosDaFase(tx, { disciplina: await comResp2(), faseId: fase2.id, autorId: admin.id, agora: new Date() }),
    ),
  );
  check("pagou inteira → não libera por fase", e11 === MOTIVO_JA_PAGA_INTEIRA, e11);
  const fila1 = await fasesAAprovar(viewer, true);
  check("L3: fase de disciplina que pagou inteira fica fora da fila de fases a aprovar", !fila1.some((f) => f.id === fase2.id), fila1.map((f) => f.id));

  // 12) 100% CLT com fases que não fecham: aprovar a disciplina não trava nem cria pagamento.
  const disc3 = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      disciplinaTextoLegado: "Elétrica",
      valor: null,
      responsaveis: { create: [{ userId: clt.id }] },
    },
  });
  const fase3 = await prisma.disciplinaEtapa.create({
    data: { disciplinaId: disc3.id, etapaId: fasesCat[0].id, percentual: 30, ordem: 0, status: "entregue" },
  });
  const e12 = await erroDe(() =>
    prisma.$transaction(async (tx) =>
      liberarPagamentosProjetista(tx, {
        disciplina: await prisma.disciplina.findUniqueOrThrow({
          where: { id: disc3.id },
          select: {
            id: true,
            disciplinaTextoLegado: true,
            valor: true,
            responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
            projeto: { select: { id: true, codigo: true } },
          },
        }),
        autorId: admin.id,
        agora: new Date(),
      }),
    ),
  );
  check("100% CLT: aprova sem pagamento, mesmo com % que não fecha", e12 === null && (await prisma.pagamentoProjetista.count({ where: { disciplinaId: disc3.id } })) === 0, e12);

  // 13) F7.0 — marco da fase: concluir oferece aprovar, pelo mesmo caminho de liberação.
  const hoje = paraDia(inicioDoDiaUtc());
  const disc4 = await prisma.disciplina.create({
    data: { projetoId: projeto.id, disciplinaTextoLegado: "Fundação", valor: 1000, responsaveis: { create: [{ userId: pjA.id }] } },
  });
  const fase4 = await prisma.disciplinaEtapa.create({
    data: { disciplinaId: disc4.id, etapaId: fasesCat[0].id, percentual: 100, ordem: 0, status: "em_andamento" },
  });
  const marco = await prisma.eapTarefa.create({
    data: {
      projetoId: projeto.id,
      disciplinaId: disc4.id,
      etapaId: fasesCat[0].id,
      nome: "Entrega do Básico",
      tipoEap: "mrc",
      duracaoDias: 0,
      inicioPrevisto: new Date(`${hoje}T00:00:00.000Z`),
      fimPrevisto: new Date(`${hoje}T00:00:00.000Z`),
    },
  });
  const ex1 = await registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: hoje, hoje });
  const m1 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: marco.id }, select: { status: true, progresso: true, inicioReal: true, fimReal: true } });
  check("marco concluído: status con, 100%, início = término", m1.status === "con" && m1.progresso === 100 && m1.inicioReal?.getTime() === m1.fimReal?.getTime(), m1);
  check("fase ainda não entregue: oferecida, mas não aprovável", ex1.fase?.id === fase4.id && ex1.fase.aprovavel === false, ex1.fase);
  check("concluir o marco NÃO libera pagamento sozinho", (await prisma.pagamentoProjetista.count({ where: { disciplinaId: disc4.id } })) === 0);

  const reaberto = await registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: null, hoje });
  check("reabrir o marco: não iniciado, sem oferta", reaberto.status === "nin" && reaberto.fase === null, reaberto);
  await prisma.disciplinaEtapa.update({ where: { id: fase4.id }, data: { status: "entregue" } });
  const ex2 = await registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: hoje, hoje });
  check("fase entregue: marco concluído oferece aprovar", ex2.fase?.aprovavel === true, ex2.fase);
  const fila2 = await fasesAAprovar(viewer, true);
  const daFila = fila2.find((f) => f.id === fase4.id);
  check("L3: fase entregue e não liberada entra na fila, com disciplina, projeto e sigla", !!daFila && daFila.status === "entregue" && daFila.projetoId === projeto.id && !!daFila.sigla, daFila);
  check("L3: fase de disciplina só com CLT também entra (aprova-se sem pagamento)", fila2.some((f) => f.id === fase3.id));
  const deFora = await fasesAAprovar({ id: "sem-vinculo-nenhum", role: "projetista_pj" as const, superUsuario: false, escopoGlobalPerfil: false }, false);
  check("L3: quem não é da disciplina nem do projeto não vê a fila dela (muralha)", deFora.length === 0, deFora.map((f) => f.id));
  const doResponsavel = await fasesAAprovar({ id: pjA.id, role: "projetista_pj" as const, superUsuario: false, escopoGlobalPerfil: false }, false);
  check("L3: o responsável da disciplina vê a fase dela, e só a dele", doResponsavel.some((f) => f.id === fase4.id) && !doResponsavel.some((f) => f.id === fase3.id), doResponsavel.map((f) => f.id));
  // A tela chama aprovarEtapaDisciplina → liberarPagamentosDaFase: o MESMO caminho da F7.4.
  await prisma.$transaction(async (tx) =>
    liberarPagamentosDaFase(tx, {
      disciplina: await prisma.disciplina.findUniqueOrThrow({
        where: { id: disc4.id },
        select: {
          id: true,
          disciplinaTextoLegado: true,
          valor: true,
          responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
          projeto: { select: { id: true, codigo: true } },
        },
      }),
      faseId: ex2.fase!.id,
      autorId: admin.id,
      agora: new Date(),
    }),
  );
  check("aprovada pelo marco: 1 pagamento de 1000 com a fase", soma(await pagamentosDe(fase4.id)) === 1000);
  check("L3: fase liberada sai da fila", !(await fasesAAprovar(viewer, true)).some((f) => f.id === fase4.id));
  await registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: null, hoje });
  const ex3 = await registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: hoje, hoje });
  check("fase já liberada: concluir o marco de novo não oferece nada", ex3.fase === null, ex3.fase);

  const amanha = paraDia(new Date(inicioDoDiaUtc().getTime() + 86_400_000));
  const eFuturo = await erroDe(() => registrarExecucaoNaLinha({ id: marco.id, inicioReal: null, fimReal: amanha, hoje }));
  check("data real no futuro é recusada", !!eFuturo && /futuro/.test(eFuturo), eFuturo);

  // Limpeza — pagamentos antes das fases (FK), lançamentos antes dos pagamentos.
  await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
  const discIds = [disciplina.id, disc2.id, disc3.id, disc4.id];
  const pagIds = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: { in: discIds } }, select: { id: true } })).map((p) => p.id);
  await prisma.lancamento.deleteMany({ where: { pagamentoProjetistaId: { in: pagIds } } });
  await prisma.pagamentoProjetista.deleteMany({ where: { id: { in: pagIds } } });
  await prisma.disciplinaEtapa.deleteMany({ where: { disciplinaId: { in: discIds } } });
  await prisma.disciplina.deleteMany({ where: { id: { in: discIds } } });
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pjA.id, pjB.id, clt.id] } } });

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
