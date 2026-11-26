/**
 * Smoke do parceiro externo (pool de recursos, parte 6 — decisão 4) contra o banco de dev. Monta, confere e apaga.
 *
 *   1. Cadastro: nome único sem diferença de maiúscula (também no banco), editar, arquivar, excluir só sem uso.
 *   2. O parceiro só nomeia a etapa de terceiro (CHECK no banco) e não deixa de ser "sem horas".
 *   3. Arquivado sai das escolhas da EAP; a tarefa que já o tem segue com o nome.
 *   4. Tela por pessoa: faixa própria com as tarefas dele, sem horas; o Externo sem nome continua sem faixa.
 *   5. Planejamento geral: o nome do parceiro na linha.
 *
 * Uso: npm run smoke:parceiro-externo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { criarParceiro, definirParceiroAtivo, editarParceiro, excluirParceiro } from "../src/modules/planejamento/parceiros/service";
import { parceirosExternos, parceirosParaEscolha } from "../src/modules/planejamento/parceiros/queries";
import { MOTIVO_NOME_REPETIDO } from "../src/modules/planejamento/parceiros/regras";
import { planejadorDaEquipe } from "../src/modules/planejamento/planejador-queries";
import { planejamentoGeral } from "../src/modules/planejamento/planejamento-geral-queries";
import { planoDoProjeto } from "../src/modules/planejamento/agenda";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-parceiro-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const P = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: 2026, sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-P`, clienteId: cliente.id, situacao: "em_andamento" },
  });
  const parceiros: string[] = [];
  try {
    // ── 1. Cadastro ─────────────────────────────────────────────────────────────────────────────────────────────────
    const clima = await criarParceiro({ nome: `  ${tag}   Climatização `, disciplinaId: null });
    parceiros.push(clima.id);
    const gravado = await prisma.parceiroExterno.findUniqueOrThrow({ where: { id: clima.id } });
    check("nome normalizado (espaços)", gravado.nome === `${tag} Climatização`, gravado.nome);
    check("nome repetido sem diferença de maiúscula é recusado", (await erroDe(() => criarParceiro({ nome: `${tag} CLIMATIZAÇÃO`, disciplinaId: null }))) === MOTIVO_NOME_REPETIDO);
    const bancoRecusa = await erroDe(() => prisma.parceiroExterno.create({ data: { nome: `${tag} climatização ` } }));
    check("o banco também recusa (índice lower(btrim(nome)))", bancoRecusa != null);
    const laudo = await criarParceiro({ nome: `${tag} Laudos`, disciplinaId: null });
    parceiros.push(laudo.id);
    check("editar para um nome que já existe é recusado", (await erroDe(() => editarParceiro({ id: laudo.id, nome: `${tag} climatização`, disciplinaId: null }))) === MOTIVO_NOME_REPETIDO);

    // ── 2. Só na etapa de terceiro ──────────────────────────────────────────────────────────────────────────────────
    await prisma.cronogramaProjeto.create({ data: { projetoId: P.id, inicioProjeto: d("2027-01-04"), aprovado: true } });
    const linha = (nome: string, ordem: number) =>
      prisma.eapTarefa.create({ data: { projetoId: P.id, nome, tipoEap: "atv", duracaoDias: 5, ordem, inicioPrevisto: d("2027-01-04"), fimPrevisto: d("2027-01-04") } });
    const T1 = await linha("Projeto de climatização", 0);
    const T2 = await linha("Aprovação na prefeitura", 1);
    const T3 = await linha("Modelagem", 2);
    const pessoa = await prisma.user.findFirstOrThrow({ where: { ativo: true, tipo: "interno" }, select: { id: true } });
    const papelErrado = await erroDe(() => prisma.eapAtribuicao.create({ data: { tarefaId: T3.id, userId: pessoa.id, papel: "pro", parceiroId: clima.id } }));
    check("parceiro em atribuição de pessoa: o banco recusa (CHECK)", papelErrado != null && /parceiro_so_externo|check/i.test(papelErrado), papelErrado);
    await prisma.eapAtribuicao.create({ data: { tarefaId: T1.id, papel: "ext", horasPrevistas: 0, parceiroId: clima.id } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: T2.id, papel: "ext", horasPrevistas: 0 } });
    const plano = await planoDoProjeto(P.id);
    check("etapa de terceiro com parceiro segue sem horas no motor", (plano?.resultado.linhas.get(T1.id)?.trabalhoHoras ?? 0) === 0, plano?.resultado.linhas.get(T1.id)?.trabalhoHoras);

    // ── 1b. Excluir só sem uso ──────────────────────────────────────────────────────────────────────────────────────
    const emUso = await erroDe(() => excluirParceiro({ id: clima.id }));
    check("excluir parceiro em uso é recusado (arquive)", emUso === "Este parceiro está em 1 tarefa do cronograma: arquive em vez de excluir.", emUso);
    check("a FK também segura (Restrict)", (await erroDe(() => prisma.parceiroExterno.delete({ where: { id: clima.id } }))) != null);

    // ── 3. Arquivar ─────────────────────────────────────────────────────────────────────────────────────────────────
    await definirParceiroAtivo({ id: clima.id, ativo: false });
    const escolhas = (await parceirosParaEscolha()).map((p) => p.id);
    check("arquivado sai das escolhas da EAP; o ativo fica", !escolhas.includes(clima.id) && escolhas.includes(laudo.id));
    const naLista = (await parceirosExternos()).find((p) => p.id === clima.id);
    check("a lista conta a tarefa e mostra arquivado", naLista?.tarefas === 1 && naLista.abertas === 1 && !naLista.ativo, naLista);
    await definirParceiroAtivo({ id: clima.id, ativo: true });

    // ── 4. Tela por pessoa ──────────────────────────────────────────────────────────────────────────────────────────
    const viewer = { id: pessoa.id } as Parameters<typeof planejadorDaEquipe>[0];
    const tela = await planejadorDaEquipe(viewer, { escala: "dias", inicio: "2027-01-04", editarDedicacao: false });
    const faixa = tela.parceiros.find((f) => f.parceiroId === clima.id);
    check("faixa do parceiro com a tarefa dele, sem horas", faixa?.barras.map((b) => b.linhaId).join() === T1.id && faixa.barras[0].horas === 0, faixa);
    check("parceiro ativo sem tarefa também tem faixa", tela.parceiros.some((f) => f.parceiroId === laudo.id && f.barras.length === 0));
    const todas = [...tela.faixas.flatMap((f) => f.barras), ...tela.semNinguem.barras, ...tela.parceiros.flatMap((f) => f.barras)].map((b) => b.linhaId);
    check("Externo sem nome continua sem faixa (nem na de ninguém)", !todas.includes(T2.id));

    // ── 5. Planejamento geral ───────────────────────────────────────────────────────────────────────────────────────
    const geral = await planejamentoGeral({ de: "2027-01-04", ate: "2027-01-31" }, "2026-11-27");
    const l1 = geral.projetos.find((p) => p.id === P.id)?.linhas.find((l) => l.id === T1.id);
    const l2 = geral.projetos.find((p) => p.id === P.id)?.linhas.find((l) => l.id === T2.id);
    check("Planejamento geral: o nome do parceiro na linha; sem nome = nulo", l1?.externo === true && l1.parceiro === `${tag} Climatização` && l2?.externo === true && l2.parceiro === null, { l1, l2 });

    // ── 1c. Excluir sem uso ─────────────────────────────────────────────────────────────────────────────────────────
    await excluirParceiro({ id: laudo.id });
    check("excluir sem uso funciona", (await prisma.parceiroExterno.findUnique({ where: { id: laudo.id } })) == null);
  } finally {
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: P.id } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: P.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: P.id } });
    await prisma.tarefa.deleteMany({ where: { projetoId: P.id } });
    await prisma.projeto.delete({ where: { id: P.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.parceiroExterno.deleteMany({ where: { OR: [{ id: { in: parceiros } }, { nome: { startsWith: tag } }] } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
