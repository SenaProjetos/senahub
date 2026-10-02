/**
 * Smoke do núcleo do Financeiro (N0, plano 2026-10-02) contra o banco de dev. Cobre o I/O das
 * correções que o vitest não alcança:
 *
 *   A6. Regenerar as parcelas do projeto só troca as parcelas GERADAS em aberto: a entrega
 *       faturada (mesma tag `contrato`) e as recebidas ficam, e o total novo desconta o que já
 *       entrou. Limpar também não apaga a entrega. As parcelas nascem com o cliente do projeto.
 *   A5. Baixa no Financeiro de uma despesa de projetista marca o pagamento como pago; a folha de
 *       projetistas não confirma de novo (nem move a data); a sincronização da disciplina recusa
 *       quando o lançamento já foi pago; duas aprovações simultâneas da disciplina: só uma passa.
 *   A11. "Recebido" dos indicadores soma o valor PAGO (parcial), linha a linha.
 *
 * O serviço terceirizado (A7) tem a prova em `scripts/verify-custo-projeto.ts` e a folha CLT (A1)
 * em `smoke:planejador`. Uso: npm run smoke:financeiro-core
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { gerarParcelasDoProjeto, limparParcelasDoProjeto } from "../src/modules/projetos/receita/parcelas-service";
import { faturarEntregaDaDisciplina } from "../src/modules/projetos/receita/faturamento";
import {
  confirmarDespesaProjetista,
  criarDespesaProjetistaPrevista,
  pagamentoPagoNoFinanceiro,
} from "../src/modules/financeiro/custo/lancamento-custo";
import { liberarPagamentosProjetista, sincronizarPagamentosDisciplina } from "../src/modules/uploads/pagamento";
import { indicadores } from "../src/modules/financeiro/relatorios/queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

async function erroDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-fincore-${Date.now()}`;
const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");

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
  const pj = await prisma.user.create({
    data: { name: `${tag}-PJ`, email: `${tag}-pj@teste.local`, role: "projetista_pj", emailVerified: false },
  });
  const disciplina = await prisma.disciplina.create({
    data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural", valor: 1000, responsaveis: { create: [{ userId: pj.id }] } },
  });

  try {
    await parcelasDoProjeto(admin.id, projeto.id, disciplina.id, cliente.id);
    await projetistaPagoNoFinanceiro(admin.id, disciplina.id);
    await recebidoPeloPago(admin.id);
  } finally {
    const pags = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id }, select: { id: true } })).map((p) => p.id);
    await prisma.lancamento.deleteMany({ where: { OR: [{ projetoId: projeto.id }, { pagamentoProjetistaId: { in: pags } }, { descricao: { startsWith: tag } }] } });
    await prisma.pagamentoProjetista.deleteMany({ where: { id: { in: pags } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

async function parcelasDoProjeto(autorId: string, projetoId: string, disciplinaId: string, clienteId: string) {
  console.log("\n# A6 — parcelas do projeto");
  const vivas = () =>
    prisma.lancamento.findMany({
      where: { projetoId, tipo: "receita", excluidoEm: null, status: { not: "cancelado" } },
      select: { id: true, status: true, valor: true, tags: true, clienteId: true },
      orderBy: { vencimento: "asc" },
    });

  // Entrega faturada: tem a tag `contrato` e é recebível de verdade.
  await faturarEntregaDaDisciplina({ disciplinaId, valor: 2000, autorId });
  const r1 = await gerarParcelasDoProjeto({ projetoId, valorTotal: 9000, numeroParcelas: 3, dataPrimeira: "2040-01-10", intervaloMeses: 1, autorId });
  let l = await vivas();
  const geradas = l.filter((x) => !x.tags.some((t) => t.startsWith("entrega:")));
  check("gera 3 parcelas de 3.000 com o cliente do projeto", r1.parcelas === 3 && geradas.length === 3 && geradas.every((x) => Number(x.valor) === 3000 && x.clienteId === clienteId), geradas);

  // Recebe a 1ª parcela pela metade (parcial: 1.500 pago, 1.500 vira resto em aberto com a mesma tag).
  const primeira = geradas[0];
  await prisma.lancamento.update({ where: { id: primeira.id }, data: { status: "confirmado", dataConfirmacao: dia("2040-01-10"), valorEfetivo: 1500 } });
  await prisma.lancamento.create({
    data: { tipo: "receita", descricao: `${tag} resto`, valor: 1500, status: "previsto", data: dia("2040-01-10"), vencimento: dia("2040-01-10"), categoriaId: (await prisma.lancamento.findUniqueOrThrow({ where: { id: primeira.id } })).categoriaId, projetoId, tags: ["contrato"], autorId },
  });

  const r2 = await gerarParcelasDoProjeto({ projetoId, valorTotal: 9000, numeroParcelas: 2, dataPrimeira: "2040-03-10", intervaloMeses: 1, autorId });
  l = await vivas();
  const entrega = l.filter((x) => x.tags.some((t) => t.startsWith("entrega:")));
  const abertas = l.filter((x) => x.status === "previsto" && !x.tags.some((t) => t.startsWith("entrega:")));
  check("regenerar não apaga a entrega faturada", entrega.length === 1 && Number(entrega[0].valor) === 2000, entrega);
  check("a recebida fica", l.some((x) => x.id === primeira.id && x.status === "confirmado"));
  check("o total novo desconta o recebido: 9.000 − 1.500 = 2 × 3.750", r2.recebido === 1500 && abertas.length === 2 && abertas.every((x) => Number(x.valor) === 3750), { r2, abertas });
  const excluidas = await prisma.lancamento.count({ where: { projetoId, excluidoEm: { not: null } } });
  check("as abertas antigas (2 parcelas + o resto) saem por exclusão lógica", excluidas === 3, excluidas);

  const recusa = await erroDe(gerarParcelasDoProjeto({ projetoId, valorTotal: 1000, numeroParcelas: 1, dataPrimeira: "2040-05-10", intervaloMeses: 1, autorId }));
  check("total menor que o recebido é recusado", recusa?.includes("não há o que parcelar") === true, recusa);

  const removidas = await limparParcelasDoProjeto(projetoId);
  l = await vivas();
  check("limpar tira só as geradas em aberto; a entrega e a recebida ficam", removidas === 2 && l.length === 2, { removidas, l });
}

async function projetistaPagoNoFinanceiro(autorId: string, disciplinaId: string) {
  console.log("\n# A5 — projetista pago no Financeiro");
  const comResp = async () =>
    prisma.disciplina.findUniqueOrThrow({
      where: { id: disciplinaId },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });

  // Duas aprovações ao mesmo tempo: a mesma guarda das duas actions (updateMany condicionado).
  await prisma.disciplina.update({ where: { id: disciplinaId }, data: { status: "em_revisao" } });
  const aprovar = () =>
    prisma.$transaction(async (tx) => {
      const r = await tx.disciplina.updateMany({ where: { id: disciplinaId, status: { not: "aprovado" } }, data: { status: "aprovado" } });
      if (r.count !== 1) throw new Error("Esta entrega já foi validada.");
      await new Promise((ok) => setTimeout(ok, 300));
      return liberarPagamentosProjetista(tx, { disciplina: await comResp(), autorId, agora: new Date() });
    });
  const corrida = await Promise.allSettled([aprovar(), aprovar()]);
  const pags = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId }, select: { id: true, status: true, lancamentoId: true, pagoEm: true } });
  check(
    "duas aprovações simultâneas: uma passa, a outra é recusada, e o pagamento é liberado UMA vez",
    corrida.filter((c) => c.status === "fulfilled").length === 1 && pags.length === 1,
    { corrida: corrida.map((c) => c.status), pags: pags.length },
  );
  const pag = pags[0];
  if (!pag?.lancamentoId) return check("pagamento liberado com lançamento", false, pag);

  // Baixa no livro caixa: os mesmos argumentos que confirmarLancamento/baixarEmLote/conciliação/OFX usam.
  const quando = dia("2040-02-05");
  await prisma.$transaction([
    prisma.lancamento.update({ where: { id: pag.lancamentoId }, data: { status: "confirmado", dataConfirmacao: quando } }),
    prisma.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(pag.id, quando)),
  ]);
  const depois = await prisma.pagamentoProjetista.findUniqueOrThrow({ where: { id: pag.id } });
  check("baixa no Financeiro marca o pagamento como pago, com a data da baixa", depois.status === "pago" && depois.pagoEm?.toISOString() === quando.toISOString(), depois);

  // Pagar pela folha de projetistas depois disso não confirma de novo.
  const id = await prisma.$transaction((tx) =>
    confirmarDespesaProjetista(
      tx,
      { id: pag.id, lancamentoId: pag.lancamentoId, valor: 1000, tipoProfissional: "projetista_pj", projetistaNome: "x", disciplinaNome: "x", projetoId: "x", projetoCodigo: "x" },
      { contaId: null, formaId: null, quando: dia("2040-03-01"), autorId },
    ),
  );
  const lanc = await prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { dataConfirmacao: true } });
  check("folha de projetistas não paga de novo nem move a data", lanc.dataConfirmacao?.toISOString() === quando.toISOString(), lanc);

  // Pago só no Financeiro (dado antigo: pagamento ainda pendente): a sincronização recusa.
  await prisma.pagamentoProjetista.update({ where: { id: pag.id }, data: { status: "pendente", pagoEm: null } });
  await prisma.disciplina.update({ where: { id: disciplinaId }, data: { valor: 1500 } });
  const recusa = await erroDe(prisma.$transaction(async (tx) => sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId })));
  const intacto = await prisma.lancamento.findUniqueOrThrow({ where: { id: pag.lancamentoId }, select: { valor: true, status: true } });
  check("sincronização recusa quando o lançamento já foi pago", /pagamento efetivado/i.test(recusa ?? ""), recusa);
  check("o lançamento pago fica como estava", Number(intacto.valor) === 1000 && intacto.status === "confirmado", intacto);

  // E o caminho feliz continua: lançamento em aberto acompanha o valor novo.
  const outro = await prisma.$transaction(async (tx) => {
    const p = await tx.pagamentoProjetista.create({ data: { disciplinaId, projetistaId: (await comResp()).responsaveis[0].userId, valor: 10, tipoProfissional: "projetista_pj" } });
    const lancamentoId = await criarDespesaProjetistaPrevista(tx, { pagamentoId: p.id, valor: 10, tipoProfissional: "projetista_pj", projetistaNome: "x", disciplinaNome: "x", projetoId: (await comResp()).projeto.id, projetoCodigo: "x", autorId, quando: new Date() });
    await tx.pagamentoProjetista.update({ where: { id: p.id }, data: { lancamentoId } });
    return lancamentoId;
  });
  check("criar despesa prevista continua igual", (await prisma.lancamento.findUniqueOrThrow({ where: { id: outro } })).status === "previsto");
}

async function recebidoPeloPago(autorId: string) {
  console.log("\n# A11 — recebido = valor pago");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  if (!cat) return check("categoria de receita existe", false);
  const de = dia("2041-06-01");
  const ate = new Date("2041-06-30T23:59:59.000Z");
  const base = { tipo: "receita" as const, status: "confirmado" as const, categoriaId: cat.id, autorId, data: dia("2041-06-10"), dataConfirmacao: dia("2041-06-10") };
  await prisma.lancamento.create({ data: { ...base, descricao: `${tag} parcial`, valor: 1000, valorEfetivo: 400 } });
  await prisma.lancamento.create({ data: { ...base, descricao: `${tag} cheio`, valor: 250 } });
  const r = await indicadores(de, ate);
  check("recebido = 400 (pago do parcial) + 250 — não 1.250 nem só 400", r.recebido === 650, r.recebido);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
