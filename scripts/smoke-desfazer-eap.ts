/**
 * Smoke do desfazer da EAP (Fase B do plano 2026-10-22-eap-fase-b-desfazer) contra o banco de dev. O vitest cobre as
 * regras puras (`desfazer/estado.ts`); aqui vai o I/O: a foto do plano, o passo, a recusa quando outra pessoa mexeu, a
 * pilha de 20, a trava do plano aprovado e a restauração com os mesmos ids (linha, vínculo, pessoa e parcela de contrato).
 *
 * Uso: npm run smoke:desfazer-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { MAX_PASSOS, MOTIVO_NADA_A_DESFAZER, MOTIVO_PLANO_MUDOU, comPasso, desfazerUltimoPasso, limparPassos, rotuloDoUltimoPasso } from "../src/modules/planejamento/desfazer/service";
import { comPassoDaAction, projetoDaLinha, rotuloDaLinha } from "../src/modules/planejamento/desfazer/passo";
import { MOTIVO_PLANO_TRAVADO } from "../src/modules/planejamento/trava-plano";

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

const tag = `smoke-desfazer-eap-${Date.now()}`;
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
  const contrato = await prisma.documentoJuridico.create({ data: { titulo: `${tag}-contrato`, projetoId: projeto.id } });
  const p = { projetoId: projeto.id, userId: admin.id };
  const passos = () => prisma.eapPassoDesfazer.count({ where: { projetoId: projeto.id, userId: admin.id } });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, tipoEap: "res" | "atv" | "mrc" = "atv") => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo, nome, parentId, tipoEap, duracaoDias: tipoEap === "mrc" ? 0 : 2, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    };
    // M › A, B (B depende de A; pessoa em A) e o marco K (parcela do contrato ligada a ele)
    const M = await nova("Mãe", null, "res");
    const A = await nova("Atividade A", M.id);
    const B = await nova("Atividade B", M.id);
    const K = await nova("Marco K", M.id, "mrc");
    await prisma.eapDependencia.create({ data: { tarefaId: B.id, predecessoraId: A.id, tipo: "fs", lagDias: 1 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: A.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });
    const parcela = await prisma.contratoParcelaEntrega.create({ data: { contratoId: contrato.id, descricao: "Entrega K", percentual: 100, marcoId: K.id } });

    check("sem passo nenhum, não há o que desfazer", (await rotuloDoUltimoPasso(p.projetoId, p.userId)) === null && (await erroDe(() => desfazerUltimoPasso(p.projetoId, p.userId))) === MOTIVO_NADA_A_DESFAZER);

    // ── excluir a mãe e desfazer ─────────────────────────────────────────────
    await comPasso({ ...p, rotulo: 'Excluir "Mãe"' }, () => prisma.eapTarefa.delete({ where: { id: M.id } }));
    check("o passo guarda o rótulo", (await rotuloDoUltimoPasso(p.projetoId, p.userId)) === 'Excluir "Mãe"');
    check("a mãe levou filhas, vínculo e pessoa", (await prisma.eapTarefa.count({ where: { projetoId: projeto.id } })) === 0 && (await prisma.eapDependencia.count({ where: { tarefaId: B.id } })) === 0);
    check("e a parcela do contrato ficou sem marco", (await prisma.contratoParcelaEntrega.findUniqueOrThrow({ where: { id: parcela.id } })).marcoId === null);
    const r1 = await desfazerUltimoPasso(p.projetoId, p.userId);
    check("desfazer devolve o rótulo", r1.rotulo === 'Excluir "Mãe"', r1);
    const voltaram = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true, idCorporativo: true, parentId: true } });
    const idsAntes = new Map([M, A, B, K].map((l) => [l.id, l.idCorporativo]));
    check("as 4 linhas voltam com os MESMOS ids e idCorporativo", voltaram.length === 4 && voltaram.every((l) => idsAntes.get(l.id) === l.idCorporativo), voltaram);
    check("as filhas voltam sob a mãe", voltaram.filter((l) => l.parentId === M.id).length === 3);
    check("o vínculo B→A volta, com a defasagem", Number((await prisma.eapDependencia.findFirst({ where: { tarefaId: B.id, predecessoraId: A.id } }))?.lagDias) === 1);
    const atr = await prisma.eapAtribuicao.findFirst({ where: { tarefaId: A.id } });
    check("a pessoa de A volta, como principal, com as horas", atr?.userId === admin.id && atr.principal && Number(atr.horasPrevistas) === 8, atr);
    check("a parcela do contrato é religada ao marco", (await prisma.contratoParcelaEntrega.findUniqueOrThrow({ where: { id: parcela.id } })).marcoId === K.id);
    check("o passo foi consumido", (await passos()) === 0);

    // ── ação que não muda nada não cria passo ────────────────────────────────
    await comPasso({ ...p, rotulo: "Nada" }, async () => undefined);
    check("ação sem mudança não cria passo", (await passos()) === 0);

    // ── criar linha ──────────────────────────────────────────────────────────
    let criada = "";
    await comPasso({ ...p, rotulo: "Nova tarefa" }, async () => (criada = (await nova("Criada", null)).id));
    await desfazerUltimoPasso(p.projetoId, p.userId);
    check("desfazer de criar apaga a linha criada", (await prisma.eapTarefa.findUnique({ where: { id: criada } })) === null);

    // ── recuar/mover ─────────────────────────────────────────────────────────
    await comPasso({ ...p, rotulo: "Recuar" }, () => prisma.eapTarefa.update({ where: { id: B.id }, data: { parentId: A.id, ordem: 99 } }));
    await desfazerUltimoPasso(p.projetoId, p.userId);
    const b = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: B.id }, select: { parentId: true, ordem: true } });
    check("desfazer de recuar devolve pai e ordem", b.parentId === M.id && b.ordem === B.ordem, b);

    // ── início do projeto ────────────────────────────────────────────────────
    await comPasso({ ...p, rotulo: "Início do projeto" }, () => prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { inicioProjeto: d("2026-11-02") } }));
    await desfazerUltimoPasso(p.projetoId, p.userId);
    check("desfazer devolve o início do projeto", (await prisma.cronogramaProjeto.findUniqueOrThrow({ where: { projetoId: projeto.id } })).inicioProjeto?.toISOString().slice(0, 10) === "2026-10-05");

    // ── acompanhamento por fora não bloqueia, e não é revertido ──────────────
    await comPasso({ ...p, rotulo: "Renomear" }, () => prisma.eapTarefa.update({ where: { id: A.id }, data: { nome: "Renomeada" } }));
    await prisma.eapTarefa.update({ where: { id: A.id }, data: { progresso: 50, status: "and" } });
    await desfazerUltimoPasso(p.projetoId, p.userId);
    const a = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: A.id }, select: { nome: true, progresso: true } });
    check("progresso digitado por fora não impede o desfazer, e fica", a.nome === "Atividade A" && a.progresso === 50, a);

    // ── outra pessoa editou depois ───────────────────────────────────────────
    await comPasso({ ...p, rotulo: "Renomear de novo" }, () => prisma.eapTarefa.update({ where: { id: A.id }, data: { nome: "Minha edição" } }));
    await comPasso({ ...p, rotulo: "Mais uma" }, () => prisma.eapTarefa.update({ where: { id: B.id }, data: { nome: "Minha edição B" } }));
    await prisma.eapTarefa.update({ where: { id: B.id }, data: { nome: "Edição de outra pessoa" } });
    const recusa = await erroDe(() => desfazerUltimoPasso(p.projetoId, p.userId));
    check("plano editado por outra pessoa: recusa com a frase", recusa === MOTIVO_PLANO_MUDOU, recusa);
    check("e descarta a pilha, sem sobrescrever nada", (await passos()) === 0 && (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: B.id } })).nome === "Edição de outra pessoa");

    // ── dois Ctrl+Z ao mesmo tempo: um desfaz, o outro responde "nada para desfazer" ──
    await comPasso({ ...p, rotulo: "Excluir a mãe de novo" }, () => prisma.eapTarefa.delete({ where: { id: M.id } }));
    const duplo = await Promise.allSettled([desfazerUltimoPasso(p.projetoId, p.userId), desfazerUltimoPasso(p.projetoId, p.userId)]);
    const rejeitado = duplo.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    check("Ctrl+Z duplo: um passa e o outro recebe a frase de nada a desfazer (não um erro de banco)", duplo.filter((r) => r.status === "fulfilled").length === 1 && rejeitado.length === 1 && rejeitado[0].reason?.message === MOTIVO_NADA_A_DESFAZER, duplo.map((r) => (r.status === "rejected" ? String(r.reason?.message).slice(0, 80) : "ok")));
    check("e a mãe voltou uma vez só", (await prisma.eapTarefa.count({ where: { projetoId: projeto.id } })) === 4);

    // ── o invólucro das actions (`comPassoDaAction`) ─────────────────────────
    const ctx = { user: { id: admin.id } } as never;
    const renomear = comPassoDaAction(
      { projetoDe: (i: { id: string; nome: string }) => projetoDaLinha(i.id), rotulo: rotuloDaLinha("Renomear") },
      async (i: { id: string; nome: string }) => prisma.eapTarefa.update({ where: { id: i.id }, data: { nome: i.nome } }),
    );
    await renomear({ id: A.id, nome: "Via action" }, ctx);
    check("o invólucro grava o passo com o nome da linha lido ANTES", (await rotuloDoUltimoPasso(p.projetoId, p.userId)) === 'Renomear "Minha edição"', await rotuloDoUltimoPasso(p.projetoId, p.userId));
    await desfazerUltimoPasso(p.projetoId, p.userId);
    check("e desfazer devolve o nome", (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: A.id } })).nome === "Minha edição");
    const antesDoErro = await passos();
    const semLinha = await erroDe(() => renomear({ id: "nao-existe", nome: "x" }, ctx));
    check("linha inexistente: o handler responde o erro dele e nenhum passo nasce", !!semLinha && (await passos()) === antesDoErro, semLinha);

    // ── pilha de 20 ──────────────────────────────────────────────────────────
    for (let i = 0; i < MAX_PASSOS + 2; i++) await comPasso({ ...p, rotulo: `Passo ${i}` }, () => prisma.eapTarefa.update({ where: { id: A.id }, data: { nome: `Nome ${i}` } }));
    check(`a pilha guarda só os ${MAX_PASSOS} últimos`, (await passos()) === MAX_PASSOS && (await rotuloDoUltimoPasso(p.projetoId, p.userId)) === `Passo ${MAX_PASSOS + 1}`);

    // ── plano aprovado ───────────────────────────────────────────────────────
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });
    await comPasso({ ...p, rotulo: "Pessoas e horas depois da aprovação" }, () => prisma.eapTarefa.update({ where: { id: A.id }, data: { nome: "Pós-aprovação" } }));
    check("com o plano aprovado nem se guarda passo (ninguém poderia desfazer)", (await passos()) === MAX_PASSOS && (await rotuloDoUltimoPasso(p.projetoId, p.userId)) === `Passo ${MAX_PASSOS + 1}`);
    check("cronograma aprovado recusa com a frase da trava", (await erroDe(() => desfazerUltimoPasso(p.projetoId, p.userId))) === MOTIVO_PLANO_TRAVADO);
    check("a pilha não foi tocada pela recusa", (await passos()) === MAX_PASSOS);
    await limparPassos(projeto.id);
    check("limpar zera a pilha do projeto", (await passos()) === 0);
  } finally {
    await prisma.eapPassoDesfazer.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.documentoJuridico.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
