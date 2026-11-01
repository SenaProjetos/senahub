/**
 * Smoke da edição em lote da EAP (Fase C do plano 2026-10-22-eap-fase-c-edicao-em-lote) contra o banco de dev. O vitest
 * cobre as regras puras (`arvore-lote.ts`, `colar-tarefas.ts`, `arvore-predecessoras.ts`); aqui vai o I/O:
 *   - recuar, avançar, mover e excluir várias linhas de uma vez, tudo ou nada, com a frase que diz qual linha barrou;
 *   - colar várias tarefas e copiar/colar um bloco (entram nas tasks seguintes).
 *
 * Uso: npm run smoke:eap-lote
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_PRIMEIRA_DO_NIVEL, MOTIVO_SEM_IRMA_ACIMA, MOTIVO_ULTIMA_DO_NIVEL } from "../src/modules/planejamento/arvore-eap";
import { avancarEmLote, excluirEmLote, moverEmLote, recuarEmLote } from "../src/modules/planejamento/arvore-lote-service";
import { criarTarefasEmLote } from "../src/modules/planejamento/colar-tarefas-service";
import { colarBloco } from "../src/modules/planejamento/colar-bloco-service";
import { lerTarefasColadas } from "../src/modules/planejamento/colar-tarefas";

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

const tag = `smoke-eap-lote-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });
  const outroProjeto = await prisma.projeto.create({
    data: { codigo: `${Date.now() + 1}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now() + 1}`.slice(-5)), nome: `${tag}-outro`, clienteId: cliente.id },
  });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, projetoId = projeto.id) => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: { projetoId, idCorporativo, nome, parentId, tipoEap: "atv", duracaoDias: 2, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    };
    // P › X (X1), Y (Y1), Z, W   ·   Q › Q1
    const P = await nova("P", null);
    const X = await nova("X", P.id);
    const X1 = await nova("X1", X.id);
    const Y = await nova("Y", P.id);
    await nova("Y1", Y.id);
    const Z = await nova("Z", P.id);
    const W = await nova("W", P.id);
    const Q = await nova("Q", null);
    const Q1 = await nova("Q1", Q.id);
    const estranha = await nova("Estranha", null, outroProjeto.id);

    const foto = async () =>
      JSON.stringify((await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, orderBy: { id: "asc" }, select: { id: true, parentId: true, ordem: true } })));
    const filhasDe = async (id: string) =>
      (await prisma.eapTarefa.findMany({ where: { parentId: id }, orderBy: { ordem: "asc" }, select: { nome: true } })).map((l) => l.nome);

    // ── recuar ───────────────────────────────────────────────────────────────
    const r1 = await recuarEmLote([Y.id, Z.id]);
    check("recuar Y e Z: as duas viram filhas de X (irmãs, Y antes de Z), não uma dentro da outra", (await filhasDe(X.id)).join() === "X1,Y,Z" && (await filhasDe(Y.id)).join() === "Y1", { x: await filhasDe(X.id), y: await filhasDe(Y.id) });
    check("W continua sob P e a contagem diz 2 linhas", (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: W.id } })).parentId === P.id && r1.linhas === 2, r1);

    const antesRecuo = await foto();
    const semIrma = await erroDe(() => recuarEmLote([X.id]));
    check("recuar a primeira irmã: recusa com a frase e o nome da linha", semIrma === `X: ${MOTIVO_SEM_IRMA_ACIMA}`, semIrma);
    check("tudo ou nada: a recusa não mexeu em nada", (await foto()) === antesRecuo);

    // ── avançar ──────────────────────────────────────────────────────────────
    const antesTopo = await foto();
    const topo = await erroDe(() => avancarEmLote([P.id, Q.id]));
    check("avançar linhas de topo: recusa", topo === `P: ${MOTIVO_NIVEL_MAIS_ALTO}` && (await foto()) === antesTopo, topo);
    const a1 = await avancarEmLote([Y.id, Z.id]);
    check("avançar Y e Z juntas: voltam a ser irmãs de X, sob P, nessa ordem, e W fica depois", a1.linhas === 2 && (await filhasDe(P.id)).join() === "X,Y,Z,W" && (await filhasDe(X.id)).join() === "X1" && (await filhasDe(Y.id)).join() === "Y1", { p: await filhasDe(P.id), x: await filhasDe(X.id), y: await filhasDe(Y.id) });

    // ── mover ────────────────────────────────────────────────────────────────
    const antesMover = await foto();
    check("mover para cima a primeira irmã: recusa com a frase", (await erroDe(() => moverEmLote([X.id], -1))) === `X: ${MOTIVO_PRIMEIRA_DO_NIVEL}`);
    check("mover para baixo a última irmã: recusa com a frase", (await erroDe(() => moverEmLote([W.id], 1))) === `W: ${MOTIVO_ULTIMA_DO_NIVEL}`);
    check("as recusas não mexeram em nada", (await foto()) === antesMover);
    const m1 = await moverEmLote([Y.id, Z.id], -1);
    check("mover Y e Z para cima em bloco: Y, Z, X, W", m1.linhas === 2 && (await filhasDe(P.id)).join() === "Y,Z,X,W", await filhasDe(P.id));
    const m2 = await moverEmLote([Y.id, Z.id], 1);
    check("e para baixo em bloco: volta a X, Y, Z, W", m2.linhas === 2 && (await filhasDe(P.id)).join() === "X,Y,Z,W", await filhasDe(P.id));

    // ── excluir ──────────────────────────────────────────────────────────────
    const e1 = await excluirEmLote([Q.id, W.id]);
    check("excluir Q e W: somem, e Q1 vai junto (3 linhas no total)", e1.linhas === 2 && e1.excluidas >= 3 && (await prisma.eapTarefa.count({ where: { id: { in: [Q.id, W.id, Q1.id] } } })) === 0, e1);
    const outro = await erroDe(() => excluirEmLote([X.id, estranha.id]));
    check("linhas de projetos diferentes: recusa", outro === "As linhas escolhidas são de projetos diferentes.", outro);
    check("nenhuma linha escolhida: recusa", (await erroDe(() => excluirEmLote([]))) === "Escolha ao menos uma linha.");
    check("linha que não existe mais: recusa pedindo para atualizar", !!(await erroDe(() => excluirEmLote([X.id, "fantasma"]))));
    check("X continua lá depois das recusas", (await prisma.eapTarefa.count({ where: { id: X.id } })) === 1 && (await prisma.eapTarefa.count({ where: { id: X1.id } })) === 1);

    // ── colar várias tarefas (C3) ────────────────────────────────────────────
    const hid = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Hidro" } });
    const G = await nova("Grupo Hidro", null);
    await prisma.eapTarefa.update({ where: { id: G.id }, data: { disciplinaId: hid.id } });
    const GA = await nova("Ga", G.id);
    await nova("Gb", G.id);
    await nova("Depois do grupo", null);
    const leitura = lerTarefasColadas("Vistoria\t0\nLevantamento\t3\n\nRelatório");
    if (!leitura.ok) throw new Error(leitura.erro);
    const criadas = await criarTarefasEmLote({ projetoId: projeto.id, depoisDeId: GA.id, tarefas: leitura.tarefas });
    check("colar 3 tarefas abaixo de Ga: entram no mesmo pai, na ordem, antes de Gb", criadas.ids.length === 3 && (await filhasDe(G.id)).join() === "Ga,Vistoria,Levantamento,Relatório,Gb", await filhasDe(G.id));
    const novas = await prisma.eapTarefa.findMany({ where: { id: { in: criadas.ids } }, select: { nome: true, tipoEap: true, duracaoDias: true, disciplinaId: true, idCorporativo: true } });
    const porNome = new Map(novas.map((l) => [l.nome, l]));
    check("a disciplina é a do agrupamento", novas.every((l) => l.disciplinaId === hid.id), novas.map((l) => l.disciplinaId));
    check("0 vira marco com duração 0; sem duração = 1 dia; 3 = 3 dias", porNome.get("Vistoria")?.tipoEap === "mrc" && Number(porNome.get("Vistoria")?.duracaoDias) === 0 && Number(porNome.get("Relatório")?.duracaoDias) === 1 && Number(porNome.get("Levantamento")?.duracaoDias) === 3);
    check("cada uma tem idCorporativo, todos diferentes", novas.every((l) => !!l.idCorporativo) && new Set(novas.map((l) => l.idCorporativo)).size === 3);
    const rais = await criarTarefasEmLote({ projetoId: projeto.id, depoisDeId: null, tarefas: [{ nome: "No fim", marco: false, duracaoDias: null }] });
    const noFim = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: rais.ids[0] }, select: { parentId: true, disciplinaId: true, ordem: true } });
    const maior = await prisma.eapTarefa.aggregate({ where: { projetoId: projeto.id }, _max: { ordem: true } });
    check("sem referência: vai para o fim da raiz, sem disciplina", noFim.parentId === null && noFim.disciplinaId === null && noFim.ordem === maior._max.ordem, noFim);
    check("referência de outro projeto: recusa", !!(await erroDe(() => criarTarefasEmLote({ projetoId: projeto.id, depoisDeId: estranha.id, tarefas: leitura.tarefas }))));

    // ── copiar um bloco e colar (C4) ─────────────────────────────────────────
    const admin = await prisma.user.findFirstOrThrow({ where: { superUsuario: true, ativo: true }, select: { id: true } });
    const ele = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Elétrica" } });
    const F = await nova("Fora do bloco", null);
    const B = await nova("Bloco", null);
    await prisma.eapTarefa.update({ where: { id: B.id }, data: { disciplinaId: ele.id } });
    const B1 = await nova("B1", B.id);
    const B2 = await nova("B2", B.id);
    await prisma.eapDependencia.create({ data: { tarefaId: B2.id, predecessoraId: B1.id, tipo: "fs", lagDias: 1 } });
    await prisma.eapDependencia.create({ data: { tarefaId: B1.id, predecessoraId: F.id, tipo: "fs", lagDias: 0 } });
    await prisma.eapTarefa.update({ where: { id: B2.id }, data: { restricaoTipo: "iniciar_nao_antes_de", restricaoData: d("2026-11-02"), progresso: 50 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: B2.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: B1.id, userId: null, papel: "ext", horasPrevistas: 0 } });

    const colado = await colarBloco({ projetoId: projeto.id, origemIds: [B.id, B1.id], depoisDeId: GA.id });
    check("colar o bloco (a mãe e as duas filhas, mesmo com a filha selecionada junto): 3 linhas novas", colado.criadas === 3 && colado.ids.length === 3, colado);
    const copias = await prisma.eapTarefa.findMany({ where: { id: { in: colado.ids } }, select: { id: true, nome: true, parentId: true, disciplinaId: true, idCorporativo: true, restricaoTipo: true, progresso: true } });
    const c = new Map(copias.map((l) => [l.nome, l]));
    check("a cópia da mãe entra no pai do destino, logo abaixo de Ga", c.get("Bloco")?.parentId === G.id && (await filhasDe(G.id)).slice(0, 2).join() === "Ga,Bloco", await filhasDe(G.id));
    check("as filhas copiadas ficam sob a cópia da mãe", c.get("B1")?.parentId === c.get("Bloco")?.id && c.get("B2")?.parentId === c.get("Bloco")?.id);
    check("ids novos e idCorporativo novos e distintos", copias.every((l) => ![B.id, B1.id, B2.id].includes(l.id) && !!l.idCorporativo) && new Set(copias.map((l) => l.idCorporativo)).size === 3);
    check("a disciplina é a do agrupamento de destino (Hidro), não a da origem (Elétrica)", copias.every((l) => l.disciplinaId === hid.id), copias.map((l) => l.disciplinaId));
    const deps = await prisma.eapDependencia.findMany({ where: { OR: [{ tarefaId: { in: colado.ids } }, { predecessoraId: { in: colado.ids } }] }, select: { tarefaId: true, predecessoraId: true, lagDias: true } });
    check("o vínculo interno B2→B1 foi copiado (e remapeado, com o atraso)", deps.some((x) => x.tarefaId === c.get("B2")!.id && x.predecessoraId === c.get("B1")!.id && Number(x.lagDias) === 1), deps);
    check("o vínculo com a linha de fora NÃO foi copiado", !deps.some((x) => x.predecessoraId === F.id) && deps.length === 1, deps);
    check("restrição de data e % não foram copiados", c.get("B2")?.restricaoTipo === null && c.get("B2")?.progresso === 0);
    const atribs = await prisma.eapAtribuicao.findMany({ where: { tarefaId: { in: colado.ids } }, select: { tarefaId: true, papel: true, userId: true } });
    check("a pessoa da origem não foi copiada, mas a marca Externo sim", !atribs.some((a) => a.userId === admin.id && a.tarefaId === c.get("B2")!.id) && atribs.some((a) => a.tarefaId === c.get("B1")!.id && a.papel === "ext"), atribs);
    const intactas = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: B2.id }, select: { restricaoTipo: true, progresso: true, disciplinaId: true } });
    check("as originais continuam como estavam", intactas.restricaoTipo === "iniciar_nao_antes_de" && intactas.progresso === 50 && (await prisma.eapDependencia.count({ where: { tarefaId: { in: [B1.id, B2.id] } } })) === 2);
    const naRaiz = await colarBloco({ projetoId: projeto.id, origemIds: [B.id], depoisDeId: null });
    const naRaizLinhas = await prisma.eapTarefa.findMany({ where: { id: { in: naRaiz.ids } }, select: { nome: true, parentId: true, disciplinaId: true } });
    check("sem referência: a cópia vai para o fim da raiz", naRaiz.criadas === 3 && naRaizLinhas.find((l) => l.nome === "Bloco")?.parentId === null, naRaizLinhas);
    check("sem disciplina no destino (a raiz), a cópia MANTÉM a disciplina da origem (Elétrica) na mãe", naRaizLinhas.find((l) => l.nome === "Bloco")?.disciplinaId === ele.id, naRaizLinhas.map((l) => l.disciplinaId));
    check("origem de outro projeto: recusa", !!(await erroDe(() => colarBloco({ projetoId: projeto.id, origemIds: [estranha.id], depoisDeId: null }))));
    check("referência de outro projeto: recusa", !!(await erroDe(() => colarBloco({ projetoId: projeto.id, origemIds: [B.id], depoisDeId: estranha.id }))));
  } finally {
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: [projeto.id, outroProjeto.id] } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.deleteMany({ where: { id: { in: [projeto.id, outroProjeto.id] } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
