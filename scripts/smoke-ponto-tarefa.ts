/**
 * Smoke do apontamento por tarefa (F6 — D20) contra o banco de dev. Exercita o que o vitest
 * não alcança: a validação e a gravação da tarefa DENTRO da transação da batida, a lista curta
 * lendo card e janela da EAP, e a edição de um dia recriando as batidas sem perder a tarefa.
 *
 *   1. Lista curta: só card ABERTO da pessoa, no projeto; card de EAP só na janela; nunca todos.
 *   2. Entrada com tarefa grava a tarefa na sessão E na batida.
 *   3. Recusas (mesma frase da tela): tarefa de outra pessoa, de outro projeto, com reunião.
 *   4. Sem tarefa continua funcionando exatamente como antes (o caso normal).
 *   5. Descanso e saída ignoram o campo em vez de falhar por causa dele.
 *   6. Editar o dia (só corrigindo a hora) preserva a tarefa da entrada.
 *   7. Apagar a tarefa NÃO apaga as horas (SetNull).
 *   8. EAP (F6.3): horas apontadas chegam na linha via card; checklist vira sugestão de %;
 *      horas apontadas NÃO viram sugestão; linha sem card não tem nada a sugerir.
 *   9. D19: linha com disciplina, card e checklist (o caso REAL — só linha com disciplina tem
 *      responsável herdado e, portanto, card) mostra o % INFORMADO e oferece as duas
 *      sugestões; linha-resumo é a única marcada como calculada.
 *
 * Uso: npm run smoke:ponto-tarefa
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { aplicarBatida, editarDia } from "../src/modules/ponto/service";
import { tarefasParaPonto } from "../src/modules/ponto/tarefa-ponto-service";
import { abrirApontamento, fecharApontamento } from "../src/modules/ponto/apontamento";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { progressoDoStatus } from "../src/modules/projetos/status";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-ponto-tarefa-${Date.now()}`;
const dia = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function recusa(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const [maria, joao, pj] = await Promise.all(
    [
      { n: "maria", role: "clt" as const },
      { n: "joao", role: "clt" as const },
      { n: "pj", role: "projetista_pj" as const },
    ].map((x) =>
      prisma.user.create({ data: { name: `${tag}-${x.n}`, email: `${tag}-${x.n}@t.local`, role: x.role, emailVerified: false } }),
    ),
  );
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-c` } });
  const mk = (nome: string, seq: number) =>
    prisma.projeto.create({
      data: { codigo: `${Date.now()}`.slice(-5) + seq, ano: 2026, sequencial: Number(`${Date.now()}`.slice(-5)) + seq, nome: `${tag}-${nome}`, clienteId: cliente.id },
    });
  const [proj, outro] = [await mk("p1", 1), await mk("p2", 2)];
  const status = await prisma.tarefaStatus.findFirstOrThrow({ where: { ativo: true, concluido: false }, orderBy: { ordem: "asc" } });
  const statusFim = await prisma.tarefaStatus.findFirst({ where: { ativo: true, concluido: true } });

  const card = (titulo: string, projetoId: string, resp: string[], extra: Record<string, unknown> = {}) =>
    prisma.tarefa.create({
      data: {
        titulo,
        statusId: status.id,
        projetoId,
        criadorId: maria.id,
        responsaveis: { create: resp.map((userId) => ({ userId })) },
        ...extra,
      },
    });

  try {
    // Linhas de EAP para dar janela aos cards.
    const linhaAgora = await prisma.eapTarefa.create({
      data: { projetoId: proj.id, nome: "Modelagem", tipoEap: "atv", duracaoDias: 5, inicioPrevisto: d(dia(-1)), fimPrevisto: d(dia(3)) },
    });
    const linhaFutura = await prisma.eapTarefa.create({
      data: { projetoId: proj.id, nome: "Detalhamento", tipoEap: "atv", duracaoDias: 5, inicioPrevisto: d(dia(90)), fimPrevisto: d(dia(95)) },
    });

    const tAgora = await card("Modelagem", proj.id, [maria.id], { eapTarefaId: linhaAgora.id });
    const tFutura = await card("Detalhamento", proj.id, [maria.id], { eapTarefaId: linhaFutura.id });
    const tManual = await card("Ajuste manual", proj.id, [maria.id]);
    const tDoJoao = await card("Do João", proj.id, [joao.id]);
    const tOutroProj = await card("Outro projeto", outro.id, [maria.id]);
    const tConcluida = statusFim ? await card("Já concluída", proj.id, [maria.id], { statusId: statusFim.id }) : null;

    // ── 1. Lista curta ─────────────────────────────────────────────────────
    const lista = await tarefasParaPonto(maria.id, proj.id);
    const ids = lista.map((t) => t.id);
    check("lista curta: card de EAP na janela e card manual entram", ids.includes(tAgora.id) && ids.includes(tManual.id), ids);
    check("lista curta: card de EAP fora do período NÃO entra", !ids.includes(tFutura.id));
    check("lista curta: card de outra pessoa, de outro projeto e concluído NÃO entram", !ids.includes(tDoJoao.id) && !ids.includes(tOutroProj.id) && (!tConcluida || !ids.includes(tConcluida.id)));
    check("lista curta: o card na janela exata vem primeiro", ids[0] === tAgora.id, ids);

    // ── 2. Entrada com tarefa ──────────────────────────────────────────────
    const t0 = new Date(Date.now() - 4 * 3_600_000);
    await aplicarBatida({ userId: maria.id, tipo: "entrada", horario: t0, projetoId: proj.id, tarefaId: tAgora.id, origem: "app" });
    const sess = await prisma.sessaoTrabalho.findFirst({ where: { userId: maria.id, fim: null } });
    const bat = await prisma.batida.findFirst({ where: { userId: maria.id, tipo: "entrada" } });
    check("entrada com tarefa: grava na sessão", sess?.tarefaId === tAgora.id, sess?.tarefaId);
    check("entrada com tarefa: grava na batida", bat?.tarefaId === tAgora.id, bat?.tarefaId);

    // ── 5. Descanso e saída ignoram o campo ────────────────────────────────
    const t1 = new Date(Date.now() - 3 * 3_600_000);
    const ok5 = await recusa(() => aplicarBatida({ userId: maria.id, tipo: "inicio_descanso", horario: t1, tarefaId: "qualquer-coisa", origem: "app" }));
    check("descanso ignora tarefaId em vez de falhar", ok5 == null, ok5);

    // ── 3. Recusas ─────────────────────────────────────────────────────────
    const t2 = new Date(Date.now() - 2.5 * 3_600_000);
    const deOutro = await recusa(() => aplicarBatida({ userId: maria.id, tipo: "fim_descanso", horario: t2, projetoId: proj.id, tarefaId: tDoJoao.id, origem: "app" }));
    check("recusa tarefa de outra pessoa", /não é responsável/.test(deOutro ?? ""), deOutro);
    const deOutroProj = await recusa(() => aplicarBatida({ userId: maria.id, tipo: "fim_descanso", horario: t2, projetoId: proj.id, tarefaId: tOutroProj.id, origem: "app" }));
    check("recusa tarefa de outro projeto", /não é do projeto/.test(deOutroProj ?? ""), deOutroProj);
    const reuniao = await recusa(() => aplicarBatida({ userId: maria.id, tipo: "fim_descanso", horario: t2, projetoId: "__reuniao_interna", tarefaId: tAgora.id, origem: "app" }));
    check("recusa tarefa quando a jornada é reunião", /alocada num projeto/.test(reuniao ?? ""), reuniao);
    const abertas = await prisma.sessaoTrabalho.count({ where: { userId: maria.id, fim: null } });
    check("recusa não deixa lixo: nenhuma sessão nova aberta", abertas === 0, abertas);

    // ── 4. Sem tarefa: o caso normal ───────────────────────────────────────
    await aplicarBatida({ userId: maria.id, tipo: "fim_descanso", horario: t2, projetoId: proj.id, origem: "app" });
    const semTarefa = await prisma.sessaoTrabalho.findFirst({ where: { userId: maria.id, fim: null } });
    check("sem tarefa continua funcionando como antes", semTarefa != null && semTarefa.tarefaId === null && semTarefa.projetoId === proj.id);
    await aplicarBatida({ userId: maria.id, tipo: "saida", horario: new Date(Date.now() - 2 * 3_600_000), origem: "app" });

    // ── 6. Editar o dia preserva a tarefa ──────────────────────────────────
    const hoje = new Date(t0.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); // dia local da entrada
    const batidasHoje = await prisma.batida.findMany({ where: { userId: maria.id }, orderBy: { horario: "asc" } });
    const diaBatida = batidasHoje[0].dia.toISOString().slice(0, 10);
    const hhmm = (dt: Date) => {
      const local = new Date(dt.getTime() - 3 * 3_600_000);
      return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
    };
    void hoje;
    await editarDia({
      userId: maria.id,
      editorId: maria.id,
      diaISO: diaBatida,
      itens: batidasHoje.map((b) => ({ tipo: b.tipo as never, hora: hhmm(b.horario), projetoId: b.projetoId })),
      justificativa: "smoke — corrigir horário",
      proprio: true,
    });
    const depois = await prisma.sessaoTrabalho.findMany({ where: { userId: maria.id }, orderBy: { inicio: "asc" } });
    check("editar o dia: a sessão da entrada mantém a tarefa", depois[0]?.tarefaId === tAgora.id, depois.map((s) => s.tarefaId));
    check("editar o dia: a sessão da volta (sem tarefa) continua sem", depois[1]?.tarefaId === null, depois.map((s) => s.tarefaId));

    // ── PJ: apontamento ────────────────────────────────────────────────────
    const tPj = await card("Do PJ", proj.id, [pj.id]);
    await abrirApontamento(pj.id, proj.id, tPj.id);
    const sPj = await prisma.sessaoTrabalho.findFirst({ where: { userId: pj.id, fim: null } });
    check("apontamento do PJ grava a tarefa", sPj?.tarefaId === tPj.id, sPj?.tarefaId);
    await fecharApontamento(pj.id);

    // ── 8. EAP: apontado e sugestão de % ───────────────────────────────────
    await prisma.tarefaItem.createMany({
      data: [
        { tarefaId: tAgora.id, descricao: "a", concluido: true, ordem: 0 },
        { tarefaId: tAgora.id, descricao: "b", concluido: true, ordem: 1 },
        { tarefaId: tAgora.id, descricao: "c", concluido: true, ordem: 2 },
        { tarefaId: tAgora.id, descricao: "d", concluido: false, ordem: 3 },
      ],
    });
    const eap = await eapDoProjeto(proj.id, { verDatas: true });
    const dtoAgora = eap.tarefas.find((x) => x.id === linhaAgora.id);
    const dtoFutura = eap.tarefas.find((x) => x.id === linhaFutura.id);
    check("EAP: horas apontadas chegam na linha pelo card", (dtoAgora?.horasApontadas ?? 0) > 0, dtoAgora?.horasApontadas);
    check(
      "EAP: checklist 3/4 vira sugestão de 75%",
      dtoAgora?.sugestoesProgresso.length === 1 && dtoAgora.sugestoesProgresso[0].origem === "checklist" && dtoAgora.sugestoesProgresso[0].valor === 75,
      dtoAgora?.sugestoesProgresso,
    );
    check("EAP: horas apontadas não viram sugestão de %", dtoAgora?.sugestoesProgresso.every((x) => x.origem !== ("horas" as never)) === true);
    check("EAP: linha com card sem checklist ou apontado não sugere nada", dtoFutura?.sugestoesProgresso.length === 0 && dtoFutura.horasApontadas === 0, dtoFutura?.sugestoesProgresso);

    // ── 9. D19: o caso real — linha COM disciplina ─────────────────────────
    const disc = await prisma.disciplina.create({
      data: { projetoId: proj.id, disciplinaTextoLegado: "Elétrica", status: "em_andamento" },
    });
    const pai = await prisma.eapTarefa.create({
      data: { projetoId: proj.id, nome: "Elétrica (grupo)", tipoEap: "res", inicioPrevisto: d(dia(-1)), fimPrevisto: d(dia(3)) },
    });
    const filha = await prisma.eapTarefa.create({
      data: {
        projetoId: proj.id,
        parentId: pai.id,
        disciplinaId: disc.id,
        nome: "Circuitos",
        tipoEap: "atv",
        duracaoDias: 5,
        progresso: 30, // o coordenador INFORMOU 30%
        inicioPrevisto: d(dia(-1)),
        fimPrevisto: d(dia(3)),
      },
    });
    const cardFilha = await card("Circuitos", proj.id, [maria.id], { eapTarefaId: filha.id, disciplinaId: disc.id });
    await prisma.tarefaItem.createMany({
      data: [
        { tarefaId: cardFilha.id, descricao: "x", concluido: true, ordem: 0 },
        { tarefaId: cardFilha.id, descricao: "y", concluido: false, ordem: 1 },
      ],
    });
    const eap2 = await eapDoProjeto(proj.id, { verDatas: true });
    const dFilha = eap2.tarefas.find((x) => x.id === filha.id);
    const dPai = eap2.tarefas.find((x) => x.id === pai.id);
    check("D19: folha com disciplina mostra o % INFORMADO (30), não o do status da disciplina", dFilha?.progresso === 30, dFilha?.progresso);
    check("D19: folha com disciplina NÃO é 'derivada' — as sugestões têm de aparecer", dFilha?.progressoDerivado === false);
    check(
      "D19: as duas sugestões aparecem (checklist 1/2 = 50% e a situação da disciplina)",
      JSON.stringify(dFilha?.sugestoesProgresso.map((x) => [x.origem, x.valor])) ===
        JSON.stringify([["checklist", 50], ["status_disciplina", progressoDoStatus("em_andamento")]]),
      dFilha?.sugestoesProgresso,
    );
    check("D19: só a linha-resumo é marcada como calculada", dPai?.progressoDerivado === true && dPai.progresso === 30, [dPai?.progressoDerivado, dPai?.progresso]);

    // ── 7. Apagar a tarefa não apaga as horas ──────────────────────────────
    const antes = await prisma.sessaoTrabalho.count({ where: { userId: maria.id } });
    await prisma.tarefa.delete({ where: { id: tAgora.id } });
    const apos = await prisma.sessaoTrabalho.findMany({ where: { userId: maria.id } });
    check("apagar a tarefa mantém as sessões (SetNull)", apos.length === antes && apos.every((s) => s.tarefaId === null), { antes, apos: apos.length });
  } finally {
    const ids = [maria.id, joao.id, pj.id];
    await prisma.ajustePonto.deleteMany({ where: { userId: { in: ids } } });
    await prisma.batida.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoTrabalho.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: { in: [proj.id, outro.id] } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: proj.id, parentId: { not: null } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: proj.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: proj.id } });
    await prisma.projeto.deleteMany({ where: { id: { in: [proj.id, outro.id] } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
