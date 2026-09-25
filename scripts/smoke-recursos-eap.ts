/**
 * Smoke dos recursos na linha da EAP (F5) contra o banco de dev. Exercita o que o vitest
 * não alcança: o I/O de `recursos-service.ts` e as ligações com o motor, o verificador, a
 * baseline e a aprovação. O dev não tem nenhum projeto em que a herança do responsável
 * aconteça de verdade — este smoke monta um, confere e apaga.
 *
 *   1. Herança (D22): responsáveis da disciplina descem para atividade e marco; resumo não.
 *      Rodar de novo não duplica. Principal = primeiro por nome.
 *   2. Verificador: com a herança, ninguém fica "sem responsável"; quem está sem hora é
 *      acusado como INFO — menos na etapa de terceiro e no marco.
 *   3. Motor: horas conhecidas sobem pela árvore; etapa de terceiro conta como zero conhecido.
 *   4. Rascunho não gera card (D14). Aprovar gera card só para atividade da casa com gente
 *      (D24), com todos os responsáveis; a baseline grava as horas.
 *   5. Tirar o principal promove o próximo; o card acompanha os responsáveis e o prazo
 *      reprogramado (D32). Linha concluída mantém o card.
 *   6. Atividade que vira agrupamento com gente dentro é acusada.
 *   7. Carga da equipe: duas atividades paralelas de 40 h para a mesma pessoa estouram a
 *      semana; as duas sugestões (atrasar e passar) saem VERIFICADAS e resolvendo.
 *   8. Custo previsto (F7.1): horas × custo/hora; pessoa sem taxa deixa a linha e o resumo
 *      desconhecidos (nunca zero); quem não vê financeiro não recebe custo; a baseline congela.
 *   9. Valor Agregado (F8): baseline guarda quem era agrupamento; VP/VA/CR em horas e em R$ na
 *      Data de Status; agrupamento não conta em dobro; sem taxa, o CR em R$ fica desconhecido.
 *
 * Uso: npm run smoke:recursos-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planoDoProjeto, reagendarProjeto } from "../src/modules/planejamento/agenda";
import { cargaDaEquipe } from "../src/modules/planejamento/recursos-queries";
import { tarefasTravadasPeloCronograma } from "../src/modules/tarefas/queries";
import { aprovarCronograma, avaliarQualidade } from "../src/modules/planejamento/service";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { valorAgregadoDoProjeto } from "../src/modules/planejamento/valor-agregado-service";
import {
  herdarResponsaveisNoProjeto,
  sincronizarCards,
  sincronizarPrincipal,
} from "../src/modules/planejamento/recursos-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-recursos-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const cli = await prisma.eapCatalogo.findFirst({ where: { categoria: "origem", sigla: "CLI", projetoId: null } });
  if (!cli) throw new Error("Catálogo de origem sem CLI — rode npm run db:seed.");

  // Nomes com prefixo A/B: a herança escolhe o principal por nome.
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

  try {
    const disciplina = await prisma.disciplina.create({
      data: {
        projetoId: projeto.id,
        disciplinaTextoLegado: "Elétrica",
        responsaveis: { create: [{ userId: pjB.id }, { userId: pjA.id }] },
      },
    });

    const base = { projetoId: projeto.id, disciplinaId: disciplina.id, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-05") };
    const R = await prisma.eapTarefa.create({ data: { ...base, nome: "Elétrica", tipoEap: "disc", ordem: 0 } });
    const A = await prisma.eapTarefa.create({ data: { ...base, parentId: R.id, nome: "Modelagem", tipoEap: "atv", duracaoDias: 5, ordem: 1 } });
    const B = await prisma.eapTarefa.create({ data: { ...base, parentId: R.id, nome: "Dimensionamento", tipoEap: "atv", duracaoDias: 5, ordem: 2 } });
    const T = await prisma.eapTarefa.create({
      data: { ...base, parentId: R.id, nome: "Aprovação do cliente", tipoEap: "atv", duracaoDias: 10, ordem: 3, origemId: cli.id },
    });
    const M = await prisma.eapTarefa.create({ data: { ...base, parentId: R.id, nome: "Entrega", tipoEap: "mrc", duracaoDias: 0, ordem: 4 } });
    await prisma.eapDependencia.createMany({
      data: [
        { tarefaId: B.id, predecessoraId: A.id },
        { tarefaId: T.id, predecessoraId: B.id },
        { tarefaId: M.id, predecessoraId: T.id },
      ],
    });

    // ── 1. Herança ─────────────────────────────────────────────────────────
    const herdadas = await herdarResponsaveisNoProjeto(prisma, projeto.id);
    check("herança: 2 responsáveis × 4 linhas executáveis (atividades + marco)", herdadas === 8, herdadas);
    check("herança: o agrupamento não recebe ninguém", (await prisma.eapAtribuicao.count({ where: { tarefaId: R.id } })) === 0);
    const principalA = await prisma.eapAtribuicao.findFirst({ where: { tarefaId: A.id, principal: true } });
    check("herança: principal é o primeiro por nome", principalA?.userId === pjA.id, principalA?.userId);
    check("herança: rodar de novo não duplica", (await herdarResponsaveisNoProjeto(prisma, projeto.id)) === 0);

    // ── 2. Verificador ─────────────────────────────────────────────────────
    let q = await avaliarQualidade(projeto.id);
    const regras = (regra: string) => (q?.achados ?? []).filter((a) => a.regra === regra).map((a) => a.tarefaId);
    check("verificador: ninguém sem responsável depois da herança", regras("sem_responsavel").length === 0, regras("sem_responsavel"));
    check(
      "verificador: sem hora acusado nas atividades da casa, não no terceiro nem no marco",
      JSON.stringify(regras("atribuicao_sem_horas").sort()) === JSON.stringify([A.id, B.id].sort()),
      regras("atribuicao_sem_horas"),
    );
    check("verificador: sem hora é INFO", (q?.achados ?? []).filter((a) => a.regra === "atribuicao_sem_horas").every((a) => a.severidade === "info"));

    // ── 3. Horas no motor ──────────────────────────────────────────────────
    const at = async (tarefaId: string, userId: string) =>
      prisma.eapAtribuicao.findFirstOrThrow({ where: { tarefaId, userId } });
    await prisma.eapAtribuicao.update({ where: { id: (await at(A.id, pjA.id)).id }, data: { horasPrevistas: 40 } });
    await prisma.eapAtribuicao.update({ where: { id: (await at(B.id, pjA.id)).id }, data: { horasPrevistas: 24 } });
    await prisma.eapAtribuicao.update({ where: { id: (await at(B.id, pjB.id)).id }, data: { horasPrevistas: 16 } });
    const plano = await planoDoProjeto(projeto.id);
    const h = (id: string) => plano?.resultado.linhas.get(id)?.trabalhoHoras;
    check("motor: horas da linha = soma das atribuições", h(A.id) === 40 && h(B.id) === 40, [h(A.id), h(B.id)]);
    check("motor: etapa de terceiro é zero CONHECIDO", h(T.id) === 0, h(T.id));
    check("motor: agrupamento soma os filhos", h(R.id) === 80, h(R.id));
    q = await avaliarQualidade(projeto.id);
    check("verificador: sobra só o B de A sem hora", JSON.stringify(regras("atribuicao_sem_horas")) === JSON.stringify([A.id]), regras("atribuicao_sem_horas"));

    // ── 8. Custo previsto (F7.1) ───────────────────────────────────────────
    // A: 40 h do A. B: 24 h do A + 16 h do B. Só o A tem taxa, por enquanto.
    await prisma.recurso.create({ data: { userId: pjA.id, custoHora: 100 } });
    let eap = await eapDoProjeto(projeto.id, { verCusto: true });
    const c = (id: string) => eap.tarefas.find((t) => t.id === id);
    check("custo: A = 40 h × 100", c(A.id)?.custo === 4000, c(A.id)?.custo);
    check("custo: B com pessoa sem taxa é DESCONHECIDO, com o motivo", c(B.id)?.custo === null && c(B.id)?.custoMotivo === "sem_custo_hora", c(B.id));
    check("custo: resumo com filho desconhecido é desconhecido", c(R.id)?.custo === null && c(R.id)?.custoMotivo === "filho_sem_custo");
    check("custo: total desconhecido", eap.custoTotal?.custo === null);
    await prisma.recurso.create({ data: { userId: pjB.id, custoHora: 50 } });
    eap = await eapDoProjeto(projeto.id, { verCusto: true });
    check("custo: B = 24 × 100 + 16 × 50", c(B.id)?.custo === 3200, c(B.id)?.custo);
    check("custo: etapa de terceiro e marco custam zero conhecido", c(T.id)?.custo === 0 && c(M.id)?.custo === 0, [c(T.id)?.custo, c(M.id)?.custo]);
    check("custo: resumo soma os filhos (7200) e é o total", c(R.id)?.custo === 7200 && eap.custoTotal?.custo === 7200, [c(R.id)?.custo, eap.custoTotal]);
    const semVer = await eapDoProjeto(projeto.id);
    check("custo: quem não vê financeiro não recebe custo nenhum", semVer.custoTotal === null && semVer.tarefas.every((t) => t.custo === null && t.custoMotivo === null));

    // ── 4. Rascunho × aprovado ─────────────────────────────────────────────
    // SEM reagendar de propósito: as colunas de data gravadas ficam com a data de criação
    // (05/10 em todas), e o motor diz outra coisa. O card tem de nascer com a data do MOTOR.
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05"), dataStatus: d("2026-10-05") } });
    const emRascunho = await sincronizarCards(prisma, projeto.id, admin.id);
    check("rascunho não gera card (D14)", emRascunho.criados === 0 && (await prisma.tarefa.count({ where: { projetoId: projeto.id } })) === 0);

    const aprovacao = await aprovarCronograma(projeto.id, admin.id);
    check("aprovar gera card só para as 2 atividades da casa com gente", aprovacao.cardsCriados === 2, aprovacao.cardsCriados);
    const card = (eapTarefaId: string) =>
      prisma.tarefa.findUnique({ where: { eapTarefaId }, select: { id: true, prazo: true, responsaveis: { select: { userId: true } } } });
    const cardA = await card(A.id);
    check(
      "card leva todos os responsáveis da linha",
      JSON.stringify(cardA?.responsaveis.map((r) => r.userId).sort()) === JSON.stringify([pjA.id, pjB.id].sort()),
      cardA?.responsaveis,
    );
    check("terceiro e marco sem card", (await card(T.id)) === null && (await card(M.id)) === null);
    // Trava do card (regra única de `editarTarefa` e da tela): só com cronograma aprovado.
    const travadas = await tarefasTravadasPeloCronograma([{ id: cardA!.id, eapTarefaId: A.id }]);
    check("card de cronograma aprovado fica travado para edição", travadas.has(cardA!.id));
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: false } });
    check(
      "cronograma em rascunho não trava (card antigo segue livre)",
      !(await tarefasTravadasPeloCronograma([{ id: cardA!.id, eapTarefaId: A.id }])).has(cardA!.id),
    );
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });
    check("card sem eapTarefaId nunca trava", (await tarefasTravadasPeloCronograma([{ id: "x", eapTarefaId: null }])).size === 0);
    const bl = await prisma.eapBaselineLinha.findMany({ where: { tarefaId: { in: [A.id, R.id] } }, select: { tarefaId: true, trabalhoHoras: true } });
    const blA = bl.find((x) => x.tarefaId === A.id);
    const blR = bl.find((x) => x.tarefaId === R.id);
    check("baseline grava as horas", Number(blA?.trabalhoHoras) === 40 && Number(blR?.trabalhoHoras) === 80, bl);
    const blCusto = await prisma.eapBaselineLinha.findMany({ where: { tarefaId: { in: [A.id, R.id] } }, select: { tarefaId: true, custoPrevisto: true } });
    check(
      "baseline congela o custo previsto (VP da F8)",
      Number(blCusto.find((x) => x.tarefaId === A.id)?.custoPrevisto) === 4000 && Number(blCusto.find((x) => x.tarefaId === R.id)?.custoPrevisto) === 7200,
      blCusto,
    );

    // ── 9. Valor Agregado (F8) ─────────────────────────────────────────────
    const blResumo = await prisma.eapBaselineLinha.findFirstOrThrow({ where: { tarefaId: R.id }, select: { resumo: true } });
    check("baseline marca o agrupamento (resumo)", blResumo.resumo === true);
    const semData = await valorAgregadoDoProjeto(projeto.id, { verCusto: true });
    // O cronograma do smoke nasce com Data de Status; tirar e pôr de novo prova as duas pontas.
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { dataStatus: null } });
    const semStatus = await valorAgregadoDoProjeto(projeto.id, { verCusto: true });
    check("sem Data de Status: pede a data, sem número", !semStatus.ok && /Data de Status/.test(semStatus.motivo), semStatus);
    // Data de Status depois de tudo: VP = orçamento inteiro. A 50%, B 0%. 10 h do A apontadas.
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { dataStatus: d("2027-01-29") } });
    await prisma.eapTarefa.update({ where: { id: A.id }, data: { progresso: 50 } });
    await prisma.sessaoTrabalho.create({
      data: {
        userId: pjA.id,
        projetoId: projeto.id,
        tipoAlocacao: "projeto",
        inicio: new Date("2026-10-06T11:00:00.000Z"),
        fim: new Date("2026-10-06T21:00:00.000Z"),
      },
    });
    const evm = await valorAgregadoDoProjeto(projeto.id, { verCusto: true });
    const eh = evm.ok && evm.horas.ok ? evm.horas.indices : null;
    const ec = evm.ok && evm.custo?.ok ? evm.custo.indices : null;
    check(
      "EVM em horas: ONT 80 (agrupamento fora), VP 80, VA 20, CR 10, IDP 0,25, IDC 2",
      eh?.ont === 80 && eh.vp === 80 && eh.va === 20 && eh.cr === 10 && eh.idp === 0.25 && eh.idc === 2,
      { eh, semData: semData.ok },
    );
    check(
      "EVM em R$: ONT 7200, VA 2000 (metade do A), CR 1000 (10 h × 100)",
      ec?.ont === 7200 && ec.va === 2000 && ec.cr === 1000 && ec.idc === 2,
      ec,
    );
    const evmSemVer = await valorAgregadoDoProjeto(projeto.id, { verCusto: false });
    check("quem não vê financeiro: só horas", evmSemVer.ok && evmSemVer.custo === null && evmSemVer.horas.ok);
    // Alguém sem custo/hora aponta: o CR em R$ fica desconhecido (nunca zero) — horas seguem.
    const intruso = await prisma.user.create({
      data: { name: `${tag}-C`, email: `${tag}-c@teste.local`, role: "clt", emailVerified: false },
    });
    await prisma.sessaoTrabalho.create({
      data: {
        userId: intruso.id,
        projetoId: projeto.id,
        tipoAlocacao: "projeto",
        inicio: new Date("2026-10-07T11:00:00.000Z"),
        fim: new Date("2026-10-07T13:00:00.000Z"),
      },
    });
    const evm2 = await valorAgregadoDoProjeto(projeto.id, { verCusto: true });
    check(
      "apontou sem custo/hora: CR em R$ desconhecido, horas somam (12 h)",
      evm2.ok && evm2.custo?.ok === true && evm2.custo.indices.cr === null && evm2.horas.ok && evm2.horas.indices.cr === 12,
      evm2.ok ? { custo: evm2.custo, horasCr: evm2.horas.ok ? evm2.horas.indices.cr : null } : evm2,
    );
    await prisma.sessaoTrabalho.deleteMany({ where: { userId: intruso.id } });
    await prisma.user.delete({ where: { id: intruso.id } });
    await prisma.eapTarefa.update({ where: { id: A.id }, data: { progresso: 0 } });
    const blB = await prisma.eapBaselineLinha.findFirstOrThrow({ where: { tarefaId: B.id }, select: { fim: true } });
    const cardB = await card(B.id);
    const gravadoB = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: B.id }, select: { fimPrevisto: true } });
    check(
      "card nasce com o prazo do MOTOR (= baseline), não com a coluna gravada sem reagendar",
      cardB?.prazo?.toISOString().slice(0, 10) === blB.fim.toISOString().slice(0, 10) &&
        blB.fim.toISOString().slice(0, 10) !== gravadoB.fimPrevisto.toISOString().slice(0, 10),
      { card: cardB?.prazo, baseline: blB.fim, gravado: gravadoB.fimPrevisto },
    );

    // ── 5. Principal, responsáveis e prazo acompanham ──────────────────────
    await prisma.$transaction(async (tx) => {
      await tx.eapAtribuicao.delete({ where: { id: (await at(A.id, pjA.id)).id } });
      await sincronizarPrincipal(tx, A.id);
      await sincronizarCards(tx, projeto.id, admin.id);
    });
    const novoPrincipal = await prisma.eapAtribuicao.findFirst({ where: { tarefaId: A.id, principal: true } });
    check("tirar o principal promove o próximo", novoPrincipal?.userId === pjB.id, novoPrincipal?.userId);
    const cardA2 = await card(A.id);
    check("card acompanha: quem saiu da linha sai do card", JSON.stringify(cardA2?.responsaveis.map((r) => r.userId)) === JSON.stringify([pjB.id]), cardA2?.responsaveis);

    // Muda a duração e sincroniza SEM reagendar: o card segue o motor mesmo assim.
    await prisma.eapTarefa.update({ where: { id: A.id }, data: { duracaoDias: 8 } });
    await sincronizarCards(prisma, projeto.id, admin.id);
    const fimMotorA = (await planoDoProjeto(projeto.id))?.resultado.linhas.get(A.id)?.fim;
    const cardA3 = await card(A.id);
    check(
      "card acompanha: prazo segue o motor depois de mudar a duração (D32)",
      // 05/10 + 8 dias úteis = 15/10: 12/10 é feriado (Nossa Senhora Aparecida) — o calendário real entra.
      cardA3?.prazo?.toISOString().slice(0, 10) === fimMotorA && fimMotorA === "2026-10-15",
      [cardA3?.prazo, fimMotorA],
    );
    // Reagendar grava as datas; o card continua batendo.
    await reagendarProjeto(projeto.id, admin.id);
    const linhaA = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: A.id }, select: { fimPrevisto: true } });
    check("depois de reagendar, coluna gravada e card concordam", linhaA.fimPrevisto.toISOString().slice(0, 10) === fimMotorA);

    await prisma.eapTarefa.update({ where: { id: B.id }, data: { status: "con", fimReal: d("2026-10-20"), inicioReal: d("2026-10-15"), progresso: 100 } });
    await sincronizarCards(prisma, projeto.id, admin.id);
    check("linha concluída mantém o card (nunca apaga)", (await card(B.id)) !== null);

    // ── 7. Carga da equipe, sobrecarga e sugestões ─────────────────────────
    const paralela = (nome: string, ordem: number) =>
      prisma.eapTarefa.create({ data: { ...base, parentId: R.id, nome, tipoEap: "atv", duracaoDias: 5, ordem } });
    const X = await paralela("Paralela X", 6);
    const Y = await paralela("Paralela Y", 7);
    await prisma.eapAtribuicao.createMany({
      data: [
        { tarefaId: X.id, userId: pjA.id, horasPrevistas: 40, principal: true },
        { tarefaId: Y.id, userId: pjA.id, horasPrevistas: 40, principal: true },
      ],
    });
    const carga = await cargaDaEquipe({ hoje: "2026-10-05", semanas: 6 });
    const pessoaA = carga.pessoas.find((p) => p.userId === pjA.id);
    check("carga: quem está só em linha aprovada entra na equipe", pessoaA != null);
    check("carga: 80 h contra 40 h na semana das paralelas", pessoaA?.carga["2026-W41"] === 80 && pessoaA?.capacidade["2026-W41"] === 40, pessoaA);
    const listado = carga.sobrecargas.find((so) => so.userId === pjA.id && so.semana === "2026-W41");
    check("sobrecarga acusada com o excesso", listado?.excesso === 40, listado && { excesso: listado.excesso });
    check(
      "a listagem vem SEM sugestões (cada uma roda o motor — só sob demanda)",
      carga.sobrecargas.every((so) => !so.sugestoes.atrasar && !so.sugestoes.passar),
    );
    const pedida = await cargaDaEquipe({ hoje: "2026-10-05", semanas: 6, sugestaoDe: { userId: pjA.id, semana: "2026-W41" } });
    const estouro = pedida.sobrecargas.find((so) => so.userId === pjA.id && so.semana === "2026-W41");
    check(
      "só a sobrecarga pedida recebe sugestão",
      pedida.sobrecargas.filter((so) => so.sugestoes.atrasar || so.sugestoes.passar).every((so) => so === estouro),
    );
    check(
      "sugestão 'atrasar' sai verificada e resolve",
      estouro?.sugestoes.atrasar?.resolve === true && [X.id, Y.id].includes(estouro.sugestoes.atrasar.linhaId),
      estouro?.sugestoes.atrasar,
    );
    check(
      "sugestão 'passar' vai para o outro responsável da disciplina, livre",
      estouro?.sugestoes.passar?.paraUserId === pjB.id && estouro.sugestoes.passar.resolve === true,
      estouro?.sugestoes.passar,
    );
    check("projeto aprovado é calculado pelas linhas", carga.projetosCalculados.includes(projeto.id));

    // ── 6. Atividade que virou agrupamento ─────────────────────────────────
    await prisma.eapTarefa.create({ data: { ...base, parentId: A.id, nome: "Sub", tipoEap: "atv", duracaoDias: 2, ordem: 5 } });
    q = await avaliarQualidade(projeto.id);
    check("atividade que virou agrupamento com gente dentro é acusada", regras("atribuicao_em_resumo").includes(A.id), regras("atribuicao_em_resumo"));
  } finally {
    // Limpeza — ordem importa: cards, baseline (linha da baseline aponta para a tarefa), EAP.
    await prisma.sessaoTrabalho.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.tarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapBaseline.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id, parentId: { not: null } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaSaudeSnapshot.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: [pjA.id, pjB.id] } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
