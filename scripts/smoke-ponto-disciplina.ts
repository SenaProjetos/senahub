/**
 * Smoke da R2 do rateio (disciplina na sessão, reunião em projeto, quem pode marcar) contra o banco de
 * dev. Cria e apaga os próprios dados.
 *
 *   1. Responsável por UMA disciplina: a sessão grava a disciplina sem escolher tarefa.
 *   2. Responsável por DUAS: sem tarefa é recusado (frase da tela); com tarefa, vale a disciplina dela.
 *   3. Fora da equipe e sem card: recusado; com card aberto no projeto: aceito.
 *   4. Reunião externa ligada ao projeto: sessão reuniao_externa com projeto e sem disciplina; a
 *      batida guarda o destino.
 *   5. Correção do dia pelo RH com duas disciplinas e sem tarefa: grava sem disciplina, sem erro.
 *   6. Responsável trocado (R5): a correção de um dia ANTES da troca usa a disciplina daquele dia.
 *
 * Uso: npm run smoke:ponto-disciplina
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { aplicarBatida, editarDia } from "../src/modules/ponto/service";
import { MSG_SEM_ACESSO_PROJETO, MSG_TAREFA_OBRIGATORIA } from "../src/modules/ponto/disciplina-sessao";
import { substituirResponsaveis } from "../src/modules/projetos/responsaveis-service";

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

const tag = `smoke-ponto-disc-${Date.now()}`;
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  const mk = (n: string) => prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, tipo: "interno", emailVerified: false } });
  const ana = await mk("ana");
  const beto = await mk("beto");
  const caio = await mk("caio");
  const dani = await mk("dani");
  const ids = [ana.id, beto.id, caio.id, dani.id];
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-c` } });
  const seq = Number(`${Date.now()}`.slice(-5));
  const proj = await prisma.projeto.create({ data: { codigo: `${seq}9`, ano: 2026, sequencial: seq + 9, nome: `${tag}-p`, clienteId: cliente.id } });
  const d1 = await prisma.disciplina.create({ data: { projetoId: proj.id, disciplinaTextoLegado: "Estrutural", status: "em_andamento" } });
  const d2 = await prisma.disciplina.create({ data: { projetoId: proj.id, disciplinaTextoLegado: "Hidráulica", status: "em_andamento" } });
  const status = await prisma.tarefaStatus.findFirstOrThrow({ where: { ativo: true, concluido: false }, orderBy: { ordem: "asc" } });

  try {
    const ha10dias = new Date(Date.now() - 10 * 86_400_000);
    await substituirResponsaveis(prisma, d1.id, [ana.id, beto.id], ha10dias);
    await substituirResponsaveis(prisma, d2.id, [beto.id], ha10dias);
    const cardBeto = await prisma.tarefa.create({ data: { titulo: "Hidráulica térreo", statusId: status.id, projetoId: proj.id, disciplinaId: d2.id, criadorId: beto.id, responsaveis: { create: [{ userId: beto.id }] } } });
    const cardDani = await prisma.tarefa.create({ data: { titulo: "Apoio", statusId: status.id, projetoId: proj.id, disciplinaId: d1.id, criadorId: dani.id, responsaveis: { create: [{ userId: dani.id }] } } });

    // 1
    await aplicarBatida({ userId: ana.id, tipo: "entrada", horario: horasAtras(3), projetoId: proj.id, origem: "app" });
    const sAna = await prisma.sessaoTrabalho.findFirst({ where: { userId: ana.id, fim: null } });
    check("uma disciplina: grava a disciplina sem tarefa", sAna?.disciplinaId === d1.id, sAna?.disciplinaId);

    // 2
    const e2 = await erroDe(() => aplicarBatida({ userId: beto.id, tipo: "entrada", horario: horasAtras(3), projetoId: proj.id, origem: "app" }));
    check("duas disciplinas sem tarefa: recusado com a frase da tela", e2 === MSG_TAREFA_OBRIGATORIA, e2);
    await aplicarBatida({ userId: beto.id, tipo: "entrada", horario: horasAtras(3), projetoId: proj.id, tarefaId: cardBeto.id, origem: "app" });
    const sBeto = await prisma.sessaoTrabalho.findFirst({ where: { userId: beto.id, fim: null } });
    check("duas disciplinas com tarefa: vale a disciplina da tarefa", sBeto?.disciplinaId === d2.id, sBeto?.disciplinaId);

    // 3
    const e3 = await erroDe(() => aplicarBatida({ userId: caio.id, tipo: "entrada", horario: horasAtras(3), projetoId: proj.id, origem: "app" }));
    check("fora da equipe, sem disciplina e sem card: recusado", e3 === MSG_SEM_ACESSO_PROJETO, e3);
    await aplicarBatida({ userId: dani.id, tipo: "entrada", horario: horasAtras(3), projetoId: proj.id, tarefaId: cardDani.id, origem: "app" });
    const sDani = await prisma.sessaoTrabalho.findFirst({ where: { userId: dani.id, fim: null } });
    check("com card aberto no projeto: aceito, disciplina do card", sDani?.disciplinaId === d1.id, sDani?.disciplinaId);

    // 4
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: caio.id, papel: "coordenador" } });
    await aplicarBatida({ userId: caio.id, tipo: "entrada", horario: horasAtras(3), projetoId: `__reuniao_externa:${proj.id}`, origem: "app" });
    const sCaio = await prisma.sessaoTrabalho.findFirst({ where: { userId: caio.id, fim: null } });
    check("reunião externa no projeto: sessão com projeto, sem disciplina", sCaio?.tipoAlocacao === "reuniao_externa" && sCaio.projetoId === proj.id && sCaio.disciplinaId === null, sCaio);
    const bCaio = await prisma.batida.findFirst({ where: { userId: caio.id, tipo: "entrada" } });
    check("a batida guarda o destino (reunião externa)", bCaio?.tipoAlocacao === "reuniao_externa", bCaio?.tipoAlocacao);

    // 5
    const ontem = new Date(Date.now() - 86_400_000);
    const diaIso = new Date(ontem.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    await editarDia({
      userId: beto.id,
      editorId: ana.id,
      diaISO: diaIso,
      itens: [{ tipo: "entrada", hora: "08:00", projetoId: proj.id }, { tipo: "saida", hora: "12:00", projetoId: proj.id }],
      justificativa: "smoke",
      proprio: false,
    });
    const sEdit = await prisma.sessaoTrabalho.findMany({ where: { userId: beto.id, fim: { not: null } } });
    check("correção do RH com duas disciplinas e sem tarefa: grava sem disciplina", sEdit.length > 0 && sEdit.every((s) => s.disciplinaId === null), sEdit.map((s) => s.disciplinaId));

    // 6 — Ana sai de Estrutural e vai para Hidráulica há 2 dias; o RH corrige um dia de 5 dias atrás.
    const ha2dias = new Date(Date.now() - 2 * 86_400_000);
    await substituirResponsaveis(prisma, d1.id, [beto.id], ha2dias);
    await substituirResponsaveis(prisma, d2.id, [beto.id, ana.id], ha2dias);
    const hist = await prisma.disciplinaResponsavelHistorico.findMany({ where: { userId: ana.id }, orderBy: { inicio: "asc" } });
    check("histórico: período em Estrutural fechado e Hidráulica aberto", hist.length === 2 && hist[0].disciplinaId === d1.id && hist[0].fim !== null && hist[1].disciplinaId === d2.id && hist[1].fim === null, hist);
    const dia5 = new Date(Date.now() - 5 * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
    await editarDia({
      userId: ana.id, editorId: beto.id, diaISO: dia5,
      itens: [{ tipo: "entrada", hora: "08:00", projetoId: proj.id }, { tipo: "saida", hora: "12:00", projetoId: proj.id }],
      justificativa: "smoke", proprio: false,
    });
    const s5 = await prisma.sessaoTrabalho.findFirst({ where: { userId: ana.id, fim: { not: null } }, orderBy: { inicio: "asc" } });
    check("correção de dia antes da troca usa a disciplina daquele dia (Estrutural)", s5?.disciplinaId === d1.id, s5?.disciplinaId);
  } finally {
    await prisma.ajustePonto.deleteMany({ where: { userId: { in: ids } } });
    await prisma.batida.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoTrabalho.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: proj.id } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: proj.id } });
    await prisma.disciplinaResponsavelHistorico.deleteMany({ where: { userId: { in: ids } } });
    await prisma.disciplinaResponsavel.deleteMany({ where: { userId: { in: ids } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: proj.id } });
    await prisma.projeto.delete({ where: { id: proj.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
