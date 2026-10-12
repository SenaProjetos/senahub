/**
 * Smoke da folha no Financeiro (R4 do rateio) contra o banco de dev. Cria e apaga os próprios dados,
 * nas competências de 2041 (isoladas de folha real).
 *
 *   1. Fechar folha com 2 CLT + 1 estagiário + totais: 7 contas (líquido, bolsa, INSS, IRRF, FGTS, VT,
 *      VR), cada uma na subcategoria pela chave; guias no dia 20 antecipado ao dia útil anterior.
 *   2. Reabrir sem motivo: recusado. Com motivo: versão do holerite assinado + reabertura gravadas.
 *   3. Fechar de novo com FGTS diferente: a MESMA conta muda de valor (nada nasce).
 *   4. IRRF sai da folha: a conta dele é cancelada pela máquina de situações, não apagada.
 *   5. FGTS pago pela baixa: reabrir é recusado.
 *   6. Mês fechado no Financeiro (N5): fechar a folha é recusado sem gravar nada.
 *
 * Uso: npm run smoke:folha-financeiro
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { paraCentavos } from "../src/modules/financeiro/liquidez/dinheiro";
import { baixarNoBanco } from "../src/modules/financeiro/lancamentos/baixa-service";
import { fecharFolhaNoBanco, MSG_MOTIVO_CURTO, reabrirFolhaNoBanco } from "../src/modules/rh/folha/fechamento-service";
import { hojeParaBanco } from "../src/lib/data";

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

const tag = `smoke-folha-fin-${Date.now()}`;
const ANO = 2041;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function main() {
  const mk = (n: string, contratacao: "clt" | "estagio") =>
    prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, tipo: "interno", emailVerified: false, contratacao }, select: { id: true } });
  const ana = await mk("ana", "clt");
  const beto = await mk("beto", "clt");
  const eva = await mk("eva", "estagio");
  const ids = [ana.id, beto.id, eva.id];
  const tabela = await prisma.tabelaEncargos.create({
    data: {
      contratacao: "clt",
      vigenciaEm: new Date(`${ANO}-06-01T00:00:00.000Z`),
      parametros: {
        tipo: "clt", fgtsBp: 800, multaFgtsBp: 4000, inssEmpresaBp: 0, reservaDecimoTerceiro: true, reservaFerias: true, reservaAvisoPrevio: false,
        beneficios: [{ nome: "Vale-transporte", valorCent: 20_000, suspensoNasFerias: false }, { nome: "Vale-refeição", valorCent: 50_000, suspensoNasFerias: false }],
      },
    },
  });
  // Estágio pelo IEL: a taxa (R$ 90 nesta tabela de teste) vira conta a pagar no fechamento (G3).
  const tabelaEst = await prisma.tabelaEncargos.create({
    data: { contratacao: "estagio", vigenciaEm: new Date(`${ANO}-06-01T00:00:00.000Z`), parametros: { tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 9_000 } },
  });
  await prisma.vinculo.create({ data: { userId: eva.id, contratacao: "estagio", setor: "engenharia", dataInicio: new Date(`${ANO}-01-01T00:00:00.000Z`), agenteIntegracao: "IEL" } });
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} conta`, tipo: "corrente", saldoInicial: 0 } });
  const fechamentoN5 = await prisma.fechamentoMensal.create({ data: { ano: ANO, mes: 8, status: "fechado", fechadoEm: new Date(), responsavelId: ana.id } });

  const folhaDe = async (mes: number, itens: { userId: string; proventos: number; descontos: number }[], totais = {}) => {
    const f = await prisma.folhaPagamento.create({ data: { ano: ANO, mes, tipo: "mensal", ...totais }, select: { id: true } });
    for (const i of itens) {
      const h = await prisma.holerite.create({ data: { folhaId: f.id, userId: i.userId }, select: { id: true } });
      await prisma.holeriteItem.createMany({
        data: [
          { holeriteId: h.id, descricao: `${tag} salário`, tipo: "provento", valor: i.proventos },
          { holeriteId: h.id, descricao: `${tag} INSS`, tipo: "desconto", valor: i.descontos },
        ],
      });
    }
    return f.id;
  };
  const partesDa = async (folhaId: string) => {
    const linhas = await prisma.folhaLancamento.findMany({ where: { folhaId } });
    const lancs = await prisma.lancamento.findMany({
      where: { id: { in: linhas.map((l) => l.lancamentoId) }, excluidoEm: { not: undefined } },
      select: { id: true, status: true, valor: true, vencimento: true, categoria: { select: { chave: true } } },
    });
    return linhas.map((l) => ({ ...l, lanc: lancs.find((x) => x.id === l.lancamentoId)! }));
  };

  try {
    // 1
    const folha = await folhaDe(
      6,
      [
        { userId: ana.id, proventos: 3300, descontos: 300 },
        { userId: beto.id, proventos: 2200, descontos: 200 },
        { userId: eva.id, proventos: 1000, descontos: 0 },
      ],
      { totalInssRetido: 500, totalIrrfRetido: 100, totalFgts: 400 },
    );
    const r1 = await fecharFolhaNoBanco(folha, ana.id);
    check("fecha com 8 contas (líquido + 7 partes, com a taxa do IEL)", r1.contas === 8, r1);
    const liq = await prisma.lancamento.findUnique({ where: { id: r1.lancamentoId ?? "" }, select: { valor: true, status: true, categoria: { select: { chave: true } } } });
    check("líquido só dos CLT (R$ 5.000) em Salários, em aberto", paraCentavos(liq?.valor ?? 0) === 500_000 && liq?.status === "previsto" && liq.categoria?.chave === "despesa_folha_salarios", liq);
    const p1 = await partesDa(folha);
    const por = (parte: string, rotulo = "") => p1.find((p) => p.parte === parte && p.rotulo === rotulo);
    const bolsa = por("bolsa");
    check("bolsa do estagiário em Bolsa, vence com o salário", paraCentavos(bolsa?.lanc.valor ?? 0) === 100_000 && bolsa?.lanc.categoria?.chave === "despesa_estagio_bolsa" && iso(bolsa.lanc.vencimento) === r1.vencimento, bolsa?.lanc);
    // 20/07/2041 é sábado: as guias vencem na sexta, 19/07.
    const fgts = por("fgts");
    check("FGTS em FGTS, vence 19/07 (dia 20 cai no sábado)", paraCentavos(fgts?.lanc.valor ?? 0) === 40_000 && fgts?.lanc.categoria?.chave === "despesa_folha_fgts" && iso(fgts.lanc.vencimento) === `${ANO}-07-19`, fgts?.lanc);
    const inss = por("inss_retido");
    const irrf = por("irrf_retido");
    check("INSS e IRRF descontados em Salários, vencendo 19/07", inss?.lanc.categoria?.chave === "despesa_folha_salarios" && iso(inss.lanc.vencimento) === `${ANO}-07-19` && paraCentavos(irrf?.lanc.valor ?? 0) === 10_000, { inss: inss?.lanc, irrf: irrf?.lanc });
    const vt = por("beneficio", "Vale-transporte");
    const vr = por("beneficio", "Vale-refeição");
    check("benefícios dos 2 CLT agrupados (VT R$ 400, VR R$ 1.000) nas subcategorias", paraCentavos(vt?.lanc.valor ?? 0) === 40_000 && vt?.lanc.categoria?.chave === "despesa_folha_vale_transporte" && paraCentavos(vr?.lanc.valor ?? 0) === 100_000 && vr?.lanc.categoria?.chave === "despesa_folha_vale_refeicao", { vt: vt?.lanc, vr: vr?.lanc });
    const taxa = por("taxa_agente");
    check("taxa do IEL da estagiária (R$ 90) em Taxa do agente, com o salário", paraCentavos(taxa?.lanc.valor ?? 0) === 9_000 && taxa?.lanc.categoria?.chave === "despesa_estagio_taxa_agente" && iso(taxa.lanc.vencimento) === r1.vencimento, taxa?.lanc);

    // 2
    const eCurto = await erroDe(() => reabrirFolhaNoBanco(folha, "corrigir", ana.id));
    check("reabrir com motivo curto é recusado", eCurto === MSG_MOTIVO_CURTO, eCurto);
    const hAna = await prisma.holerite.findFirstOrThrow({ where: { folhaId: folha, userId: ana.id } });
    await prisma.holerite.update({ where: { id: hAna.id }, data: { assinadoEm: new Date(), assinanteId: ana.id } });
    const re = await reabrirFolhaNoBanco(folha, "FGTS do relatório veio errado", beto.id);
    const versoes = await prisma.holeriteVersao.findMany({ where: { holeriteId: hAna.id } });
    const reab = await prisma.folhaReabertura.findMany({ where: { folhaId: folha } });
    check("reabrir guarda a versão assinada e revoga a assinatura", re.assinaturasRevogadas === 1 && versoes.length === 1 && Array.isArray(versoes[0].itens) && versoes[0].motivo === "FGTS do relatório veio errado", { re, versoes });
    check("reabertura gravada com motivo e autor", reab.length === 1 && reab[0].autorId === beto.id, reab);
    const aindaLa = await prisma.lancamento.count({ where: { id: { in: p1.map((p) => p.lancamentoId) }, status: "previsto" } });
    check("reabrir não mexe nas contas (continuam em aberto)", aindaLa === 7, aindaLa);

    // 3
    await prisma.folhaPagamento.update({ where: { id: folha }, data: { totalFgts: 450 } });
    const r3 = await fecharFolhaNoBanco(folha, ana.id);
    const p3 = await partesDa(folha);
    const fgts3 = p3.find((p) => p.parte === "fgts");
    check("fechar de novo atualiza a MESMA conta do FGTS", fgts3?.lancamentoId === fgts?.lancamentoId && paraCentavos(fgts3?.lanc.valor ?? 0) === 45_000, fgts3?.lanc);
    check("nenhuma parte nova nasceu", p3.length === 7 && r3.lancamentoId === r1.lancamentoId, { n: p3.length, r3 });

    // 4
    await reabrirFolhaNoBanco(folha, "IRRF não houve neste mês", ana.id);
    await prisma.folhaPagamento.update({ where: { id: folha }, data: { totalIrrfRetido: null } });
    await fecharFolhaNoBanco(folha, ana.id);
    const irrf4 = await prisma.lancamento.findUnique({ where: { id: irrf!.lancamentoId }, select: { status: true, excluidoEm: true } });
    const hist = await prisma.lancamentoStatusHistorico.findFirst({ where: { lancamentoId: irrf!.lancamentoId, para: "cancelado" } });
    check("IRRF que saiu da folha é cancelado (não apagado), com histórico", irrf4?.status === "cancelado" && irrf4.excluidoEm === null && !!hist, { irrf4, hist });

    // 5
    await baixarNoBanco({ id: fgts!.lancamentoId, contaId: conta.id, data: hojeParaBanco() }, ana.id);
    const ePaga = await erroDe(() => reabrirFolhaNoBanco(folha, "corrigir de novo o holerite", ana.id));
    check("FGTS pago: reabrir é recusado (estorne antes)", (ePaga ?? "").includes("estorne o pagamento"), ePaga);

    // 6
    const folhaAgo = await folhaDe(8, [{ userId: ana.id, proventos: 3300, descontos: 300 }], { totalFgts: 264 });
    const eN5 = await erroDe(() => fecharFolhaNoBanco(folhaAgo, ana.id));
    const ago = await prisma.folhaPagamento.findUnique({ where: { id: folhaAgo }, select: { status: true, _count: { select: { partes: true } } } });
    check("mês fechado no Financeiro: fechar a folha é recusado sem gravar", eN5 !== null && ago?.status === "aberta" && ago._count.partes === 0, { eN5, ago });

    // 7 — Dois "Fechar" ao mesmo tempo: um fecha, o outro desiste; nasce UMA conta do líquido. Dois
    //     "Reabrir" ao mesmo tempo: uma reabertura só.
    const folhaSet = await folhaDe(9, [{ userId: ana.id, proventos: 3300, descontos: 300 }]);
    const fechs = await Promise.allSettled([fecharFolhaNoBanco(folhaSet, ana.id), fecharFolhaNoBanco(folhaSet, beto.id)]);
    const okF = fechs.filter((r) => r.status === "fulfilled").length;
    const errF = fechs.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : []));
    const liquidos = await prisma.lancamento.count({ where: { descricao: { startsWith: `Folha CLT (líquido) — folha 09/${ANO}` }, excluidoEm: null } });
    check("fechar duas vezes ao mesmo tempo: um passa, o outro é recusado, uma conta só", okF === 1 && errF[0] === "Folha já fechada." && liquidos === 1, { okF, errF, liquidos });
    const reabs = await Promise.allSettled([
      reabrirFolhaNoBanco(folhaSet, "reabrindo em paralelo um", ana.id),
      reabrirFolhaNoBanco(folhaSet, "reabrindo em paralelo dois", beto.id),
    ]);
    const okR = reabs.filter((r) => r.status === "fulfilled").length;
    const nReab = await prisma.folhaReabertura.count({ where: { folhaId: folhaSet } });
    check("reabrir duas vezes ao mesmo tempo: uma reabertura só", okR === 1 && nReab === 1, { okR, nReab });

    // 8 — Reabrir e fechar de novo reaproveita a conta do líquido (também no 13º, que não procura conta
    //     da competência); folha que perdeu os CLT cancela a conta do líquido anterior.
    const folhaOut = await folhaDe(10, [{ userId: ana.id, proventos: 3300, descontos: 300 }, { userId: eva.id, proventos: 1000, descontos: 0 }]);
    const o1 = await fecharFolhaNoBanco(folhaOut, ana.id);
    await reabrirFolhaNoBanco(folhaOut, "a Ana saiu antes de outubro", ana.id);
    await prisma.holerite.deleteMany({ where: { folhaId: folhaOut, userId: ana.id } });
    const o2 = await fecharFolhaNoBanco(folhaOut, ana.id);
    const liqOut = await prisma.lancamento.findUnique({ where: { id: o1.lancamentoId ?? "" }, select: { status: true } });
    check("folha que perdeu os CLT: conta do líquido anterior cancelada", o2.acao === "sem_clt" && liqOut?.status === "cancelado", { o2, liqOut });

    const f13 = await prisma.folhaPagamento.create({ data: { ano: ANO, mes: 12, tipo: "decimo_terceiro", totalInssRetido: 150 }, select: { id: true } });
    const h13 = await prisma.holerite.create({ data: { folhaId: f13.id, userId: ana.id }, select: { id: true } });
    await prisma.holeriteItem.create({ data: { holeriteId: h13.id, descricao: `${tag} 13º`, tipo: "provento", valor: 1650 } });
    const t1 = await fecharFolhaNoBanco(f13.id, ana.id);
    await reabrirFolhaNoBanco(f13.id, "corrigir o valor do 13º", ana.id);
    await prisma.holeriteItem.updateMany({ where: { holeriteId: h13.id }, data: { valor: 1700 } });
    const t2 = await fecharFolhaNoBanco(f13.id, ana.id);
    const liq13 = await prisma.lancamento.findUnique({ where: { id: t2.lancamentoId ?? "" }, select: { valor: true } });
    check("13º reaberto e fechado de novo: a MESMA conta, com o valor novo", t2.lancamentoId === t1.lancamentoId && t2.acao === "atualizou" && paraCentavos(liq13?.valor ?? 0) === 170_000, { t1, t2, liq13 });
    // 20/12/2041 é sexta: o INSS do 13º vence no próprio dezembro (decisão do dono, 2026-10-11).
    const inss13 = (await partesDa(f13.id)).find((x) => x.parte === "inss_retido");
    check("INSS do 13º vence dia 20 de dezembro, não em janeiro", iso(inss13?.lanc.vencimento) === `${ANO}-12-20`, inss13?.lanc);
  } finally {
    const folhas = await prisma.folhaPagamento.findMany({ where: { ano: ANO }, select: { id: true, lancamentoId: true } });
    const partes = await prisma.folhaLancamento.findMany({ where: { folhaId: { in: folhas.map((f) => f.id) } }, select: { lancamentoId: true } });
    const lancIds = [...partes.map((p) => p.lancamentoId), ...folhas.flatMap((f) => (f.lancamentoId ? [f.lancamentoId] : []))];
    await prisma.lancamento.deleteMany({ where: { OR: [{ id: { in: lancIds } }, { autorId: { in: ids } }], excluidoEm: { not: undefined } } });
    await prisma.folhaPagamento.deleteMany({ where: { ano: ANO } });
    await prisma.fechamentoMensal.delete({ where: { id: fechamentoN5.id } });
    await prisma.contaBancaria.delete({ where: { id: conta.id } });
    await prisma.tabelaEncargos.delete({ where: { id: tabela.id } });
    await prisma.tabelaEncargos.delete({ where: { id: tabelaEst.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
