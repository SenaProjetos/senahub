/**
 * Smoke de "Salvar a EAP do projeto como modelo" (Fase E do plano 2026-10-23-eap-fases-d-e-datas-e-modelo) contra o banco de
 * dev. O vitest cobre a conversão pura (`estrutura-do-projeto.ts`); aqui vai o I/O de ponta a ponta: salva a EAP de um
 * projeto como modelo e APLICA o modelo salvo em outro projeto — a mesma árvore, durações, marcos, vínculo e a marca de terceiro.
 *
 * Uso: npm run smoke:salvar-modelo-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { aplicarModeloNoProjeto } from "../src/modules/planejamento/modelos/service";
import { lerEstrutura } from "../src/modules/planejamento/modelos/estrutura";
import { salvarEapDoProjetoComoModelo } from "../src/modules/planejamento/modelos/salvar-do-projeto-service";

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

const tag = `smoke-salvar-modelo-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  const catalogo = await prisma.disciplinaCatalogo.findFirst({ select: { id: true } });
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true }, select: { id: true } });
  if (!admin || !catalogo || !fase) {
    console.log("Banco de dev sem admin, disciplina de catálogo ou fase — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const novoProjeto = (sufixo: string, n: number) =>
    prisma.projeto.create({
      data: { codigo: `${Date.now() + n}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now() + n}`.slice(-5)), nome: `${tag}-${sufixo}`, clienteId: cliente.id },
    });
  const origem = await novoProjeto("origem", 0);
  const destino = await novoProjeto("destino", 1);
  const vazio = await novoProjeto("vazio", 2);
  let modeloId: string | null = null;

  try {
    const dOrigem = await prisma.disciplina.create({ data: { projetoId: origem.id, disciplinaTextoLegado: "Origem", disciplinaId: catalogo.id } });
    await prisma.disciplina.create({ data: { projetoId: destino.id, disciplinaTextoLegado: "Destino", disciplinaId: catalogo.id } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: origem.id, inicioProjeto: d("2026-10-05") } });
    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, tipoEap: "res" | "atv" | "mrc", duracao: number, extra: { disciplinaId?: string; etapaId?: string } = {}) => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: origem.id, idCorporativo, nome, parentId, tipoEap, duracaoDias: duracao, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06"), ...extra },
      });
    };
    // G (agrupamento da disciplina, com fase) › X (3d), Y (2d, depois de X com 1d de atraso)   ·   M (marco)   ·   E (etapa de terceiro)
    const G = await nova("Grupo", null, "res", 0, { disciplinaId: dOrigem.id, etapaId: fase.id });
    const X = await nova("Levantamento", G.id, "atv", 3, { disciplinaId: dOrigem.id });
    const Y = await nova("Modelagem", G.id, "atv", 2, { disciplinaId: dOrigem.id });
    await nova("Entrega", null, "mrc", 0);
    const E = await nova("Aprovação da prefeitura", null, "atv", 10);
    await prisma.eapDependencia.create({ data: { tarefaId: Y.id, predecessoraId: X.id, tipo: "fs", lagDias: 1 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: E.id, userId: null, papel: "ext", horasPrevistas: 0 } });
    // pessoa e % da origem NÃO devem ir para o modelo
    await prisma.eapAtribuicao.create({ data: { tarefaId: X.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });
    await prisma.eapTarefa.update({ where: { id: X.id }, data: { progresso: 60 } });

    const salvo = await salvarEapDoProjetoComoModelo({ projetoId: origem.id, nome: `${tag}-modelo`, descricao: null, tipoEmpreendimentoId: null, autorId: admin.id });
    modeloId = salvo.id;
    check("o modelo foi salvo com 5 linhas e 1 marco", salvo.totalLinhas === 5 && salvo.totalMarcos === 1, salvo);
    check("traz avisos do que não vai (pessoas, horas, %, datas)", salvo.avisos.some((a) => a.includes("Pessoas")), salvo.avisos);
    const gravado = await prisma.modeloEap.findUniqueOrThrow({ where: { id: salvo.id }, select: { estrutura: true, descricao: true } });
    const estrutura = lerEstrutura(gravado.estrutura);
    check("a estrutura gravada lê pelo schema do modelo", estrutura !== null && estrutura.linhas.length === 5);
    check("a descrição diz de onde veio", (gravado.descricao ?? "").includes(origem.codigo), gravado.descricao);

    // ── aplicar o modelo salvo em OUTRO projeto ──────────────────────────────
    const r = await aplicarModeloNoProjeto({ projetoId: destino.id, modeloId: salvo.id });
    check("aplicar o modelo no outro projeto cria as 5 linhas, sem podar nenhuma", r.criadas === 5 && r.podadas === 0, r);
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: destino.id }, select: { id: true, nome: true, tipoEap: true, duracaoDias: true, parentId: true, progresso: true, disciplinaId: true, atribuicoes: { select: { papel: true, userId: true } } } });
    const por = new Map(linhas.map((l) => [l.nome, l]));
    check("mesmos nomes, durações e marco", por.size === 5 && Number(por.get("Levantamento")?.duracaoDias) === 3 && Number(por.get("Modelagem")?.duracaoDias) === 2 && por.get("Entrega")?.tipoEap === "mrc" && Number(por.get("Entrega")?.duracaoDias) === 0, [...por.keys()]);
    check("a árvore: as duas atividades continuam sob o grupo", por.get("Levantamento")?.parentId === por.get("Grupo")?.id && por.get("Modelagem")?.parentId === por.get("Grupo")?.id);
    const dep = await prisma.eapDependencia.findFirst({ where: { tarefaId: por.get("Modelagem")!.id, predecessoraId: por.get("Levantamento")!.id } });
    check("o vínculo Modelagem depois de Levantamento volta, com o atraso de 1 dia", !!dep && Number(dep.lagDias) === 1 && dep.tipo === "fs", dep);
    check("a marca de terceiro (Externo) volta", por.get("Aprovação da prefeitura")?.atribuicoes.some((a) => a.papel === "ext") === true);
    check("pessoa e % da origem não foram para o modelo", linhas.every((l) => l.progresso === 0) && !linhas.some((l) => l.atribuicoes.some((a) => a.userId === admin.id)));
    check("a disciplina volta ligada à do projeto de destino", !!por.get("Levantamento")?.disciplinaId);

    check("projeto sem EAP: recusa com a frase", (await erroDe(() => salvarEapDoProjetoComoModelo({ projetoId: vazio.id, nome: `${tag}-vazio`, descricao: null, tipoEmpreendimentoId: null, autorId: admin.id }))) === "Este projeto ainda não tem EAP para salvar.");
    check("projeto que não existe: recusa", !!(await erroDe(() => salvarEapDoProjetoComoModelo({ projetoId: "fantasma", nome: `${tag}-x`, descricao: null, tipoEmpreendimentoId: null, autorId: admin.id }))));
  } finally {
    if (modeloId) await prisma.modeloEap.deleteMany({ where: { id: modeloId } });
    await prisma.modeloEap.deleteMany({ where: { nome: { startsWith: tag } } });
    for (const p of [origem, destino, vazio]) {
      await prisma.eapTarefa.deleteMany({ where: { projetoId: p.id } });
      await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: p.id } } });
      await prisma.disciplina.deleteMany({ where: { projetoId: p.id } });
      await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: p.id } });
      await prisma.projeto.delete({ where: { id: p.id } });
    }
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
