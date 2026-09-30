/**
 * Smoke da trava do plano depois de aprovar (reunião de 29/09/2026) contra o banco de dev. O vitest cobre a regra pura
 * (`trava-plano.ts`); aqui vai o I/O da guarda (`trava-plano-service.ts`): aprovado trava, "Revisar planejamento"
 * destrava e marca a mudança, revisão com mudança não se cancela, a nova linha de base fecha e trava de novo, e a
 * revisão sem mudança se cancela.
 *
 * Uso: npm run smoke:trava-plano
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { congelarBaseline, replanejar } from "../src/modules/planejamento/service";
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

const tag = `smoke-trava-plano-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
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
      select: { emRevisao: true, revisaoAlterada: true, revisaoAbertaEm: true },
    });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    const [idA, idB] = await reservarIdsParaLinhas(prisma, ["atv", "atv"]);
    const a = await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, idCorporativo: idA, nome: "Modelagem", tipoEap: "atv", duracaoDias: 2, ordem: 0, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
    });
    await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, idCorporativo: idB, nome: "Detalhamento", tipoEap: "atv", duracaoDias: 3, ordem: 1, inicioPrevisto: d("2026-10-07"), fimPrevisto: d("2026-10-09") },
    });

    // ── rascunho ─────────────────────────────────────────────────────────────
    check("rascunho: o plano é livre", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === null);
    check("rascunho: não há o que revisar", (await erroDe(() => abrirRevisao(projeto.id))) === MOTIVO_REVISAO_SEM_APROVACAO);
    check("rascunho: a guarda não marca revisão", (await estado()).revisaoAlterada === false);

    // ── aprovado ─────────────────────────────────────────────────────────────
    await congelarBaseline(projeto.id, admin.id, { motivo: "Aprovação do cronograma." });
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true, aprovadoEm: new Date(), aprovadoPorId: admin.id } });
    check("aprovado: o plano trava, com a frase da tela", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);
    check("aprovado: a guarda pela linha também trava", (await erroDe(() => exigirPlanoEditavelDaLinha(a.id))) === MOTIVO_PLANO_TRAVADO);

    // ── revisão com mudança ──────────────────────────────────────────────────
    await abrirRevisao(projeto.id);
    let e = await estado();
    check("Revisar planejamento: abre a revisão, sem mudança ainda", e.emRevisao && !e.revisaoAlterada && e.revisaoAbertaEm != null, e);
    check("abrir de novo recusa", (await erroDe(() => abrirRevisao(projeto.id))) === MOTIVO_JA_EM_REVISAO);
    check("em revisão: o plano é editável", (await erroDe(() => exigirPlanoEditavelDaLinha(a.id))) === null);
    check("e a guarda marca que o plano mudou", (await estado()).revisaoAlterada === true);
    check("revisão com mudança não se cancela", (await erroDe(() => cancelarRevisao(projeto.id))) === MOTIVO_CANCELAR_COM_MUDANCA);

    const bl = await replanejar(projeto.id, admin.id, "Aditivo do contrato");
    e = await estado();
    check("a nova linha de base é a BL-01", bl.baselineNumero === 1, bl);
    check("e fecha a revisão", !e.emRevisao && !e.revisaoAlterada && e.revisaoAbertaEm == null, e);
    check("o plano volta a travar", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);

    // ── revisão sem mudança ──────────────────────────────────────────────────
    await abrirRevisao(projeto.id);
    check("revisão sem mudança se cancela", (await erroDe(() => cancelarRevisao(projeto.id))) === null);
    e = await estado();
    check("cancelar fecha sem criar linha de base", !e.emRevisao && (await prisma.eapBaseline.count({ where: { projetoId: projeto.id } })) === 2, e);
    check("e o plano volta a travar", (await erroDe(() => exigirPlanoEditavel(projeto.id))) === MOTIVO_PLANO_TRAVADO);
  } finally {
    await prisma.eapBaseline.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
