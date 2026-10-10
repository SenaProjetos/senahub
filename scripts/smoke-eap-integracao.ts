/**
 * Smoke de INTEGRAÇÃO da frente "reunião de 08/10/2026" contra o banco de dev: o caminho inteiro por vários módulos,
 * com o modelo de EAP REAL do dev (EDIFÍCIO), sem sessão.
 *
 *   criar disciplina → etapas padrão (projetos) → aplicar o modelo de EAP (planejamento/modelos) → herdar responsáveis →
 *   aprovar o cronograma (qualidade, baseline, cards) → ponto sugere a atividade de hoje (ponto) → bater a entrada com a
 *   tarefa → horas voltam na EAP → concluir o card (tarefas) → linha fica verde e o gestor é avisado → % 100 validado →
 *   "enviei os documentos" da etapa (projetos) → fase pendente de aprovação (uploads/pagamento).
 *
 * Roda duas vezes: Residencial multifamiliar (3 etapas) e unifamiliar (só Básico e Executivo — o modelo tem linhas de
 * Estudo Preliminar que NÃO devem gerar etapa nem linha órfã).
 *
 * Uso: npm run smoke:eap-integracao
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { aplicarBatida } from "../src/modules/ponto/service";
import { projetosDoUsuario } from "../src/modules/ponto/queries";
import { sugestaoParaPonto, tarefasParaPonto } from "../src/modules/ponto/tarefa-ponto-service";
import { aplicarModeloNoProjeto } from "../src/modules/planejamento/modelos/service";
import { aprovarCronograma } from "../src/modules/planejamento/service";
import { reagendarProjeto } from "../src/modules/planejamento/agenda";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { sinalDaLinha } from "../src/modules/planejamento/sinais-linha";
import { registrarExecucaoNaLinha } from "../src/modules/planejamento/execucao-service";
import { avisarCardConcluido } from "../src/modules/planejamento/conclusao-aviso-service";
import { cargaDaEquipe } from "../src/modules/planejamento/recursos-queries";
import { semearEtapasPadrao } from "../src/modules/projetos/etapas-service";
import { enviarEtapaParaAnalise } from "../src/modules/projetos/envio-etapa-service";
import { estadoPagamento } from "../src/modules/uploads/pagamento-fase";
import { diaDeSaoPaulo } from "../src/lib/data";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-eap-int-${Date.now()}`;
const hoje = diaDeSaoPaulo();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function cenario(nomeTipo: string, esperadas: string[]) {
  console.log(`\n── ${nomeTipo}`);
  const tipo = await prisma.tipoEmpreendimento.findFirst({ where: { nome: { contains: nomeTipo, mode: "insensitive" } }, select: { id: true, semEstudoPreliminar: true } });
  const modelo = await prisma.modeloEap.findFirst({ where: { ativo: true, disciplinaCatalogoId: null }, select: { id: true } });
  const catalogo = await prisma.disciplinaCatalogo.findFirst({ where: { nome: "Estrutural" }, select: { id: true } });
  if (!tipo || !modelo || !catalogo) {
    check("pré-requisitos do banco de dev (tipo, modelo de projeto, disciplina Estrutural)", false, { tipo: !!tipo, modelo: !!modelo, catalogo: !!catalogo });
    return;
  }
  const [resp, coord, outro] = await Promise.all(
    ["resp", "coord", "outro"].map((n) =>
      prisma.user.create({ data: { name: `${tag}-${nomeTipo}-${n}`, email: `${tag}-${nomeTipo}-${n}@t.local`, role: "clt", emailVerified: false } }),
    ),
  );
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin", ativo: true }, select: { id: true } });
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-${nomeTipo}-c` } });
  const n = Number(`${Date.now()}`.slice(-5));
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${n}`, ano: 2026, sequencial: n, nome: `${tag}-${nomeTipo}`, clienteId: cliente.id, tipo: "particular",
      tipoEmpreendimentoId: tipo.id, prazoContrato: d("2027-06-30"), prazoPlanejado: d("2027-06-30"),
      membros: { create: [{ userId: coord.id, papel: "Coordenador" }, { userId: resp.id }] },
    },
  });

  try {
    // 1. disciplina + etapas padrão
    const disc = await prisma.$transaction(async (tx) => {
      const x = await tx.disciplina.create({
        data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural", disciplinaId: catalogo.id, responsaveis: { create: [{ userId: resp.id }] } },
      });
      await semearEtapasPadrao(tx, [x.id], { tipoProjeto: "particular", tipoEmpreendimentoId: tipo.id });
      return x;
    });
    const siglas = async () =>
      (await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: disc.id }, orderBy: { ordem: "asc" }, select: { etapa: { select: { sigla: true } } } })).map((e) => e.etapa.sigla);
    check(`etapas padrão do tipo: ${esperadas.join("/")}`, JSON.stringify(await siglas()) === JSON.stringify(esperadas), await siglas());

    // 2. modelo de EAP por cima das etapas já semeadas (o caminho "montar a EAP na criação do projeto")
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d(dia(-14)) } });
    // O projeto começou há 2 semanas: hoje cai no meio da EAP (e as primeiras atividades já passaram do término).
    let aplicou: Awaited<ReturnType<typeof aplicarModeloNoProjeto>> | null = null;
    try {
      aplicou = await aplicarModeloNoProjeto({ projetoId: projeto.id, modeloId: modelo.id });
    } catch (e) {
      check("modelo aplica sobre as etapas padrão sem erro", false, e instanceof Error ? e.message : e);
      return;
    }
    check("modelo aplica sobre as etapas padrão sem erro e cria linhas", aplicou.criadas > 0, aplicou);
    check("as etapas não duplicam nem somem depois do modelo", JSON.stringify(await siglas()) === JSON.stringify(esperadas), await siglas());
    // Percentuais do modelo nas etapas semeadas a 0% (decisão do dono, 2026-10-10): preenche SÓ quando o modelo traz % de
    // TODA etapa da disciplina e a soma fecha 100. Esperado lido do JSON do modelo, sem passar pela regra testada.
    const pctModelo = ((await prisma.modeloEap.findUniqueOrThrow({ where: { id: modelo.id }, select: { estrutura: true } })).estrutura as { percentuaisPorFase?: Record<string, number> }).percentuaisPorFase ?? {};
    const etapasDb = await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: disc.id }, orderBy: { ordem: "asc" }, select: { etapaId: true, percentual: true } });
    const cobre = etapasDb.every((e) => Number.isFinite(pctModelo[e.etapaId]));
    const fecha = cobre && Math.round(etapasDb.reduce((t, e) => t + pctModelo[e.etapaId] * 100, 0)) === 10_000;
    check(
      fecha ? "o modelo cobre todas as etapas e fecha 100%: percentuais preenchidos" : "o modelo NÃO cobre todas as etapas ou não fecha 100%: etapas seguem a 0%",
      etapasDb.every((e) => Number(e.percentual) === (fecha ? pctModelo[e.etapaId] : 0)),
      etapasDb.map((e) => Number(e.percentual)),
    );
    const fasesDaDisc = new Set((await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: disc.id }, select: { etapaId: true } })).map((e) => e.etapaId));
    const orfas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id, disciplinaId: disc.id, etapaId: { not: null } }, select: { nome: true, etapaId: true } });
    check("nenhuma linha aponta para fase que a disciplina não tem (sem linha órfã)", orfas.every((l) => fasesDaDisc.has(l.etapaId!)), orfas.filter((l) => !fasesDaDisc.has(l.etapaId!)).map((l) => l.nome));
    const atribuidas = await prisma.eapAtribuicao.count({ where: { tarefa: { projetoId: projeto.id }, userId: resp.id } });
    check("o responsável da disciplina foi herdado nas linhas", atribuidas > 0, atribuidas);

    // 3. rascunho: a carga aparece à parte
    await reagendarProjeto(projeto.id, admin.id);
    const rasc = await cargaDaEquipe({ semanas: 2 });
    check("em rascunho o projeto está em 'projetosEmRascunho' e fora do calculado", rasc.projetosEmRascunho.includes(projeto.id) && !rasc.projetosCalculados.includes(projeto.id));

    // 4. horas para a aprovação não acusar linha sem hora; aprovar → cards
    await prisma.eapAtribuicao.updateMany({ where: { tarefa: { projetoId: projeto.id }, userId: resp.id }, data: { horasPrevistas: 8 } });
    let aprovou = false;
    try {
      const r = await aprovarCronograma(projeto.id, admin.id);
      aprovou = true;
      check("cronograma aprova e gera card das linhas escaladas", r.cardsCriados > 0, r);
    } catch (e) {
      check("cronograma aprova (modelo + etapas padrão passam na qualidade)", false, e instanceof Error ? e.message : e);
    }
    if (!aprovou) return;

    // 5. ponto: o projeto aparece no seletor e abre na atividade de hoje
    const projetos = await projetosDoUsuario(resp.id);
    check("o projeto aparece no seletor do ponto", projetos.some((p) => p.id === projeto.id));
    const sug = await sugestaoParaPonto(resp.id, new Set(projetos.map((p) => p.id)));
    check("o ponto sugere uma atividade do projeto para hoje", sug?.projeto.id === projeto.id && !!sug.tarefa.id, sug);
    const lista = await tarefasParaPonto(resp.id, projeto.id);
    check("a atividade sugerida está na lista do ponto", !!sug && lista.some((t) => t.id === sug.tarefa.id), lista.map((t) => t.titulo));
    if (!sug) return;

    // 6. bater a entrada com a atividade sugerida → horas voltam na EAP
    await aplicarBatida({ userId: resp.id, tipo: "entrada", horario: new Date(Date.now() - 2 * 3_600_000), projetoId: projeto.id, tarefaId: sug.tarefa.id, origem: "app" });
    const card = await prisma.tarefa.findUniqueOrThrow({ where: { id: sug.tarefa.id }, select: { eapTarefaId: true, statusId: true } });
    let eap = await eapDoProjeto(projeto.id, { verDatas: true });
    const dto = eap.tarefas.find((t) => t.id === card.eapTarefaId);
    check("as horas batidas no ponto chegam na linha da EAP", (dto?.horasApontadas ?? 0) > 0, dto?.horasApontadas);
    check("antes de concluir: sem 'concluído pelo responsável'", dto?.cardConcluidoEm == null);
    await aplicarBatida({ userId: resp.id, tipo: "saida", horario: new Date(), origem: "app" });

    // 7. concluir o card → verde + aviso ao gestor
    const concluido = await prisma.tarefaStatus.findFirstOrThrow({ where: { ativo: true, concluido: true }, select: { id: true } });
    await prisma.tarefa.update({ where: { id: sug.tarefa.id }, data: { statusId: concluido.id, concluidaEm: new Date() } });
    eap = await eapDoProjeto(projeto.id, { verDatas: true });
    const verde = eap.tarefas.find((t) => t.id === card.eapTarefaId)!;
    check("card concluído → linha verde (validar) e sugere 100%", sinalDaLinha(verde, hoje) === "validar" && verde.sugestoesProgresso[0]?.origem === "card_concluido", { sinal: sinalDaLinha(verde, hoje), sug: verde.sugestoesProgresso[0] });
    const envios: { userIds: string[] }[] = [];
    const notificar = (async (userIds: string[]) => void envios.push({ userIds })) as typeof notificarMuitos;
    const aviso = await avisarCardConcluido({ tarefaId: sug.tarefa.id, autorId: resp.id, autorNome: "Resp" }, notificar);
    check("o gestor (coordenação) é avisado, e só ele", aviso.avisados === 1 && envios[0]?.userIds.join() === coord.id, envios);

    // 8. validar 100% → o sinal some
    await registrarExecucaoNaLinha({ id: verde.id, inicioReal: hoje, fimReal: hoje, hoje, autorId: admin.id });
    eap = await eapDoProjeto(projeto.id, { verDatas: true });
    const validada = eap.tarefas.find((t) => t.id === verde.id)!;
    check("depois de validar o 100% a linha deixa de ter sinal", validada.progresso === 100 && sinalDaLinha(validada, hoje) === null, { p: validada.progresso });
    const aviso2 = await avisarCardConcluido({ tarefaId: sug.tarefa.id, autorId: resp.id, autorNome: "Resp" }, notificar);
    check("concluir de novo com a linha já validada não avisa", aviso2.avisados === 0);

    // 9. etapa: "enviei os documentos" → vira fase pendente de aprovação (o que o card oferece como "Aprovar fase")
    const etapa = await prisma.disciplinaEtapa.findFirstOrThrow({ where: { disciplinaId: disc.id }, orderBy: { ordem: "asc" }, select: { id: true } });
    const recusaOutro = await enviarEtapaParaAnalise({ etapaId: etapa.id, userId: outro.id, notificar }).then(() => null, (e: Error) => e.message);
    check("quem não é responsável da disciplina não envia a etapa", !!recusaOutro, recusaOutro);
    await enviarEtapaParaAnalise({ etapaId: etapa.id, userId: resp.id, notificar });
    const etapas = await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: disc.id }, select: { id: true, status: true, liberadaEm: true } });
    const pendentes = etapas.filter((f) => f.liberadaEm == null && (f.status === "entregue" || f.status === "em_revisao"));
    check("a etapa enviada aparece como fase pendente de aprovação", pendentes.length === 1 && pendentes[0].id === etapa.id, pendentes);
    const estado = estadoPagamento([], etapas);
    check("pagamento por fase reconhece as fases da disciplina (nada liberado ainda)", estado.fases?.total === esperadas.length && estado.fases.liberadas === 0, estado.fases);
  } finally {
    await prisma.sessaoTrabalho.deleteMany({ where: { userId: { in: [resp.id, coord.id, outro.id] } } });
    await prisma.batida.deleteMany({ where: { userId: { in: [resp.id, coord.id, outro.id] } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapBaseline.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplinaResponsavel.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}-${nomeTipo}` } } });
  }
}

async function main() {
  await cenario("multifamiliar", ["PL", "BS", "EX"]);
  await cenario("unifamiliar", ["BS", "EX"]);
  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
