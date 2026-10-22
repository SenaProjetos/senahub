/**
 * Smoke da disciplina da linha da EAP (Fase A do plano 2026-10-22-eap-fase-a-disciplina) contra o banco de dev.
 * O vitest cobre as regras puras (`disciplina-linha.ts`, `qualidade.ts`); aqui vai o I/O:
 *   - A2 — a correção "Usar a disciplina do agrupamento": só o que ainda diverge, sem tirar quem já está atribuído,
 *     recusada com o plano aprovado.
 *   - A3 — o card gerado da EAP leva a sigla da fase no título, e a segunda sincronização não regrava nada.
 *   - A1 — "Inserir acima" cria a linha com a disciplina do AGRUPAMENTO-pai, não a da vizinha (causa do "Visita técnica
 *     veio como Hidro"), e o responsável da disciplina só desce quando há disciplina.
 *
 * Uso: npm run smoke:disciplina-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { inserirLinhaAcima } from "../src/modules/planejamento/arvore-service";
import { sincronizarCards } from "../src/modules/planejamento/recursos-service";
import { alinharDisciplinasNoBanco } from "../src/modules/planejamento/disciplina-linha-service";
import { MOTIVO_PLANO_TRAVADO } from "../src/modules/planejamento/trava-plano";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-disciplina-eap-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true }, select: { id: true, sigla: true } });
  const fase2 = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true, id: { not: fase?.id } }, select: { id: true } });
  if (!admin || !fase || !fase2) {
    console.log("Banco de dev sem admin ou sem fase — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    const hid = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Hidrossanitário" } });
    const ele = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Elétrica" } });
    // Hidro tem a fase cadastrada (como no projeto real); Elétrica não tem nenhuma.
    await prisma.disciplinaEtapa.create({ data: { disciplinaId: hid.id, etapaId: fase.id, percentual: 100, ordem: 0 } });
    await prisma.disciplinaResponsavel.create({ data: { disciplinaId: hid.id, userId: admin.id } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });

    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, disciplinaId: string | null, etapaId: string | null, tipoEap: "res" | "atv" = "atv") => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo, nome, parentId, disciplinaId, etapaId, tipoEap, duracaoDias: 2, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    };
    // F (fase, sem disciplina) › H (Hidro, fase) › M ;  F › G (Gestão, sem disciplina) › X
    const F = await nova("Básico", null, null, null, "res");
    const H = await nova("Hidrossanitário", F.id, hid.id, fase.id, "res");
    const M = await nova("Modelagem", H.id, hid.id, fase.id);
    const G = await nova("Gestão", F.id, null, null, "res");
    const X = await nova("Reunião", G.id, null, null);

    // ── A1: linha nova nasce com a disciplina do agrupamento ─────────────────
    const sobHidro = await inserirLinhaAcima(M.id);
    const a = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: sobHidro.novaId }, select: { disciplinaId: true, etapaId: true, parentId: true } });
    check("inserir acima sob Hidro: nasce Hidro, com a fase do agrupamento", a.disciplinaId === hid.id && a.etapaId === fase.id && a.parentId === H.id, a);
    check("o responsável de Hidro desce para ela", (await prisma.eapAtribuicao.count({ where: { tarefaId: sobHidro.novaId, userId: admin.id } })) === 1);

    const sobGestao = await inserirLinhaAcima(X.id);
    const b = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: sobGestao.novaId }, select: { disciplinaId: true, etapaId: true, parentId: true } });
    check("inserir acima sob Gestão (sem disciplina): nasce sem disciplina e sem fase", b.disciplinaId === null && b.etapaId === null && b.parentId === G.id, b);
    check("e sem responsável herdado", (await prisma.eapAtribuicao.count({ where: { tarefaId: sobGestao.novaId } })) === 0);

    const naRaiz = await inserirLinhaAcima(F.id);
    const c = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: naRaiz.novaId }, select: { disciplinaId: true, parentId: true } });
    check("inserir acima na raiz: nasce sem disciplina", c.disciplinaId === null && c.parentId === null, c);

    // a fase só vai se a disciplina a tem cadastrada: pai de Elétrica com fase, e Elétrica não a tem
    const topoEle = await nova("Elétrica topo", F.id, ele.id, fase.id, "res");
    const filhaEle = await nova("Quadros", topoEle.id, ele.id, null);
    const semFase = await inserirLinhaAcima(filhaEle.id);
    const f1 = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: semFase.novaId }, select: { disciplinaId: true, etapaId: true } });
    check("a linha nova herda a disciplina, mas a fase só se a disciplina a tem cadastrada", f1.disciplinaId === ele.id && f1.etapaId === null, f1);

    // a vizinha de OUTRA disciplina não vaza: inserir acima de uma linha de Elétrica dentro de Gestão
    const eleSobGestao = await nova("Quadros", G.id, ele.id, null);
    const d1 = await inserirLinhaAcima(eleSobGestao.id);
    const e = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: d1.novaId }, select: { disciplinaId: true } });
    check("a disciplina da vizinha (Elétrica) não passa para a linha nova", e.disciplinaId === null, e);

    // ── A2: corrigir para a disciplina do agrupamento ────────────────────────
    // H (Hidro) › V (Elétrica) · H › GH (sem disciplina) › Y (Elétrica)
    const V = await nova("Visita técnica", H.id, ele.id, fase.id);
    const W = await nova("Outra", H.id, ele.id, fase2.id);
    const bloco = await nova("Bloco elétrico", H.id, ele.id, null, "res");
    await nova("Quadro do bloco", bloco.id, ele.id, null);
    const GH = await nova("Gestão de Hidro", H.id, null, null, "res");
    const Y = await nova("Quadros de Hidro", GH.id, ele.id, null);
    await prisma.eapAtribuicao.create({ data: { tarefaId: V.id, userId: admin.id, papel: "pro", horasPrevistas: 4, principal: true } });

    const r0 = await alinharDisciplinasNoBanco(projeto.id, [bloco.id]);
    check("agrupamento de outra disciplina não é corrigido (o conserto é mover o bloco)", r0.corrigidas.length === 0 && (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: bloco.id }, select: { disciplinaId: true } })).disciplinaId === ele.id, r0);

    const r1 = await alinharDisciplinasNoBanco(projeto.id, [V.id, W.id, Y.id, M.id]);
    check("corrige só as que divergem (M já estava certa)", [...r1.corrigidas].sort().join() === [V.id, W.id, Y.id].sort().join(), r1);
    const vDepois = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: V.id }, select: { disciplinaId: true, etapaId: true } });
    const yDepois = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: Y.id }, select: { disciplinaId: true, etapaId: true } });
    check("viram Hidro; a linha sem fase ganha a do agrupamento", yDepois.disciplinaId === hid.id && yDepois.etapaId === fase.id && vDepois.disciplinaId === hid.id, { vDepois, yDepois });
    check("a fase da própria linha fica quando a disciplina nova a tem (o marco não perde a etapa)", vDepois.etapaId === fase.id, vDepois);
    const wDepois = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: W.id }, select: { etapaId: true } });
    check("fase que a disciplina nova NÃO tem cadastrada sai; entra a do agrupamento", wDepois.etapaId === fase.id, wDepois);
    check("quem já estava atribuído continua, sem duplicar", (await prisma.eapAtribuicao.count({ where: { tarefaId: V.id } })) === 1);
    check("a linha corrigida que estava sem ninguém ganha o responsável da nova disciplina", (await prisma.eapAtribuicao.count({ where: { tarefaId: Y.id, userId: admin.id } })) === 1);
    const r2 = await alinharDisciplinasNoBanco(projeto.id, [V.id, Y.id]);
    check("lista velha: a segunda chamada não encontra nada a corrigir", r2.corrigidas.length === 0, r2);

    const Z = await nova("Outra visita", H.id, ele.id, null);
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });
    const travado = await erroDe(() => alinharDisciplinasNoBanco(projeto.id, [Z.id]));
    check("cronograma aprovado recusa com a frase da trava", travado === MOTIVO_PLANO_TRAVADO, travado);
    check("e nada foi gravado", (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: Z.id }, select: { disciplinaId: true } })).disciplinaId === ele.id);

    // ── A3: a fase no título do card (cronograma aprovado a esta altura) ─────
    await prisma.eapAtribuicao.create({ data: { tarefaId: M.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });
    await sincronizarCards(prisma, projeto.id, admin.id);
    const cardM = await prisma.tarefa.findUnique({ where: { eapTarefaId: M.id }, select: { titulo: true } });
    check("o card nasce com a sigla da fase no título", cardM?.titulo === `${fase.sigla} · Modelagem`, cardM);
    await prisma.eapTarefa.update({ where: { id: M.id }, data: { nome: "Modelagem hidráulica" } });
    await sincronizarCards(prisma, projeto.id, admin.id);
    const renomeado = await prisma.tarefa.findUnique({ where: { eapTarefaId: M.id }, select: { titulo: true } });
    check("renomear a linha leva o título do card junto, com a fase", renomeado?.titulo === `${fase.sigla} · Modelagem hidráulica`, renomeado);
    const de3 = await sincronizarCards(prisma, projeto.id, admin.id);
    check("sincronizar de novo não regrava card nenhum (compara o título composto)", de3.atualizados === 0 && de3.criados === 0, de3);
  } finally {
    await prisma.tarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
