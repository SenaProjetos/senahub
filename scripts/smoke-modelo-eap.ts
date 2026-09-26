/**
 * Smoke dos modelos de EAP (decisão #5) contra o banco de dev: importar um XML do MS Project, gravar o
 * modelo, aplicar num projeto e conferir o que foi criado. O vitest cobre as regras puras (`mspdi`,
 * `mapeamento`, `aplicar`); aqui vai o I/O — id corporativo, poda pela disciplina do projeto, recurso
 * "Externo", cronograma em rascunho, herança de responsáveis e as recusas.
 *
 * O XML é montado AQUI, com os nomes das disciplinas lidos do catálogo do banco: o arquivo real da
 * casa está fora do git (e quem o exercita é `npm run verify:modelo-mspdi`).
 *
 * Uso: npm run smoke:modelo-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { previaDoArquivo, previaDaAplicacao, salvarModeloDeEap, aplicarModeloNoProjeto } from "../src/modules/planejamento/modelos/service";
import { planoDoProjeto } from "../src/modules/planejamento/agenda";
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

const tag = `smoke-modelo-${Date.now()}`;

/** XML no formato do MS Project: fase > 2 disciplinas > atividades, com marco e vínculo. */
function montarXml(fase: string, discA: string, discB: string) {
  const tarefa = (uid: number, nivel: number, nome: string, o: { horas?: number; resumo?: boolean; marco?: boolean; pred?: number } = {}) => `
    <Task>
      <UID>${uid}</UID><ID>${uid}</ID>
      <Name>${nome}</Name>
      <WBS>1.${uid}</WBS>
      <OutlineLevel>${nivel}</OutlineLevel>
      <Duration>PT${o.horas ?? 0}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>${o.resumo ? 1 : 0}</Summary>
      <Milestone>${o.marco ? 1 : 0}</Milestone>
      ${o.pred ? `<PredecessorLink><PredecessorUID>${o.pred}</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>7</LagFormat></PredecessorLink>` : ""}
    </Task>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>${tag}</Title>
  <MinutesPerDay>480</MinutesPerDay>
  <Tasks>
    <Task><UID>0</UID><Name>${tag}-EDIFICIO</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    ${tarefa(1, 1, `${tag}-EMPREENDIMENTO`, { resumo: true })}
    ${tarefa(2, 2, fase, { resumo: true })}
    ${tarefa(3, 3, discA, { resumo: true })}
    ${tarefa(4, 4, "Modelagem", { horas: 40 })}
    ${tarefa(5, 4, "Receber projeto arquitetônico", { horas: 16 })}
    ${tarefa(6, 4, `${discA} liberado`, { marco: true, pred: 4 })}
    ${tarefa(7, 3, discB, { resumo: true })}
    ${tarefa(8, 4, "Dimensionamento", { horas: 24, pred: 4 })}
  </Tasks>
</Project>`;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  const catalogo = await prisma.disciplinaCatalogo.findMany({ where: { ativo: true }, select: { id: true, nome: true }, take: 2, orderBy: { nome: "asc" } });
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true }, select: { id: true, nome: true } });
  if (!admin || catalogo.length < 2 || !fase) {
    console.log("Banco de dev sem admin, sem 2 disciplinas no catálogo ou sem fase — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const [discA, discB] = catalogo;

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-projeto`,
      clienteId: cliente.id,
    },
  });
  let modeloId: string | null = null;

  try {
    // ── 1. Prévia do arquivo ───────────────────────────────────────────────
    const previa = await previaDoArquivo(montarXml(fase.nome, discA.nome, discB.nome));
    check("o resumo do projeto e a linha do empreendimento não viram tarefa", previa.estrutura.linhas.length === 7, {
      linhas: previa.estrutura.linhas.length,
    });
    check("a fase do arquivo casou com o catálogo", previa.conferencia.fases.some((f) => f.catalogoId === fase.id), previa.conferencia.fases);
    check(
      "as duas disciplinas casaram com o catálogo",
      [discA.id, discB.id].every((id) => previa.conferencia.disciplinas.some((d) => d.catalogoId === id)),
      previa.conferencia.disciplinas.map((d) => [d.origem, d.catalogoNome]),
    );
    check("a etapa de terceiro foi sugerida pelo nome", previa.conferencia.terceiros.some((t) => /Receber projeto/.test(t.nome)), previa.conferencia.terceiros);
    const marco = previa.estrutura.linhas.find((l) => l.tipoEap === "mrc");
    check("o marco carrega disciplina E fase (sem os dois não fecha a fase)", !!marco?.disciplinaCatalogoId && !!marco?.etapaId, marco);
    check("o atraso de 4800 décimos virou 1 dia útil", previa.estrutura.linhas.some((l) => l.predecessoras.some((v) => v.lagDias === 1)));

    // ── 2. Gravar o modelo ─────────────────────────────────────────────────
    check("a prévia lista a fase do modelo para pedir o percentual (D38)", previa.fasesDoModelo.some((f) => f.etapaId === fase.id), previa.fasesDoModelo);
    const salvo = await salvarModeloDeEap({
      nome: `${tag}-modelo`,
      estrutura: previa.estrutura,
      arquivoNome: "teste.xml",
      autorId: admin.id,
      // D38: o arquivo tem uma fase só, então ela leva 100% do valor da disciplina.
      respostas: { percentuaisPorFase: { [fase.id]: 100 } },
    });

    const somaErrada = await erroDe(() =>
      salvarModeloDeEap({
        nome: `${tag}-modelo-ruim`,
        estrutura: previa.estrutura,
        autorId: admin.id,
        respostas: { percentuaisPorFase: { [fase.id]: 40 } },
      }),
    );
    check("percentual que não fecha 100 é recusado ao gravar", !!somaErrada && /100%/.test(somaErrada), somaErrada);
    modeloId = salvo.id;
    check("modelo gravado com a contagem de linhas e marcos", salvo.totalLinhas === 7 && salvo.totalMarcos === 1, salvo);

    // ── 3. Recusas antes de ter disciplina no projeto ──────────────────────
    const semDisciplina = await previaDaAplicacao({ projetoId: projeto.id, modeloId: salvo.id });
    check("projeto sem disciplina é impedido, com a razão", /disciplina/i.test(semDisciplina.impedimento ?? ""), semDisciplina.impedimento);
    const recusa = await erroDe(() => aplicarModeloNoProjeto({ projetoId: projeto.id, modeloId: salvo.id }));
    check("e aplicar é recusado com a MESMA frase", recusa === semDisciplina.impedimento, { recusa });

    // ── 4. Só a disciplina A no projeto: o galho da B é podado ─────────────
    // Projeto NOVO de verdade: disciplina sem fase nenhuma cadastrada. É o caso que descartaria a fase de
    // toda linha antes do D38 — quem cadastra a fase agora é a aplicação do modelo.
    const discNoProjeto = await prisma.disciplina.create({
      data: { projetoId: projeto.id, disciplinaTextoLegado: discA.nome, disciplinaId: discA.id, ordem: 0 },
      select: { id: true },
    });
    const previa2 = await previaDaAplicacao({ projetoId: projeto.id, modeloId: salvo.id });
    check("a prévia diz quantas linhas cria e o que poda", previa2.criar === 5 && previa2.podadas.length === 1, {
      criar: previa2.criar,
      podadas: previa2.podadas,
    });
    check("sem impedimento agora", previa2.impedimento === null, previa2.impedimento);
    check(
      "a prévia avisa que vai cadastrar a fase da disciplina, com o percentual",
      previa2.fasesACriar.length === 1 && previa2.fasesACriar[0].percentual === 100,
      previa2.fasesACriar,
    );
    check("e nenhuma disciplina fica sem fase", previa2.disciplinasSemFase.length === 0, previa2.disciplinasSemFase);

    const r = await aplicarModeloNoProjeto({ projetoId: projeto.id, modeloId: salvo.id });
    check("aplicou criando as linhas que sobraram", r.criadas === 5, r);
    check("com o vínculo e a etapa de terceiro", r.vinculos === 1 && r.terceiros === 1, r);
    check("cadastrou a fase da disciplina (D38)", r.fasesCadastradas === 1 && r.disciplinasSemFase === 0, r);

    const etapaCriada = await prisma.disciplinaEtapa.findFirst({
      where: { disciplinaId: discNoProjeto.id },
      select: { etapaId: true, percentual: true, ordem: true },
    });
    check(
      "a fase cadastrada é a do modelo, com 100% e ordem 0",
      etapaCriada?.etapaId === fase.id && Number(etapaCriada?.percentual) === 100 && etapaCriada?.ordem === 0,
      etapaCriada,
    );

    const linhas = await prisma.eapTarefa.findMany({
      where: { projetoId: projeto.id },
      select: {
        id: true,
        parentId: true,
        ordem: true,
        nome: true,
        tipoEap: true,
        duracaoDias: true,
        idCorporativo: true,
        disciplinaId: true,
        etapaId: true,
        atribuicoes: { select: { papel: true, userId: true } },
      },
      orderBy: { ordem: "asc" },
    });
    check("toda linha tem ID corporativo (o verify do motor acusaria)", linhas.every((l) => !!l.idCorporativo), linhas.filter((l) => !l.idCorporativo).map((l) => l.nome));
    check("a disciplina podada não deixou linha", !linhas.some((l) => l.nome === discB.nome || l.nome === "Dimensionamento"), linhas.map((l) => l.nome));

    const codigos = new Map(
      calcularCodigos(linhas.map((l) => ({ id: l.id, parentId: l.parentId, ordem: l.ordem }))).map((c) => [c.id, c.codigo]),
    );
    const porNome = new Map(linhas.map((l) => [l.nome, l]));
    check("os códigos da EAP saíram em árvore (1, 1.1, 1.1.1…)", codigos.get(porNome.get("Modelagem")!.id) === "1.1.1", {
      fase: codigos.get(porNome.get(fase.nome)!.id),
      disc: codigos.get(porNome.get(discA.nome)!.id),
      atv: codigos.get(porNome.get("Modelagem")!.id),
    });
    check("a duração veio em dias úteis (40 h = 5 dias)", Number(porNome.get("Modelagem")!.duracaoDias) === 5, porNome.get("Modelagem")!.duracaoDias);
    check(
      "a folha herdou disciplina e fase do agrupamento",
      porNome.get("Modelagem")!.disciplinaId === discNoProjeto.id && porNome.get("Modelagem")!.etapaId === fase.id,
      { disciplinaId: porNome.get("Modelagem")!.disciplinaId, etapaId: porNome.get("Modelagem")!.etapaId },
    );

    const terceiro = porNome.get("Receber projeto arquitetônico")!;
    check("a linha de terceiro nasceu com o recurso Externo", terceiro.atribuicoes.some((a) => a.papel === "ext" && a.userId == null), terceiro.atribuicoes);
    check("e NÃO herdou responsável da disciplina (já tinha atribuição)", !terceiro.atribuicoes.some((a) => a.userId != null), terceiro.atribuicoes);

    const cron = await prisma.cronogramaProjeto.findUnique({ where: { projetoId: projeto.id }, select: { aprovado: true } });
    check("o cronograma nasceu em RASCUNHO", cron?.aprovado === false, cron);

    const plano = await planoDoProjeto(projeto.id);
    const datas = plano?.resultado.linhas.get(porNome.get(porNome.has("Modelagem") ? "Modelagem" : "")!.id);
    check("o motor agendou as linhas aplicadas", !!datas?.inicio && !!datas?.fim, datas);

    // ── 5. Aplicar de novo é recusado (EAP já existe) ──────────────────────
    const deNovo = await erroDe(() => aplicarModeloNoProjeto({ projetoId: projeto.id, modeloId: salvo.id }));
    check("aplicar num projeto que já tem EAP é recusado", !!deNovo && /já tem linhas/.test(deNovo), deNovo);
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    await prisma.tarefa.deleteMany({ where: { eapTarefaId: { in: linhas.map((l) => l.id) } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    if (modeloId) await prisma.modeloEap.delete({ where: { id: modeloId } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
