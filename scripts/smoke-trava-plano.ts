/**
 * Smoke da trava do plano depois de aprovar (reunião de 29/09/2026) contra o banco de dev. O vitest cobre a regra pura
 * (`trava-plano.ts`); aqui vai o I/O da guarda (`trava-plano-service.ts`): aprovado trava, "Revisar planejamento"
 * destrava e marca a mudança, revisão com mudança não se cancela, a nova linha de base fecha e trava de novo, e a
 * revisão sem mudança se cancela.
 *
 * E as corridas (03/11/2026): aprovar, abrir a revisão e fechar com nova linha de base em dois cliques simultâneos
 * gravam uma vez só; o cancelamento que corre com uma edição recusa; a edição que corre com o cancelamento recusa; a
 * recusa no meio de uma gravação (a contagem da propagação) não deixa a revisão marcada como alterada.
 *
 * Uso: npm run smoke:trava-plano
 */
import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import {
  MOTIVO_JA_APROVADO,
  MOTIVO_NOVA_BASE_SEM_REVISAO,
  aprovarCronograma,
  replanejar,
} from "../src/modules/planejamento/service";
import { editarLinhaNoBanco } from "../src/modules/planejamento/linha-service";
import { MOTIVO_EAP_MUDOU_NA_CONFIRMACAO } from "../src/modules/planejamento/disciplina-linha-service";
import {
  abrirRevisao,
  cancelarRevisao,
  exigirPlanoEditavel,
  exigirPlanoEditavelDaLinha,
} from "../src/modules/planejamento/trava-plano-service";
import {
  MOTIVO_CANCELAR_COM_MUDANCA,
  MOTIVO_JA_EM_REVISAO,
  MOTIVO_PLANO_TRAVADO,
  MOTIVO_REVISAO_SEM_APROVACAO,
} from "../src/modules/planejamento/trava-plano";

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
/** Duas chamadas ao mesmo tempo: devolve as mensagens de erro (null = passou), na ordem das chamadas. */
async function duasVezes(fn: () => Promise<unknown>): Promise<(string | null)[]> {
  return Promise.all([erroDe(fn), erroDe(fn)]);
}
/**
 * Corrida determinística: `segurar` grava dentro de uma transação que fica ABERTA (a linha do cronograma travada, a
 * gravação ainda invisível); `concorrente` começa nesse meio-tempo — lê o estado antigo e para na trava da linha —, e a
 * transação só fecha depois. Devolve o erro do concorrente.
 */
async function corrida(segurar: (tx: Prisma.TransactionClient) => Promise<void>, concorrente: () => Promise<unknown>): Promise<string | null> {
  let soltar!: () => void;
  const solto = new Promise<void>((r) => (soltar = r));
  let gravou!: () => void;
  const gravado = new Promise<void>((r) => (gravou = r));
  const transacao = prisma.$transaction(
    async (tx) => {
      await segurar(tx);
      gravou();
      await solto;
    },
    { timeout: 20_000 },
  );
  await gravado;
  const outro = erroDe(concorrente);
  await new Promise((r) => setTimeout(r, 500));
  soltar();
  await transacao;
  return outro;
}

