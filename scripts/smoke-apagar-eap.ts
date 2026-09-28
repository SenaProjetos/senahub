/**
 * Smoke do "Apagar EAP" (pedido do dono, 2026-09-27) contra o banco de dev: apagar a EAP inteira de um projeto em
 * rascunho para recomeçar com outro modelo. O vitest cobre a regra pura (`apagar-eap.ts`); aqui vai o I/O — o que
 * impede (andamento, cronograma aprovado, card gerado), o que vai junto (vínculo, pessoa atribuída), o que fica (fase
 * da disciplina, cronograma) e a EAP vazia aceitando gerar de novo.
 *
 * Uso: npm run smoke:apagar-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { apagarEapDoProjeto, impedimentoParaApagarEapDoProjeto } from "../src/modules/planejamento/apagar-eap-service";
import { MOTIVO_EAP_VAZIA } from "../src/modules/planejamento/apagar-eap";
import { opcoesParaGerarDisciplinas } from "../src/modules/planejamento/modelos/disciplina-service";

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

const tag = `smoke-apagar-eap-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  const status = await prisma.tarefaStatus.findFirst({ select: { id: true } });
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true }, select: { id: true } });
  if (!admin || !status || !fase) {
    console.log("Banco de dev sem admin, sem status de tarefa ou sem fase — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    const disciplina = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural" } });
    await prisma.disciplinaEtapa.create({ data: { disciplinaId: disciplina.id, etapaId: fase.id, percentual: 100, ordem: 0 } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    const nova = async (nome: string, parentId: string | null, ordem: number) => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo, nome, parentId, disciplinaId: disciplina.id, tipoEap: "atv", duracaoDias: 2, ordem, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    };
    const raiz = await nova("Estrutural", null, 0);
    const a = await nova("Modelagem", raiz.id, 1);
    const b = await nova("Detalhamento", raiz.id, 2);
    await prisma.eapDependencia.create({ data: { tarefaId: b.id, predecessoraId: a.id, tipo: "fs", lagDias: 0 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: a.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });

    check("rascunho limpo pode apagar", (await impedimentoParaApagarEapDoProjeto(projeto.id)) === null);

    // ── o que impede ─────────────────────────────────────────────────────────
    await prisma.eapTarefa.update({ where: { id: a.id }, data: { progresso: 30 } });
    const comAndamento = await erroDe(() => apagarEapDoProjeto(projeto.id));
    check("linha com andamento impede, com a contagem", !!comAndamento && /^1 linha\(s\) já têm andamento/.test(comAndamento), comAndamento);
    await prisma.eapTarefa.update({ where: { id: a.id }, data: { progresso: 0 } });

    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });
    const aprovado = await erroDe(() => apagarEapDoProjeto(projeto.id));
    check("cronograma aprovado impede", !!aprovado && /aprovado/.test(aprovado), aprovado);
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: false } });

    const card = await prisma.tarefa.create({ data: { titulo: `${tag}-card`, statusId: status.id, projetoId: projeto.id, criadorId: admin.id, eapTarefaId: b.id } });
    const comCard = await erroDe(() => apagarEapDoProjeto(projeto.id));
    check("card gerado da EAP impede", !!comCard && /^1 card\(s\)/.test(comCard), comCard);
    await prisma.tarefa.delete({ where: { id: card.id } });
    check("nada foi apagado pelas recusas", (await prisma.eapTarefa.count({ where: { projetoId: projeto.id } })) === 3);

    // ── apagar ───────────────────────────────────────────────────────────────
    const r = await apagarEapDoProjeto(projeto.id);
    check("apaga as 3 linhas (a de cima e as subtarefas)", r.apagadas === 3, r);
    check("vínculos e pessoas atribuídas foram junto", (await prisma.eapDependencia.count({ where: { tarefaId: b.id } })) === 0 && (await prisma.eapAtribuicao.count({ where: { tarefaId: a.id } })) === 0);
    check("a fase da disciplina fica (mexe em pagamento)", (await prisma.disciplinaEtapa.count({ where: { disciplinaId: disciplina.id } })) === 1);
    check("o cronograma (âncora) fica", (await prisma.cronogramaProjeto.count({ where: { projetoId: projeto.id } })) === 1);
    check("EAP vazia: o botão diz que não há o que apagar", (await impedimentoParaApagarEapDoProjeto(projeto.id)) === MOTIVO_EAP_VAZIA);
    const opcoes = await opcoesParaGerarDisciplinas(projeto.id);
    check("e a disciplina volta a aparecer para gerar de novo", opcoes.some((o) => o.disciplinaId === disciplina.id), opcoes.map((o) => o.nome));
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
