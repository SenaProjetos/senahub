/**
 * Smoke do arrasto na tela por pessoa (pool de recursos, parte 4 — decisões H, 1 e 4; cenário A do Ryan) contra o banco de
 * dev. Monta os projetos, confere e apaga.
 *
 *   1. Mudar a data no rascunho: vira o alfinete da linha, a seguinte pelo vínculo anda junto, a seguinte com data fixada
 *      fica (Só esta tarefa) ou anda os mesmos dias úteis (Mover também as seguintes).
 *   2. Aprovado sem revisão: a data não muda (a frase da trava); com a revisão aberta, muda e marca a revisão como alterada.
 *   3. Tarefa que já começou não muda de data.
 *   4. Trocar a pessoa no aprovado: livre; as horas automáticas recalculam pela pessoa nova; quem já está é recusado.
 *      Atribuir a tarefa sem ninguém: nasce automática com o total da duração; tarefa que ganhou alguém é recusada.
 *   5. Aviso à coordenação (decisão 4 do Ryan): só quando quem mexe não coordena o projeto; quem fez não recebe.
 *
 * Uso: npm run smoke:arrasto-planejador
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { planoDoProjeto, reagendarProjeto } from "../src/modules/planejamento/agenda";
import { MOTIVO_PLANO_TRAVADO } from "../src/modules/planejamento/trava-plano";
import { MOTIVO_JA_COMECOU, MOTIVO_JA_NA_TAREFA } from "../src/modules/planejamento/planejador-acoes";
import { recalcularHorasAutomaticas } from "../src/modules/planejamento/horas-automaticas-service";
import {
  avisarCoordenacaoDaMudanca,
  moverLinhaNoPlanejador,
  trocarPessoaNoPlanejador,
} from "../src/modules/planejamento/planejador-service";

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

const tag = `smoke-arrasto-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

type Envio = { userIds: string[]; titulo: string; corpo?: string; categoria?: string };
const envios: Envio[] = [];
const enviar: typeof notificarMuitos = async (userIds, n, opts) => {
  envios.push({ userIds: [...userIds].sort(), titulo: n.titulo, corpo: n.corpo, categoria: opts?.categoria });
};

async function main() {
  const usuario = (sufixo: string) =>
    prisma.user.create({ data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", contratacao: "pj", emailVerified: false } });
  const mireli = await usuario("mireli");
  const joao = await usuario("joao");
  const coord = await usuario("coord");
  const gerencia = await usuario("gerencia");
  const pessoas = [mireli, joao, coord, gerencia].map((u) => u.id);
  await prisma.recurso.createMany({ data: [{ userId: mireli.id, capacidade: 1 }, { userId: joao.id, capacidade: 0.5 }] });

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  let n = 0;
  const novoProjeto = async (sufixo: string) => {
    n++;
    return prisma.projeto.create({
      data: { codigo: `${Date.now() + n}`.slice(-6), ano: 2026, sequencial: Number(`${Date.now() + n}`.slice(-5)), nome: `${tag}-${sufixo}`, clienteId: cliente.id },
    });
  };
  const P = await novoProjeto("P");
  const A = await novoProjeto("A");
  const projetos = [P.id, A.id];
  await prisma.projetoMembro.createMany({ data: [{ projetoId: P.id, userId: coord.id, papel: "coordenador" }, { projetoId: A.id, userId: coord.id, papel: "Coordenação" }] });

  const linha = (projetoId: string, nome: string, duracaoDias: number, extra: Record<string, unknown> = {}) =>
    prisma.eapTarefa.create({
      data: { projetoId, nome, tipoEap: "atv", duracaoDias, ordem: n++, inicioPrevisto: d("2026-12-14"), fimPrevisto: d("2026-12-14"), ...extra },
    });
  const datas = async (projetoId: string, id: string) => (await planoDoProjeto(projetoId))?.resultado.linhas.get(id) ?? null;

  try {
    // ── 1. Rascunho: Modelagem → Revisão (vínculo) → Entrega (vínculo + data fixada em 28/12) ────────────────────────
    await prisma.cronogramaProjeto.create({ data: { projetoId: P.id, inicioProjeto: d("2026-12-14") } });
    const M = await linha(P.id, "Modelagem", 3);
    const R = await linha(P.id, "Revisão interna", 2);
    const E = await linha(P.id, "Entrega", 1, { restricaoTipo: "iniciar_nao_antes_de", restricaoData: d("2026-12-28") });
    await prisma.eapDependencia.createMany({ data: [{ tarefaId: R.id, predecessoraId: M.id }, { tarefaId: E.id, predecessoraId: R.id }] });
    await prisma.eapAtribuicao.create({ data: { tarefaId: M.id, userId: mireli.id, papel: "pro", principal: true, horasAutomaticas: true } });
    await reagendarProjeto(P.id, coord.id);
    const rAntes = await datas(P.id, R.id);

    await moverLinhaNoPlanejador({ id: M.id, inicio: "2026-12-16", moverSeguintes: false });
    await reagendarProjeto(P.id, coord.id);
    const m1 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: M.id }, select: { restricaoTipo: true, restricaoData: true } });
    const rDepois = await datas(P.id, R.id);
    const e1 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: E.id }, select: { restricaoData: true } });
    check("o arrasto vira o alfinete \"não iniciar antes de\" da linha", m1.restricaoTipo === "iniciar_nao_antes_de" && dia(m1.restricaoData) === "2026-12-16", m1);
    check("a seguinte pelo vínculo anda junto (o motor)", !!rAntes && !!rDepois && rDepois.inicio > rAntes.inicio, { rAntes, rDepois });
    check("\"Só esta tarefa\": a data fixada da Entrega fica onde está", dia(e1.restricaoData) === "2026-12-28", e1);

    const r2 = await moverLinhaNoPlanejador({ id: M.id, inicio: "2026-12-18", moverSeguintes: true });
    const e2 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: E.id }, select: { restricaoData: true } });
    check(
      "\"Mover também as seguintes\": a data fixada anda os mesmos dias úteis (16 → 18/12 = 2 dias úteis; 28/12 → 30/12)",
      r2.movidas === 1 && dia(e2.restricaoData) === "2026-12-30",
      { r2, e2 },
    );
    await reagendarProjeto(P.id, coord.id);

    // A Revisão (fixada em 23/12) não pode começar antes do fim da Modelagem (22/12): pedir 14/12 com "Mover também" deixa
    // a Revisão onde o motor a põe, e a Entrega anda só o que a Revisão andou de fato (nada), não os 7 dias úteis pedidos.
    const rFixa = await prisma.eapTarefa.update({ where: { id: R.id }, data: { restricaoTipo: "iniciar_nao_antes_de", restricaoData: d("2026-12-23") } });
    await reagendarProjeto(P.id, coord.id);
    const rInicio = (await datas(P.id, R.id))?.inicio;
    const r3 = await moverLinhaNoPlanejador({ id: rFixa.id, inicio: "2026-12-14", moverSeguintes: true });
    const e3 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: E.id }, select: { restricaoData: true } });
    await reagendarProjeto(P.id, coord.id);
    const rDepois3 = (await datas(P.id, R.id))?.inicio;
    check(
      "predecessora segura o início: as seguintes andam o que a tarefa andou de fato, não o pedido",
      rDepois3 === rInicio && dia(e3.restricaoData) === "2026-12-30" && r3.movidas === 0,
      { rInicio, rDepois3, e3: dia(e3.restricaoData) },
    );

    // ── 2. Aprovado: trava e revisão ─────────────────────────────────────────────────────────────────────────────
    await prisma.cronogramaProjeto.create({ data: { projetoId: A.id, inicioProjeto: d("2026-12-14"), aprovado: true } });
    const L = await linha(A.id, "Detalhamento elétrico", 5);
    await prisma.eapAtribuicao.create({ data: { tarefaId: L.id, userId: mireli.id, papel: "pro", principal: true, horasAutomaticas: true } });
    await recalcularHorasAutomaticas(prisma, A.id);
    const mover = (id: string, inicio: string) => erroDe(() => moverLinhaNoPlanejador({ id, inicio, moverSeguintes: false }));
    const alfineteDe = async (id: string) => dia((await prisma.eapTarefa.findUniqueOrThrow({ where: { id }, select: { restricaoData: true } })).restricaoData);
    check("aprovado sem revisão: a data não muda (a frase da trava)", (await mover(L.id, "2026-12-16")) === MOTIVO_PLANO_TRAVADO && (await alfineteDe(L.id)) === null);
    await prisma.cronogramaProjeto.update({ where: { projetoId: A.id }, data: { emRevisao: true, revisaoAlterada: false } });
    const G = await prisma.eapTarefa.create({ data: { projetoId: A.id, nome: "Grupo", tipoEap: "disc", ordem: n++, inicioPrevisto: d("2026-12-14"), fimPrevisto: d("2026-12-14") } });
    await prisma.eapTarefa.create({ data: { projetoId: A.id, parentId: G.id, nome: "Filha", tipoEap: "atv", duracaoDias: 1, ordem: n++, inicioPrevisto: d("2026-12-14"), fimPrevisto: d("2026-12-14") } });
    const recusada = await mover(G.id, "2026-12-16");
    const cron0 = await prisma.cronogramaProjeto.findUniqueOrThrow({ where: { projetoId: A.id }, select: { revisaoAlterada: true } });
    check("revisão aberta: uma recusa (agrupamento) não deixa a revisão marcada como alterada", !!recusada && !cron0.revisaoAlterada, { recusada, cron0 });
    const comRevisao = await mover(L.id, "2026-12-16");
    const cron = await prisma.cronogramaProjeto.findUniqueOrThrow({ where: { projetoId: A.id }, select: { revisaoAlterada: true } });
    check(
      "com a revisão aberta a data muda, e a revisão fica marcada como alterada (fecha com nova linha de base)",
      comRevisao === null && cron.revisaoAlterada && (await alfineteDe(L.id)) === "2026-12-16",
      { comRevisao, cron },
    );
    await prisma.eapTarefa.update({ where: { id: L.id }, data: { restricaoTipo: null, restricaoData: null } });
    await prisma.cronogramaProjeto.update({ where: { projetoId: A.id }, data: { emRevisao: false, revisaoAlterada: false } });

    // ── 3. Já começou ───────────────────────────────────────────────────────────────────────────────────────────
    const I = await linha(P.id, "Levantamento", 2, { inicioReal: d("2026-11-23"), status: "and" });
    check("tarefa que já começou não muda de data", (await erroDe(() => moverLinhaNoPlanejador({ id: I.id, inicio: "2026-12-20", moverSeguintes: false }))) === MOTIVO_JA_COMECOU);

    // ── 4. Trocar e atribuir ────────────────────────────────────────────────────────────────────────────────────
    const hAntes = await prisma.eapAtribuicao.findFirstOrThrow({ where: { tarefaId: L.id }, select: { horasPrevistas: true } });
    await trocarPessoaNoPlanejador({ tarefaId: L.id, de: mireli.id, para: joao.id, autorId: gerencia.id });
    const depois = await prisma.eapAtribuicao.findMany({ where: { tarefaId: L.id }, select: { userId: true, horasPrevistas: true, horasAutomaticas: true, principal: true } });
    check(
      "aprovado: troca livre; a atribuição vai para o João, segue automática e principal (5 dias × 8 h = 40 h, sozinho)",
      depois.length === 1 && depois[0].userId === joao.id && depois[0].horasAutomaticas && depois[0].principal && Number(depois[0].horasPrevistas) === 40 && Number(hAntes.horasPrevistas) === 40,
      { hAntes, depois },
    );
    check(
      "trocar para quem já está na tarefa é recusado",
      (await erroDe(() => trocarPessoaNoPlanejador({ tarefaId: L.id, de: mireli.id, para: joao.id, autorId: gerencia.id }))) === MOTIVO_JA_NA_TAREFA,
    );
    check(
      "quem saiu da tarefa no meio: a tela velha é recusada",
      /já não está nesta tarefa/.test((await erroDe(() => trocarPessoaNoPlanejador({ tarefaId: L.id, de: mireli.id, para: coord.id, autorId: gerencia.id }))) ?? ""),
    );

    const S = await linha(A.id, "Quadro de cargas", 2);
    await trocarPessoaNoPlanejador({ tarefaId: S.id, de: null, para: mireli.id, autorId: gerencia.id });
    const s1 = await prisma.eapAtribuicao.findMany({ where: { tarefaId: S.id }, select: { userId: true, papel: true, horasPrevistas: true, horasAutomaticas: true } });
    check(
      "atribuir a tarefa sem ninguém: projetista, horas automáticas pela duração (2 × 8 = 16 h)",
      s1.length === 1 && s1[0].userId === mireli.id && s1[0].papel === "pro" && s1[0].horasAutomaticas && Number(s1[0].horasPrevistas) === 16,
      s1,
    );
    check(
      "\"sem ninguém\" numa tarefa que ganhou alguém: recusado",
      /já tem responsável/.test((await erroDe(() => trocarPessoaNoPlanejador({ tarefaId: S.id, de: null, para: joao.id, autorId: gerencia.id }))) ?? ""),
    );

    // ── 5. Aviso à coordenação ──────────────────────────────────────────────────────────────────────────────────
    const avisados = await avisarCoordenacaoDaMudanca(
      { projetoId: A.id, autorId: gerencia.id, mudanca: { tipo: "pessoa", tarefa: "Detalhamento elétrico", de: mireli.id, para: joao.id } },
      enviar,
    );
    check(
      "quem não coordena trocou a pessoa: a coordenação recebe, com os nomes, categoria alteracao_cronograma",
      avisados === 1 && JSON.stringify(envios[0]?.userIds) === JSON.stringify([coord.id]) && envios[0]?.categoria === "alteracao_cronograma" &&
        (envios[0]?.corpo ?? "").includes(`trocou ${mireli.name} por ${joao.name}`),
      envios,
    );
    envios.length = 0;
    const doCoord = await avisarCoordenacaoDaMudanca({ projetoId: P.id, autorId: coord.id, mudanca: { tipo: "data", tarefa: "Modelagem", inicio: "2026-12-18" } }, enviar);
    check("o coordenador mexeu no próprio projeto: ninguém é avisado", doCoord === 0 && envios.length === 0, envios);
    await prisma.projetoMembro.deleteMany({ where: { projetoId: P.id } });
    const semCoord = await avisarCoordenacaoDaMudanca({ projetoId: P.id, autorId: gerencia.id, mudanca: { tipo: "data", tarefa: "Modelagem", inicio: "2026-12-18" } }, enviar);
    check("projeto sem coordenador: ninguém é avisado", semCoord === 0 && envios.length === 0, envios);
  } finally {
    await prisma.notificacao.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: { in: projetos } } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.recurso.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.user.deleteMany({ where: { id: { in: pessoas } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