const tag = `smoke-trava-plano-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });
  const estado = () =>
    prisma.cronogramaProjeto.findUniqueOrThrow({
      where: { projetoId: projeto.id },
      select: { aprovado: true, emRevisao: true, revisaoAlterada: true, revisaoAbertaEm: true },
    });
  const baselines = () => prisma.eapBaseline.count({ where: { projetoId: projeto.id } });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    const ele = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Elétrica" } });
    const [idA, idB, idG, idG1, idG2] = await reservarIdsParaLinhas(prisma, ["atv", "atv", "res", "atv", "atv"]);
    const a = await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, idCorporativo: idA, nome: "Modelagem", tipoEap: "atv", duracaoDias: 2, ordem: 0, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
    });
    await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, idCorporativo: idB, nome: "Detalhamento", tipoEap: "atv", duracaoDias: 3, ordem: 1, inicioPrevisto: d("2026-10-07"), fimPrevisto: d("2026-10-09") },
    });
    const g = await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, idCorporativo: idG, nome: "Instalações", tipoEap: "res", duracaoDias: 2, ordem: 2, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
    });
    for (const [k, id] of [idG1, idG2].entries()) {
      await prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo: id, parentId: g.id, nome: `Quadro ${k + 1}`, tipoEap: "atv", duracaoDias: 2, ordem: 3 + k, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    }

    // ── rascunho ─────────────────────────────────────────────────────────────
    check("rascunho: o plano é livre", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === null);
    check("rascunho: não há o que revisar", (await erroDe(() => abrirRevisao(projeto.id))) === MOTIVO_REVISAO_SEM_APROVACAO);
    check("rascunho: a guarda não marca revisão", (await estado()).revisaoAlterada === false);
    check("rascunho: nova linha de base recusa", (await erroDe(() => replanejar(projeto.id, admin.id, "Sem aprovação"))) !== null);

    // ── aprovar em dois cliques simultâneos ──────────────────────────────────
    const aprovacoes = await duasVezes(() => aprovarCronograma(projeto.id, admin.id));
    check(
      "aprovar 2× ao mesmo tempo: uma passa, a outra recusa com a frase de já aprovado",
      aprovacoes.filter((m) => m === null).length === 1 && aprovacoes.filter((m) => m === MOTIVO_JA_APROVADO).length === 1,
      aprovacoes,
    );
    check("e só uma linha de base (BL-00) foi gravada", (await baselines()) === 1);
    check("o cronograma ficou aprovado", (await estado()).aprovado === true);
    check("aprovar de novo recusa com a frase de já aprovado", (await erroDe(() => aprovarCronograma(projeto.id, admin.id))) === MOTIVO_JA_APROVADO);
    check("aprovado: o plano trava, com a frase da tela", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);
    check("aprovado: a guarda pela linha também trava", (await erroDe(() => exigirPlanoEditavelDaLinha(a.id))) === MOTIVO_PLANO_TRAVADO);
    check("aprovado sem revisão: nova linha de base recusa", (await erroDe(() => replanejar(projeto.id, admin.id, "Fora da revisão"))) === MOTIVO_NOVA_BASE_SEM_REVISAO);

    // ── abrir a revisão em dois cliques ──────────────────────────────────────
    const aberturas = await duasVezes(() => abrirRevisao(projeto.id));
    check(
      "abrir 2× ao mesmo tempo: uma abre, a outra recusa com 'já em revisão'",
      aberturas.filter((m) => m === null).length === 1 && aberturas.filter((m) => m === MOTIVO_JA_EM_REVISAO).length === 1,
      aberturas,
    );
    let e = await estado();
    check("Revisar planejamento: abre a revisão, sem mudança ainda", e.emRevisao && !e.revisaoAlterada && e.revisaoAbertaEm != null, e);
    check("abrir de novo recusa", (await erroDe(() => abrirRevisao(projeto.id))) === MOTIVO_JA_EM_REVISAO);

    // ── recusa no meio da gravação não marca a revisão ──────────────────────
    const propagacao = await erroDe(() =>
      editarLinhaNoBanco({ id: g.id, nome: "Instalações", disciplinaId: ele.id, progresso: 0, marco: false, propagarDisciplina: { esperadas: 99 } }, admin.id),
    );
    check("propagação com contagem errada recusa", propagacao === MOTIVO_EAP_MUDOU_NA_CONFIRMACAO, propagacao);
    check("e não deixa a revisão marcada como alterada (nada foi gravado)", (await estado()).revisaoAlterada === false);
    check("o agrupamento não mudou de disciplina", (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: g.id }, select: { disciplinaId: true } })).disciplinaId === null);
    await erroDe(() =>
      prisma.$transaction(async (tx) => {
        await exigirPlanoEditavel(projeto.id, tx);
        throw new Error("falha depois da guarda");
      }),
    );
    check("guarda dentro de transação que falha: a marca volta junto", (await estado()).revisaoAlterada === false);

    // ── cancelar enquanto uma edição marca o plano ───────────────────────────
    const cancelamento = await corrida(
      (tx) => exigirPlanoEditavel(projeto.id, tx),
      () => cancelarRevisao(projeto.id),
    );
    check("cancelar durante uma edição em andamento recusa com 'o plano já mudou'", cancelamento === MOTIVO_CANCELAR_COM_MUDANCA, cancelamento);
    e = await estado();
    check("e a revisão segue aberta, marcada como alterada", e.emRevisao && e.revisaoAlterada, e);
    check("em revisão: o plano é editável", (await erroDe(() => exigirPlanoEditavelDaLinha(a.id))) === null);
    check("revisão com mudança não se cancela", (await erroDe(() => cancelarRevisao(projeto.id))) === MOTIVO_CANCELAR_COM_MUDANCA);

    // ── nova linha de base em dois cliques ───────────────────────────────────
    const novas = await duasVezes(() => replanejar(projeto.id, admin.id, "Aditivo do contrato"));
    check(
      "nova linha de base 2× ao mesmo tempo: uma grava, a outra recusa (a revisão já fechou)",
      novas.filter((m) => m === null).length === 1 && novas.filter((m) => m === MOTIVO_NOVA_BASE_SEM_REVISAO).length === 1,
      novas,
    );
    check("e só a BL-01 entrou", (await baselines()) === 2);
    e = await estado();
    check("a revisão fechou", !e.emRevisao && !e.revisaoAlterada && e.revisaoAbertaEm == null, e);
    check("o plano volta a travar", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);

    // ── revisão sem mudança ──────────────────────────────────────────────────
    await abrirRevisao(projeto.id);
    check("revisão sem mudança se cancela", (await erroDe(() => cancelarRevisao(projeto.id))) === null);
    e = await estado();
    check("cancelar fecha sem criar linha de base", !e.emRevisao && (await baselines()) === 2, e);
    check("e o plano volta a travar", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);

    // ── editar enquanto a revisão é cancelada ────────────────────────────────
    await abrirRevisao(projeto.id);
    const edicao = await corrida(
      async (tx) => {
        const r = await tx.cronogramaProjeto.updateMany({
          where: { projetoId: projeto.id, emRevisao: true, revisaoAlterada: false },
          data: { emRevisao: false, revisaoAbertaEm: null, revisaoAlterada: false },
        });
        if (r.count !== 1) throw new Error("o cancelamento simulado não pegou a revisão");
      },
      () => exigirPlanoEditavel(projeto.id),
    );
    check("a edição que corre com o cancelamento recusa: o plano travou de novo", edicao === MOTIVO_PLANO_TRAVADO, edicao);
    e = await estado();
    check("e não marca uma revisão que já fechou", !e.emRevisao && !e.revisaoAlterada, e);
  } finally {
    await prisma.eapBaseline.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id, parentId: { not: null } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
