/**
 * Smoke da previsão de recebimento do cronograma (F7.2 — D9/D25) e do contrato por entrega
 * (F7.3 — D15) contra o banco de dev. Exercita o I/O que o vitest de `parcelas-entrega.ts` não
 * alcança:
 *
 *   1. Contrato por entrega não assinado não prevê nada; assinado, a parcela "na assinatura" vira
 *      previsão já, e as de marco só com o cronograma aprovado — na data do marco no motor.
 *   2. A previsão NÃO é conta a receber: fora do aging, do alerta de inadimplência e do resumo do
 *      cliente; dentro da projeção de caixa, com subtotal próprio.
 *   3. Marco andou → a MESMA linha anda. Faturar converte a linha em `previsto` (entra no aging);
 *      daí em diante a sincronização não mexe nela.
 *   4. Cronograma de volta ao rascunho tira as previsões de marco; a da assinatura fica.
 *   5. Contrato que cobra por data assina e gera as parcelas mesmo tendo tido previsão (a contagem
 *      de idempotência ignora `previsao`).
 *   6. Previsão que passou da data vai para a 1ª semana da projeção, marcada como atrasada — senão
 *      sumiria de todas as telas. Marco APAGADO deixa a parcela sem data (nunca "na assinatura").
 *      Contrato sem projeto também sincroniza a parcela da assinatura.
 *   7. Parcelas manuais do projeto × contrato (L6): por entrega em vigor recusa "Gerar parcelas";
 *      rescindido não conta; por data com plano definido só avisa.
 *   8. "Faturar entrega" (B1): recusa com contrato por entrega em vigor; cobra o valor INFORMADO, nunca
 *      o `Disciplina.valor` (pool dos projetistas); não fatura duas vezes nem sem valor.
 *   9. Lista "Parcelas a faturar" do financeiro (L2): traz as parcelas ainda não faturadas com valor e
 *      situação, destaca o marco concluído e tira a parcela faturada.
 *  10. Data de Status (L1): marco não concluído até ela anda para o dia útil seguinte, e a previsão junto.
 *
 * Uso: npm run smoke:previsao-recebimento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planoDoProjeto, paraDia } from "../src/modules/planejamento/agenda";
import {
  faturarParcela,
  sincronizarPrevisoesDoContrato,
  sincronizarPrevisoesDoProjeto,
} from "../src/modules/juridico/contrato/previsao-service";
import { gerarRecebiveisDoContrato } from "../src/modules/juridico/contrato/recebiveis";
import { agingReport } from "../src/modules/financeiro/aging/queries";
import { projecaoCaixa } from "../src/modules/financeiro/caixa/queries";
import { resumoFinanceiroCliente } from "../src/modules/clientes/queries";
import { inicioDoDiaUtc } from "../src/lib/data";
import { registrarExecucaoNaLinha } from "../src/modules/planejamento/execucao-service";
import { avisoCobrancaContrato } from "../src/modules/projetos/receita/cobranca-contrato";
import { contratosDeCobranca } from "../src/modules/projetos/receita/queries";
import { faturarEntregaDaDisciplina } from "../src/modules/projetos/receita/faturamento";
import { parcelasAFaturar } from "../src/modules/juridico/contrato/parcelas-a-faturar-queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-previsao-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const hoje = paraDia(inicioDoDiaUtc());
  const ontem = paraDia(new Date(inicioDoDiaUtc().getTime() - 86_400_000));

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

  const extras: string[] = [];
  try {
    // EAP: Básico (5 dias) → marco M1 → Executivo (5 dias) → marco M2.
    const base = { projetoId: projeto.id, inicioPrevisto: d(hoje), fimPrevisto: d(hoje) };
    const bas = await prisma.eapTarefa.create({ data: { ...base, nome: "Básico", tipoEap: "atv", duracaoDias: 5, ordem: 0 } });
    const m1 = await prisma.eapTarefa.create({ data: { ...base, nome: "Entrega do Básico", tipoEap: "mrc", duracaoDias: 0, ordem: 1 } });
    const exe = await prisma.eapTarefa.create({ data: { ...base, nome: "Executivo", tipoEap: "atv", duracaoDias: 5, ordem: 2 } });
    const m2 = await prisma.eapTarefa.create({ data: { ...base, nome: "Entrega do Executivo", tipoEap: "mrc", duracaoDias: 0, ordem: 3 } });
    await prisma.eapDependencia.createMany({
      data: [
        { tarefaId: m1.id, predecessoraId: bas.id },
        { tarefaId: exe.id, predecessoraId: m1.id },
        { tarefaId: m2.id, predecessoraId: exe.id },
      ],
    });
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d(hoje) } });

    const contrato = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato`,
        tipo: "contrato",
        clienteId: cliente.id,
        projetoId: projeto.id,
        statusContrato: "rascunho",
        valor: 10000,
        formaCobranca: "por_entrega",
        parcelasEntrega: {
          create: [
            { descricao: "Assinatura", percentual: 30, ordem: 0, naAssinatura: true },
            { descricao: "Entrega do básico", percentual: 40, ordem: 1, marcoId: m1.id },
            { descricao: "Entrega do executivo", percentual: 30, ordem: 2, marcoId: m2.id },
          ],
        },
      },
      include: { parcelasEntrega: { orderBy: { ordem: "asc" } } },
    });
    const [pAss, pM1, pM2] = contrato.parcelasEntrega;
    const previsoes = () =>
      prisma.lancamento.findMany({ where: { contratoId: contrato.id, status: "previsao" }, orderBy: { valor: "asc" } });
    const linhaDa = async (parcelaId: string) => {
      const p = await prisma.contratoParcelaEntrega.findUniqueOrThrow({ where: { id: parcelaId }, select: { lancamentoId: true } });
      return p.lancamentoId ? prisma.lancamento.findUniqueOrThrow({ where: { id: p.lancamentoId } }) : null;
    };

    // ── 1. Não assinado: nada ────────────────────────────────────────────
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    check("contrato não assinado: nenhuma previsão", (await previsoes()).length === 0);

    // Assinado, cronograma em rascunho: só a da assinatura, com a data da assinatura.
    await prisma.documentoJuridico.update({ where: { id: contrato.id }, data: { statusContrato: "assinado", assinadoEm: d(hoje) } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    let prev = await previsoes();
    check("assinado + rascunho: só a parcela da assinatura (3000, hoje)", prev.length === 1 && Number(prev[0].valor) === 3000 && paraDia(prev[0].vencimento!) === hoje, prev.map((l) => [Number(l.valor), l.vencimento]));

    // ── 2. Previsão não é conta a receber ───────────────────────────────
    const aging = await agingReport("receita");
    check("aging não vê a previsão", !JSON.stringify(aging).includes(prev[0].id));
    const resumo = await resumoFinanceiroCliente(cliente.id);
    check("resumo do cliente não soma previsão (nada cobrado)", resumo.total === 0, resumo);
    const projecao = await projecaoCaixa(0, 8);
    const noCaixa = projecao.reduce((s, p) => s + p.previsaoCronograma, 0);
    check("projeção de caixa inclui a previsão, com subtotal próprio", noCaixa >= 3000 && projecao.reduce((s, p) => s + p.entradas, 0) >= 3000, noCaixa);

    // Assinado há 10 dias e não faturado: a previsão passou da data — vai para a 1ª semana, atrasada.
    const dezDiasAtras = paraDia(new Date(inicioDoDiaUtc().getTime() - 10 * 86_400_000));
    await prisma.documentoJuridico.update({ where: { id: contrato.id }, data: { assinadoEm: d(dezDiasAtras) } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const atrasada = await projecaoCaixa(0, 8);
    check(
      "previsão vencida e não faturada fica na 1ª semana, marcada como atrasada",
      atrasada[0].previsaoAtrasada >= 3000 && atrasada[0].previsaoCronograma >= 3000,
      { semana0: atrasada[0] },
    );

    // Cronograma aprovado: as de marco nascem na data do motor.
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const plano = await planoDoProjeto(projeto.id);
    const diaM1 = plano?.resultado.linhas.get(m1.id)?.fim;
    const diaM2 = plano?.resultado.linhas.get(m2.id)?.fim;
    const l1 = await linhaDa(pM1.id);
    const l2 = await linhaDa(pM2.id);
    check("aprovado: parcela do básico = 4000 na data do marco M1", Number(l1?.valor) === 4000 && paraDia(l1!.vencimento!) === diaM1, { valor: l1?.valor, venc: l1?.vencimento, diaM1 });
    check("aprovado: parcela do executivo = 3000 na data do marco M2", Number(l2?.valor) === 3000 && paraDia(l2!.vencimento!) === diaM2 && l2?.status === "previsao");
    check("sincronizar de novo não duplica", (await previsoes()).length === 3);

    // L2: a lista do financeiro traz as 3 parcelas (nenhuma faturada), com valor e situação.
    const listaDoContrato = async () => (await parcelasAFaturar()).filter((x) => x.contratoId === contrato.id);
    const lista1 = await listaDoContrato();
    check(
      "L2: lista de parcelas a faturar traz as 3, com valor e situação (assinatura pronta; marcos aguardando)",
      lista1.length === 3 &&
        lista1[0].situacao === "na_assinatura" && lista1[0].valor === 3000 &&
        lista1.filter((x) => x.situacao === "aguardando_marco").map((x) => x.valor).sort().join() === "3000,4000",
      lista1.map((x) => [x.descricao, x.situacao, x.valor]),
    );

    // L1: a Data de Status reprograma o marco não concluído até ela — e a previsão anda junto.
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { dataStatus: d(diaM2!) } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const diaM2Status = (await planoDoProjeto(projeto.id))?.resultado.linhas.get(m2.id)?.fim;
    const l2Status = await linhaDa(pM2.id);
    check(
      "L1: marco não concluído até a Data de Status vai para o dia útil seguinte — a previsão anda junto",
      !!diaM2Status && diaM2Status > diaM2! && paraDia(l2Status!.vencimento!) === diaM2Status,
      { antes: diaM2, depois: diaM2Status, previsao: l2Status?.vencimento },
    );
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { dataStatus: null } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);

    // Marco concluído aponta a parcela presa a ele para o financeiro faturar (D9) — sem faturar sozinho.
    const exM2 = await registrarExecucaoNaLinha({ id: m2.id, inicioReal: null, fimReal: hoje, hoje });
    check("marco concluído aponta a parcela a faturar", exM2.parcelasAFaturar.map((x) => x.id).join() === pM2.id, exM2.parcelasAFaturar);
    check("…e não fatura nada sozinho", (await linhaDa(pM2.id))?.status === "previsao");
    const lista2 = await listaDoContrato();
    check("L2: marco concluído sobe para o topo da lista, como pronto para faturar", lista2[0]?.parcelaId === pM2.id && lista2[0].situacao === "marco_concluido", lista2.map((x) => [x.descricao, x.situacao]));
    await registrarExecucaoNaLinha({ id: m2.id, inicioReal: null, fimReal: null, hoje });

    // ── 3. Marco anda → a MESMA linha anda ───────────────────────────────
    await prisma.eapTarefa.update({ where: { id: bas.id }, data: { duracaoDias: 8 } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const diaM1b = (await planoDoProjeto(projeto.id))?.resultado.linhas.get(m1.id)?.fim;
    const l1b = await linhaDa(pM1.id);
    check("marco andou: mesma linha, data nova", l1b?.id === l1?.id && paraDia(l1b!.vencimento!) === diaM1b && diaM1b !== diaM1, { antes: diaM1, depois: diaM1b });

    // Faturar: a previsão vira conta a receber na mesma linha.
    const fat = await faturarParcela({ parcelaId: pM1.id, vencimento: ontem, autorId: admin.id });
    const l1c = await linhaDa(pM1.id);
    check("faturar converte a MESMA linha em previsto, com o vencimento escolhido", fat.lancamentoId === l1?.id && l1c?.status === "previsto" && paraDia(l1c.vencimento!) === ontem);
    check("L2: parcela faturada sai da lista", !(await listaDoContrato()).some((x) => x.parcelaId === pM1.id));
    const inad = await prisma.lancamento.findMany({ where: { tipo: "receita", status: "previsto", vencimento: d(ontem) }, select: { id: true } });
    check("faturada e vencida: entra no alerta de inadimplência", inad.some((x) => x.id === l1?.id));
    check("resumo do cliente passa a ter a cobrança (4000)", (await resumoFinanceiroCliente(cliente.id)).total === 4000);
    let erroFat: string | null = null;
    try {
      await faturarParcela({ parcelaId: pM1.id, vencimento: hoje, autorId: admin.id });
    } catch (e) {
      erroFat = e instanceof Error ? e.message : String(e);
    }
    check("faturar de novo é recusado", !!erroFat && /já foi faturada/.test(erroFat), erroFat);

    await prisma.eapTarefa.update({ where: { id: bas.id }, data: { duracaoDias: 12 } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const l1d = await linhaDa(pM1.id);
    check("faturada: a sincronização não mexe mais nela", paraDia(l1d!.vencimento!) === ontem && l1d?.status === "previsto");

    // Marco apagado (reestruturação da EAP): a parcela fica SEM data — nunca vira "na assinatura".
    await prisma.eapTarefa.delete({ where: { id: m2.id } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    const pM2depois = await prisma.contratoParcelaEntrega.findUniqueOrThrow({ where: { id: pM2.id } });
    check(
      "marco apagado: a previsão sai e a parcela NÃO vira cobrança na assinatura",
      pM2depois.marcoId === null && pM2depois.naAssinatura === false && pM2depois.lancamentoId === null,
      pM2depois,
    );

    // ── 4. Cronograma volta ao rascunho ──────────────────────────────────
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: false } });
    await sincronizarPrevisoesDoProjeto(projeto.id, admin.id);
    prev = await previsoes();
    check("rascunho: previsão de marco sai, a da assinatura fica", prev.length === 1 && prev[0].id === (await linhaDa(pAss.id))?.id, prev.map((l) => Number(l.valor)));
    check("a parcela sem previsão fica desligada", (await linhaDa(pM2.id)) === null);

    // ── 5. Contrato por data com previsão pendurada ainda gera as parcelas ─
    const porData = await prisma.documentoJuridico.create({
      data: { titulo: `${tag} por data`, tipo: "contrato", clienteId: cliente.id, projetoId: projeto.id, valor: 1000, statusContrato: "assinado", assinadoEm: d(hoje) },
    });
    const cat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { codigo: "1.01" }, select: { id: true } });
    await prisma.lancamento.create({
      data: { tipo: "receita", status: "previsao", descricao: "previsão pendurada", valor: 1000, data: d(hoje), vencimento: d(hoje), categoriaId: cat.id, contratoId: porData.id, autorId: admin.id },
    });
    const g = await prisma.$transaction((tx) =>
      gerarRecebiveisDoContrato(tx, {
        contratoId: porData.id,
        titulo: porData.titulo,
        clienteId: cliente.id,
        projetoId: projeto.id,
        valor: 1000,
        parcelas: 2,
        primeiroVencimento: d(hoje),
        autorId: admin.id,
      }),
    );
    check("por data: previsão não conta na idempotência — as 2 parcelas nascem", g.criadas === 2, g);

    // ── 6. Contrato SEM projeto: a parcela da assinatura também vira previsão ──
    const semProjeto = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} sem projeto`,
        tipo: "contrato",
        clienteId: cliente.id,
        valor: 500,
        statusContrato: "assinado",
        assinadoEm: d(hoje),
        formaCobranca: "por_entrega",
        parcelasEntrega: { create: [{ descricao: "Assinatura", percentual: 100, ordem: 0, naAssinatura: true }] },
      },
    });
    extras.push(semProjeto.id);
    await sincronizarPrevisoesDoContrato(semProjeto.id, admin.id);
    const prevSemProjeto = await prisma.lancamento.findMany({ where: { contratoId: semProjeto.id, status: "previsao" } });
    check("contrato sem projeto: previsão da assinatura nasce, sem projeto", prevSemProjeto.length === 1 && Number(prevSemProjeto[0].valor) === 500 && prevSemProjeto[0].projetoId === null);

    // ── 7. Parcelas manuais do projeto × contrato (L6) ───────────────────
    let aviso = avisoCobrancaContrato(await contratosDeCobranca(projeto.id));
    check("L6: contrato por entrega em vigor → 'Gerar parcelas' do projeto é recusado", aviso?.nivel === "recusa" && aviso.texto.includes(contrato.titulo), aviso);
    const disciplina = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Elétrica", valor: 111 } });
    const erroDe = async (p: Promise<unknown>) => {
      try {
        await p;
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };
    const recusaEntrega = await erroDe(faturarEntregaDaDisciplina({ disciplinaId: disciplina.id, valor: 2500, autorId: admin.id }));
    check("B1: contrato por entrega em vigor → 'Faturar entrega' é recusado", !!recusaEntrega && /cobrado por entrega/.test(recusaEntrega), recusaEntrega);
    await prisma.documentoJuridico.update({ where: { id: contrato.id }, data: { statusContrato: "rescindido" } });
    aviso = avisoCobrancaContrato(await contratosDeCobranca(projeto.id));
    check("L6: rescindido não conta; contrato por data sem plano definido não avisa", aviso === null, aviso);
    await prisma.documentoJuridico.update({ where: { id: porData.id }, data: { parcelas: 2, primeiroVencimento: d(hoje) } });
    aviso = avisoCobrancaContrato(await contratosDeCobranca(projeto.id));
    check("L6: contrato por data com plano definido → só avisa, não recusa", aviso?.nivel === "aviso", aviso);

    // ── 8. Faturar entrega (B1): cobra o valor informado, nunca o pool dos projetistas ──
    const semValor = await erroDe(faturarEntregaDaDisciplina({ disciplinaId: disciplina.id, valor: 0, autorId: admin.id }));
    check("B1: sem valor informado é recusado", !!semValor && /valor a cobrar/.test(semValor), semValor);
    const fatEntrega = await faturarEntregaDaDisciplina({ disciplinaId: disciplina.id, valor: 2500, autorId: admin.id });
    const rec = await prisma.lancamento.findFirst({ where: { projetoId: projeto.id, tags: { has: `entrega:${disciplina.id}` } } });
    check("B1: a receita prevista sai com o valor INFORMADO (2500), não com o pool da disciplina (111)", fatEntrega.projetoId === projeto.id && Number(rec?.valor) === 2500 && rec?.status === "previsto" && rec.tipo === "receita", rec);
    const dobro = await erroDe(faturarEntregaDaDisciplina({ disciplinaId: disciplina.id, valor: 2500, autorId: admin.id }));
    check("B1: faturar a mesma disciplina de novo é recusado", !!dobro && /já foi faturada/.test(dobro), dobro);
  } finally {
    // Limpeza — parcelas (FK para o lançamento) antes dos lançamentos, contratos, EAP.
    const contratos = await prisma.documentoJuridico.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    const ids = [...contratos.map((c) => c.id), ...extras];
    await prisma.contratoParcelaEntrega.deleteMany({ where: { contratoId: { in: ids } } });
    await prisma.lancamento.deleteMany({ where: { OR: [{ contratoId: { in: ids } }, { projetoId: projeto.id }] } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.documentoJuridico.deleteMany({ where: { id: { in: ids } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
