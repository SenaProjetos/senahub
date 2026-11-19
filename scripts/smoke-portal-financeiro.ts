/**
 * Smoke do Financeiro do portal do cliente (`financeiroDoClienteNoBanco`) contra o banco de dev: o `where` de verdade
 * no Postgres. A conta de situação/ordem/totais é pura e está em `modules/portal/financeiro.test.ts`; aqui vai o que
 * só o banco decide — de quem é o recebível (o próprio lançamento × o projeto), o que fica de fora (previsão,
 * cancelado, despesa, excluído, acessório da baixa, perna de transferência, licitação) e o líquido da retenção.
 *
 * Cria clientes + projetos + lançamentos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:portal-financeiro
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { getConfigAvisos } from "../src/modules/financeiro/avisos/service";
import { financeiroDoClienteNoBanco } from "../src/modules/portal/financeiro-queries";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const tag = `SMKPORTALFIN_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!autor) throw new Error("Banco de dev sem usuário ativo.");
  const catReceita = await prisma.categoriaFinanceira.findFirst({ where: { chave: "receita_projetos_particulares" }, select: { id: true } });
  const catLicitacao = await prisma.categoriaFinanceira.findFirst({ where: { chave: "receita_licitacoes" }, select: { id: true } });
  const catDespesa = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  const catTransf = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "transferencia" }, select: { id: true } });
  if (!catReceita || !catLicitacao || !catDespesa) throw new Error("Banco de dev sem as categorias do sistema.");
  const cfg = await getConfigAvisos();
  const hoje = diaDeSaoPaulo();

  const clientes: string[] = [];
  const projetos: string[] = [];
  const lancs: string[] = [];
  const novoCliente = async (sufixo: string) => {
    const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}` } });
    clientes.push(c.id);
    return c.id;
  };
  const novoProjeto = async (clienteId: string, sufixo: string, tipo: "particular" | "licitacao") => {
    const p = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({ data: { ano, sequencial, codigo, tipo, nome: `${tag}_${sufixo}`, clienteId } });
    });
    projetos.push(p.id);
    return p.id;
  };
  type Extra = Partial<{
    tipo: "receita" | "despesa";
    status: "previsto" | "confirmado" | "cancelado" | "previsao";
    clienteId: string | null;
    projetoId: string | null;
    categoriaId: string;
    valor: number;
    valorEfetivo: number;
    vencimento: string;
    dataConfirmacao: string;
    acessorioDeId: string;
    transferenciaId: string;
    excluidoEm: Date;
  }>;
  const lanc = async (nome: string, e: Extra) => {
    const l = await prisma.lancamento.create({
      data: {
        tipo: e.tipo ?? "receita",
        status: e.status ?? "previsto",
        descricao: `${tag}_${nome}`,
        valor: e.valor ?? 1000,
        valorEfetivo: e.valorEfetivo,
        data: dia(somarDias(hoje, -30)),
        vencimento: e.vencimento ? dia(e.vencimento) : null,
        dataConfirmacao: e.dataConfirmacao ? dia(e.dataConfirmacao) : null,
        categoriaId: e.categoriaId ?? catReceita.id,
        clienteId: e.clienteId ?? null,
        projetoId: e.projetoId ?? null,
        acessorioDeId: e.acessorioDeId,
        transferenciaId: e.transferenciaId,
        excluidoEm: e.excluidoEm,
        autorId: autor.id,
      },
    });
    lancs.push(l.id);
    return l.id;
  };

  try {
    const cliA = await novoCliente("A");
    const cliB = await novoCliente("B");
    const projA = await novoProjeto(cliA, "pA", "particular");
    const projLic = await novoProjeto(cliA, "pLic", "licitacao");
    const projB = await novoProjeto(cliB, "pB", "particular");

    const vencida = await lanc("vencida", { clienteId: cliA, projetoId: projA, vencimento: somarDias(hoje, -5), valor: 500 });
    const aVencerPeloProjeto = await lanc("a_vencer_pelo_projeto", { projetoId: projA, vencimento: somarDias(hoje, 10), valor: 1000 });
    await prisma.retencaoLancamento.create({ data: { lancamentoId: aVencerPeloProjeto, imposto: "iss", valor: 50 } });
    const semProjeto = await lanc("sem_projeto", { clienteId: cliA, vencimento: somarDias(hoje, 20), valor: 200 });
    const paga = await lanc("paga_parcial", {
      clienteId: cliA,
      projetoId: projA,
      status: "confirmado",
      valor: 800,
      valorEfetivo: 300,
      vencimento: somarDias(hoje, -15),
      dataConfirmacao: somarDias(hoje, -14),
    });
    const noProjetoAlheio = await lanc("no_projeto_de_outro", { clienteId: cliA, projetoId: projB, vencimento: somarDias(hoje, 25), valor: 100 });
    const licitacao = await lanc("licitacao_pelo_projeto", { clienteId: cliA, projetoId: projLic, vencimento: somarDias(hoje, 3) });
    const licitacaoCat = await lanc("licitacao_pela_categoria", { clienteId: cliA, categoriaId: catLicitacao.id, vencimento: somarDias(hoje, 3) });

    const fora = {
      previsao: await lanc("previsao", { clienteId: cliA, projetoId: projA, status: "previsao", vencimento: somarDias(hoje, 30) }),
      cancelado: await lanc("cancelado", { clienteId: cliA, projetoId: projA, status: "cancelado", vencimento: somarDias(hoje, 3) }),
      outroPagador: await lanc("outro_pagador", { clienteId: cliB, projetoId: projA, vencimento: somarDias(hoje, 3) }),
      outroProjeto: await lanc("projeto_de_outro", { projetoId: projB, vencimento: somarDias(hoje, 3) }),
      despesa: await lanc("despesa", { tipo: "despesa", categoriaId: catDespesa.id, clienteId: cliA, projetoId: projA, vencimento: somarDias(hoje, 3) }),
      excluido: await lanc("excluido", { clienteId: cliA, projetoId: projA, vencimento: somarDias(hoje, 3), excluidoEm: new Date() }),
      acessorio: await lanc("juros_da_baixa", { clienteId: cliA, status: "confirmado", acessorioDeId: paga, dataConfirmacao: somarDias(hoje, -14) }),
      transferencia: await lanc("perna_transferencia", {
        clienteId: cliA,
        status: "confirmado",
        transferenciaId: `${tag}_t`,
        categoriaId: catTransf?.id ?? catReceita.id,
        dataConfirmacao: somarDias(hoje, -2),
      }),
    };

    const f = await financeiroDoClienteNoBanco(cliA);
    const ids = new Set([...f.emAberto, ...f.pagas].map((p) => p.id));
    const p = (id: string) => [...f.emAberto, ...f.pagas].find((x) => x.id === id);

    check("recebível do cliente no projeto dele entra (vencida)", p(vencida)?.situacao === "vencida");
    check("recebível sem cliente no projeto do cliente entra (a vencer)", p(aVencerPeloProjeto)?.situacao === "a_vencer");
    check("recebível do cliente sem projeto entra", p(semProjeto)?.situacao === "a_vencer" && p(semProjeto)?.projeto === null);
    check("retenção: aparece o líquido (1000 − 50)", p(aVencerPeloProjeto)?.valorCentavos === 95000);
    check("paga em parte: o valor pago e a data do pagamento", p(paga)?.valorCentavos === 30000 && p(paga)?.pagaEm === somarDias(hoje, -14));
    check(
      "recebível do cliente num projeto de outro cliente: parcela entra, projeto alheio não aparece",
      p(noProjetoAlheio)?.situacao === "a_vencer" && p(noProjetoAlheio)?.projeto === null,
    );
    for (const [nome, id] of Object.entries(fora)) check(`fora do portal: ${nome}`, !ids.has(id));
    check(
      `licitação pelo projeto ${cfg.cobrarLicitacao ? "entra (cobrança de licitação ligada)" : "fica fora"}`,
      ids.has(licitacao) === cfg.cobrarLicitacao,
    );
    check(
      `licitação pela categoria ${cfg.cobrarLicitacao ? "entra (cobrança de licitação ligada)" : "fica fora"}`,
      ids.has(licitacaoCat) === cfg.cobrarLicitacao,
    );
    const lic = cfg.cobrarLicitacao ? 200000 : 0;
    check(
      "totais batem com as parcelas (vencido 500, a vencer 950 + 200 + 100, pago 300)",
      f.totais.vencidoCentavos === 50000 && f.totais.aVencerCentavos === 125000 + lic && f.totais.pagoCentavos === 30000,
    );
    check("em aberto: mais antiga primeiro", f.emAberto[0]?.id === vencida);

    const deB = await financeiroDoClienteNoBanco(cliB);
    check(
      "cliente B vê só o dele (outro pagador no projeto de A + o projeto dele)",
      deB.emAberto.map((x) => x.id).sort().join() === [fora.outroPagador, fora.outroProjeto].sort().join(),
    );
  } finally {
    await prisma.lancamento.deleteMany({ where: { id: { in: lancs }, excluidoEm: { not: undefined } } });
    for (const id of projetos) await prisma.projeto.delete({ where: { id } });
    for (const id of clientes) await prisma.cliente.delete({ where: { id } });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
