/**
 * Smoke dos modelos de EAP por DISCIPLINA (pedido do dono, 2026-09-27) contra o banco de dev: criar modelos de
 * disciplina a partir de um modelo de projeto e aplicar pelo "Gerar EAP das disciplinas". O vitest cobre a
 * extração pura (`por-disciplina`); aqui vai o I/O — nome e disciplina do modelo criado, não duplicar, recusa
 * no "Usar modelo de EAP", opções por disciplina, árvore criada no projeto, fases cadastradas, vínculos, ID
 * corporativo, a fase seguinte depois da anterior no motor, linha única sem modelo e a recusa de gerar de novo.
 *
 * Uso: npm run smoke:modelo-disciplina
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { salvarModeloDeEap, aplicarModeloNoProjeto, MOTIVO_MODELO_DE_DISCIPLINA } from "../src/modules/planejamento/modelos/service";
import {
  criarModelosDeDisciplina,
  gerarEapDasDisciplinasNoProjeto,
  opcoesParaGerarDisciplinas,
} from "../src/modules/planejamento/modelos/disciplina-service";
import type { EstruturaModelo, LinhaModelo } from "../src/modules/planejamento/modelos/estrutura";
import { reagendarProjeto, planoDoProjeto } from "../src/modules/planejamento/agenda";
import { calcularCodigos } from "../src/modules/planejamento/codigo-eap";

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

const tag = `smoke-mdisc-${Date.now()}`;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  const catalogo = await prisma.disciplinaCatalogo.findMany({ where: { ativo: true }, select: { id: true, nome: true }, take: 2, orderBy: { nome: "asc" } });
  const fases = await prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    select: { id: true, nome: true },
    orderBy: { ordem: "asc" },
    take: 2,
  });
  if (!admin || catalogo.length < 2 || fases.length < 2) {
    console.log("Banco de dev sem admin, sem 2 disciplinas no catálogo ou sem 2 fases — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const [A, B] = catalogo;
  const [fb, fx] = fases;

  // Modelo de projeto: FASE 1 > A (a1, a2, a-lib) e B (b1 ← a-lib) ; validação (terceiro) ; FASE 2 > A (a3 ← validação, a-lib2)
  const l = (id: string, parentId: string | null, ordem: number, extra: Partial<LinhaModelo> = {}): LinhaModelo => ({
    id, parentId, ordem, nome: id, tipoEap: "atv", duracaoDias: 3, disciplinaCatalogoId: null, etapaId: null, deTerceiro: false, predecessoras: [], ...extra,
  });
  const fs = (id: string) => ({ id, tipo: "fs" as const, lagDias: 0 });
  const estrutura: EstruturaModelo = {
    versao: 1,
    jornadaMinutos: 480,
    linhas: [
      l("F1", null, 0, { tipoEap: "fas", duracaoDias: 0, etapaId: fb.id, nome: fb.nome }),
      l("A1", "F1", 1, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: A.id, etapaId: fb.id, nome: A.nome }),
      l("a1", "A1", 2, { disciplinaCatalogoId: A.id, etapaId: fb.id }),
      l("a2", "A1", 3, { disciplinaCatalogoId: A.id, etapaId: fb.id, predecessoras: [fs("a1")] }),
      l("a-lib", "A1", 4, { tipoEap: "mrc", duracaoDias: 0, disciplinaCatalogoId: A.id, etapaId: fb.id, predecessoras: [fs("a2")] }),
      l("B1", "F1", 5, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: B.id, etapaId: fb.id, nome: B.nome }),
      l("b1", "B1", 6, { disciplinaCatalogoId: B.id, etapaId: fb.id, predecessoras: [fs("a-lib")] }),
      l("val", null, 7, { deTerceiro: true, predecessoras: [fs("a-lib"), fs("b1")] }),
      l("F2", null, 8, { tipoEap: "fas", duracaoDias: 0, etapaId: fx.id, nome: fx.nome }),
      l("A2", "F2", 9, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: A.id, etapaId: fx.id, nome: A.nome }),
      l("a3", "A2", 10, { disciplinaCatalogoId: A.id, etapaId: fx.id, predecessoras: [fs("val")] }),
      l("a-lib2", "A2", 11, { tipoEap: "mrc", duracaoDias: 0, disciplinaCatalogoId: A.id, etapaId: fx.id, predecessoras: [fs("a3")] }),
    ],
    mapaDisciplina: {},
    mapaFase: {},
    percentuaisPorFase: { [fb.id]: 60, [fx.id]: 40 },
    avisos: [],
  };

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });
  const modelosCriados: string[] = [];

  try {
    const origem = await salvarModeloDeEap({ nome: `${tag}-EDIFICIO`, estrutura, autorId: admin.id });
    modelosCriados.push(origem.id);

    // ── 1. Criar os modelos de disciplina ────────────────────────────────────
    const r1 = await criarModelosDeDisciplina({ modeloId: origem.id, autorId: admin.id });
    modelosCriados.push(...r1.criados.map((c) => c.id));
    check("um modelo de disciplina por disciplina do catálogo", r1.criados.length === 2 && r1.jaExistiam.length === 0, r1);
    const mA = await prisma.modeloEap.findUniqueOrThrow({ where: { id: r1.criados.find((c) => c.disciplina === A.nome)!.id } });
    check("nome e disciplina do modelo", mA.nome === `${A.nome} (de ${tag}-EDIFICIO)` && mA.disciplinaCatalogoId === A.id, mA.nome);
    const r2 = await criarModelosDeDisciplina({ modeloId: origem.id, autorId: admin.id });
    check("rodar de novo não duplica", r2.criados.length === 0 && r2.jaExistiam.length === 2, r2);
    const deDisciplina = await erroDe(() => aplicarModeloNoProjeto({ projetoId: projeto.id, modeloId: mA.id }));
    check("modelo de disciplina não entra como EAP do projeto inteiro", deDisciplina === MOTIVO_MODELO_DE_DISCIPLINA, deDisciplina);

    // ── 2. Opções do "Gerar EAP das disciplinas" ─────────────────────────────
    const dA = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: `${A.nome} do projeto`, disciplinaId: A.id } });
    const dB = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: `${B.nome} do projeto`, disciplinaId: B.id } });
    const dC = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Paisagismo (fora do catálogo)" } });
    const opcoes = await opcoesParaGerarDisciplinas(projeto.id);
    const opA = opcoes.find((o) => o.disciplinaId === dA.id);
    check("três disciplinas sem tarefa", opcoes.length === 3, opcoes.map((o) => o.nome));
    check("a disciplina A tem o modelo dela pré-escolhido", opA?.padraoId === mA.id && opA.modelos.some((m) => m.id === mA.id), opA);
    check("fora do catálogo: sem modelo", opcoes.find((o) => o.disciplinaId === dC.id)?.modelos.length === 0);

    // ── 3. Gerar: A pelo modelo, B e C linha única ──────────────────────────
    const g = await gerarEapDasDisciplinasNoProjeto({
      projetoId: projeto.id,
      escolhas: [
        { disciplinaId: dA.id, modeloId: mA.id },
        { disciplinaId: dB.id, modeloId: null },
        { disciplinaId: dC.id, modeloId: null },
      ],
    });
    check("contagem devolvida", g.disciplinas === 3 && g.comModelo === 1 && g.criadas === mA.totalLinhas + 2, g);
    await reagendarProjeto(projeto.id, admin.id);

    const linhas = await prisma.eapTarefa.findMany({
      where: { projetoId: projeto.id },
      select: { id: true, nome: true, parentId: true, ordem: true, tipoEap: true, disciplinaId: true, etapaId: true, idCorporativo: true },
    });
    const codigo = new Map(calcularCodigos(linhas).map((c) => [c.id, c.codigo]));
    const raizA = linhas.find((x) => x.parentId === null && x.disciplinaId === dA.id)!;
    const daA = linhas.filter((x) => x.disciplinaId === dA.id);
    check("a linha da disciplina leva o nome da disciplina do projeto", raizA?.nome === dA.disciplinaTextoLegado && raizA.tipoEap === "disc", raizA);
    check("disciplina › fase › tarefas", daA.filter((x) => x.parentId === raizA.id).every((x) => x.tipoEap === "fas") && daA.filter((x) => x.parentId === raizA.id).length === 2);
    check("todas as linhas da A são da disciplina A e têm ID corporativo", daA.length === mA.totalLinhas && daA.every((x) => !!x.idCorporativo));
    check(
      "B e C: uma linha só cada",
      linhas.filter((x) => x.disciplinaId === dB.id).length === 1 && linhas.filter((x) => x.disciplinaId === dC.id).length === 1,
    );
    check("a disciplina A entra primeiro (ordem da escolha) e as outras depois", codigo.get(raizA.id) === "1", [...codigo.values()].sort());
    const etapas = await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: dA.id }, select: { etapaId: true, percentual: true } });
    check(
      "fases da disciplina cadastradas com o percentual do modelo",
      etapas.length === 2 && etapas.some((e) => e.etapaId === fb.id && Number(e.percentual) === 60),
      etapas,
    );
    check("as linhas da A carregam a fase", daA.filter((x) => x.tipoEap !== "disc").every((x) => x.etapaId != null));
    const deps = await prisma.eapDependencia.count({ where: { tarefa: { projetoId: projeto.id } } });
    check("vínculos: 2 de dentro da fase 1 + 1 da fase 2 + 1 entre as fases", deps === 4, deps);

    const plano = await planoDoProjeto(projeto.id);
    const porNome = new Map(linhas.map((x) => [x.nome, x.id]));
    const fimFase1 = plano!.resultado.linhas.get(porNome.get("a-lib")!)!.fim;
    const inicioFase2 = plano!.resultado.linhas.get(porNome.get("a3")!)!.inicio;
    check("no motor, a fase 2 começa depois do fim da fase 1", inicioFase2 > fimFase1, { fimFase1, inicioFase2 });

    const deNovo = await erroDe(() => gerarEapDasDisciplinasNoProjeto({ projetoId: projeto.id }));
    check("gerar de novo é recusado", !!deNovo && /já têm tarefa/.test(deNovo), deNovo);
  } finally {
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.modeloEap.deleteMany({ where: { id: { in: modelosCriados } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
