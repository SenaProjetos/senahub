/**
 * Smoke do "Completar a equipe na linha de base" (decisão do dono em 26/11/2026) contra o banco de dev. Monta um projeto,
 * aprova, inclui gente depois e confere. Apaga tudo no fim.
 *
 *   1. Aprovar com só a Ana escalada: BL-00 congela 40 h / R$ 4.000 em cada atividade.
 *   2. A Bia entra nas duas atividades; a B já começou. A prévia muda só a A (40 → 60 h, R$ 4.000 → 5.000) e conta a B como
 *      "já começada" que fica como está.
 *   3. Gravar: A e o agrupamento mudam horas e custo; B não; NENHUMA linha da base muda início, término, duração ou % planejado.
 *      AuditLog com o motivo e o antes/depois.
 *   4. De novo, sem mudança: recusa ("Nada a completar").
 *   5. Dois cliques ao mesmo tempo: um grava, o outro recusa — a base não fica com a soma em dobro. Só reajustar o
 *      custo/hora (mesmas horas) não reabre o orçamento.
 *   6. Revisão aberta e cronograma em rascunho recusam com a frase da regra.
 *
 * Uso: npm run smoke:completar-equipe-base
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaLocal } from "../src/modules/ponto/engine";
import { aprovarCronograma } from "../src/modules/planejamento/service";
import { completarEquipeNaBase, previaEquipeNaBase } from "../src/modules/planejamento/orcamento-base-service";
import {
  MOTIVO_BASE_EM_REVISAO,
  MOTIVO_BASE_SEM_APROVACAO,
  MOTIVO_BASE_SEM_MUDANCA,
} from "../src/modules/planejamento/orcamento-base";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-equipe-base-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function linhasDaBase(projetoId: string) {
  const b = await prisma.eapBaseline.findFirst({ where: { projetoId }, orderBy: { numero: "desc" }, select: { id: true } });
  const ls = await prisma.eapBaselineLinha.findMany({ where: { baselineId: b!.id }, orderBy: { id: "asc" } });
  return new Map(
    ls.map((l) => [
      l.tarefaId!,
      {
        inicio: l.inicio.toISOString(),
        fim: l.fim.toISOString(),
        duracao: Number(l.duracaoDias),
        avanco: l.avancoPlanejado,
        horas: l.trabalhoHoras == null ? null : Number(l.trabalhoHoras),
        custo: l.custoPrevisto == null ? null : Number(l.custoPrevisto),
      },
    ]),
  );
}

async function main() {
  const hoje = diaLocal(new Date());
  const usuario = (sufixo: string) =>
    prisma.user.create({ data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", contratacao: "pj", emailVerified: false } });
  const ana = await usuario("ana");
  const bia = await usuario("bia");
  const caio = await usuario("caio");
  const autor = await usuario("autor");
  const pessoas = [ana.id, bia.id, caio.id, autor.id];
  await prisma.recurso.createMany({
    data: [
      { userId: ana.id, capacidade: 1, custoHora: 100 },
      { userId: bia.id, capacidade: 1, custoHora: 50 },
      { userId: caio.id, capacidade: 1, custoHora: 10 },
    ],
  });
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projetos: string[] = [];
  let n = 0;
  const novoProjeto = async (sufixo: string) => {
    n++;
    const p = await prisma.projeto.create({
      data: {
        codigo: `${Date.now() + n}`.slice(-6),
        ano: 2026,
        sequencial: Number(`${Date.now() + n}`.slice(-5)),
        nome: `${tag}-${sufixo}`,
        clienteId: cliente.id,
      },
    });
    projetos.push(p.id);
    return p;
  };

  try {
    const P = await novoProjeto("P");
    await prisma.cronogramaProjeto.create({ data: { projetoId: P.id, inicioProjeto: d(hoje), aprovado: false } });
    const tarefa = (nome: string, parentId: string | null, tipoEap: "res" | "atv", duracaoDias: number) =>
      prisma.eapTarefa.create({
        data: { projetoId: P.id, nome, parentId, tipoEap, duracaoDias, ordem: n++, inicioPrevisto: d(hoje), fimPrevisto: d(hoje) },
      });
    const G = await tarefa("Projeto executivo", null, "res", 0);
    const A = await tarefa("Modelagem", G.id, "atv", 5);
    const B = await tarefa("Detalhamento", G.id, "atv", 5);
    const atribuir = (tarefaId: string, userId: string, horas: number, principal = false) =>
      prisma.eapAtribuicao.create({ data: { tarefaId, userId, papel: "pro", horasPrevistas: horas, principal } });
    await atribuir(A.id, ana.id, 40, true);
    await atribuir(B.id, ana.id, 40, true);

    // ── 1. Aprovar com só a Ana ─────────────────────────────────────────────
    await aprovarCronograma(P.id, autor.id);
    const bl0 = await linhasDaBase(P.id);
    check("BL-00 congela 40 h / R$ 4.000 na Modelagem", bl0.get(A.id)?.horas === 40 && bl0.get(A.id)?.custo === 4000, bl0.get(A.id));
    check("e 80 h / R$ 8.000 no agrupamento", bl0.get(G.id)?.horas === 80 && bl0.get(G.id)?.custo === 8000, bl0.get(G.id));

    // ── 2. A Bia entra; a B já começou ──────────────────────────────────────
    await atribuir(A.id, bia.id, 20);
    await atribuir(B.id, bia.id, 20);
    await prisma.eapTarefa.update({ where: { id: B.id }, data: { inicioReal: d(hoje), status: "and" } });
    const previa = await previaEquipeNaBase(P.id, { verCusto: true });
    check(
      "prévia: só a Modelagem muda, 40 → 60 h e R$ 4.000 → 5.000",
      previa.atividadesAtualizadas === 1 &&
        previa.linhas.length === 1 &&
        previa.linhas[0].tarefaId === A.id &&
        previa.horasAntes === 40 &&
        previa.horasDepois === 60 &&
        previa.custoAntes === 4000 &&
        previa.custoDepois === 5000,
      previa,
    );
    check("prévia: o Detalhamento (já começou) conta como 'já começada' e fica", previa.iniciadasDiferentes === 1, previa.iniciadasDiferentes);
    const semCusto = await previaEquipeNaBase(P.id, { verCusto: false });
    check("prévia sem financeiro: nenhum R$ sai do servidor", semCusto.custoDepois == null && semCusto.linhas.every((l) => l.custoAntes == null && l.custoDepois == null), semCusto);

    // ── 3. Gravar ───────────────────────────────────────────────────────────
    const r = await completarEquipeNaBase(P.id, autor.id, "Bia entrou na Modelagem e no Detalhamento");
    check("gravou 1 atividade + o agrupamento", r.atividades === 1 && r.linhas === 2 && r.baselineNumero === 0, r);
    const bl1 = await linhasDaBase(P.id);
    check("Modelagem: 60 h / R$ 5.000 na base", bl1.get(A.id)?.horas === 60 && bl1.get(A.id)?.custo === 5000, bl1.get(A.id));
    check("agrupamento: 100 h / R$ 9.000 (soma)", bl1.get(G.id)?.horas === 100 && bl1.get(G.id)?.custo === 9000, bl1.get(G.id));
    check("Detalhamento (já começado): segue 40 h / R$ 4.000", bl1.get(B.id)?.horas === 40 && bl1.get(B.id)?.custo === 4000, bl1.get(B.id));
    const datasIguais = [...bl0].every(([id, a]) => {
      const b = bl1.get(id);
      return b && a.inicio === b.inicio && a.fim === b.fim && a.duracao === b.duracao && a.avanco === b.avanco;
    });
    check("nenhuma linha da base mudou início, término, duração ou % planejado", datasIguais);
    check("continua uma linha de base só (não criou BL-01)", (await prisma.eapBaseline.count({ where: { projetoId: P.id } })) === 1);
    const log = await prisma.auditLog.findFirst({
      where: { acao: "completar-equipe-na-base", userId: autor.id },
      orderBy: { createdAt: "desc" },
      select: { detalhe: true },
    });
    type Par = { horas: number | null; custo: number | null };
    const det = log?.detalhe as { motivo?: string; linhas?: { tarefaId: string; antes: Par; depois: Par }[] } | undefined;
    const doA = det?.linhas?.find((l) => l.tarefaId === A.id);
    check(
      "AuditLog com o motivo e o antes/depois da Modelagem",
      det?.motivo === "Bia entrou na Modelagem e no Detalhamento" &&
        doA?.antes.horas === 40 &&
        doA?.antes.custo === 4000 &&
        doA?.depois.horas === 60 &&
        doA?.depois.custo === 5000,
      det,
    );

    // ── 4. Sem mudança ──────────────────────────────────────────────────────
    check("de novo, sem mudança: recusa", (await erroDe(completarEquipeNaBase(P.id, autor.id, "de novo"))) === MOTIVO_BASE_SEM_MUDANCA);

    // ── 5. Dois cliques ao mesmo tempo ──────────────────────────────────────
    await atribuir(A.id, caio.id, 10);
    const corrida = await Promise.allSettled([
      completarEquipeNaBase(P.id, autor.id, "Caio entrou (1)"),
      completarEquipeNaBase(P.id, autor.id, "Caio entrou (2)"),
    ]);
    const okCorrida = corrida.filter((x) => x.status === "fulfilled").length;
    check("dois ao mesmo tempo: um grava, o outro recusa", okCorrida === 1, corrida.map((x) => (x.status === "rejected" ? String(x.reason) : "ok")));
    const bl2 = await linhasDaBase(P.id);
    check("Modelagem 70 h / R$ 5.100 (Caio somado uma vez só)", bl2.get(A.id)?.horas === 70 && bl2.get(A.id)?.custo === 5100, bl2.get(A.id));

    // ── 5b. Só a taxa mudou: não reabre o orçamento ─────────────────────────
    await prisma.recurso.update({ where: { userId: ana.id }, data: { custoHora: 120 } });
    check("reajuste do custo/hora sem mudar horas: nada a completar", (await erroDe(completarEquipeNaBase(P.id, autor.id, "reajuste"))) === MOTIVO_BASE_SEM_MUDANCA);

    // ── 6. Revisão aberta e rascunho ────────────────────────────────────────
    await prisma.cronogramaProjeto.update({ where: { projetoId: P.id }, data: { emRevisao: true } });
    check("revisão aberta: recusa", (await erroDe(previaEquipeNaBase(P.id, { verCusto: true }))) === MOTIVO_BASE_EM_REVISAO);
    const R = await novoProjeto("R");
    await prisma.cronogramaProjeto.create({ data: { projetoId: R.id, inicioProjeto: d(hoje), aprovado: false } });
    check("rascunho: recusa", (await erroDe(completarEquipeNaBase(R.id, autor.id, "rascunho"))) === MOTIVO_BASE_SEM_APROVACAO);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.notificacao.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.tarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: { in: projetos } } } });
    await prisma.eapBaseline.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.valorAgregadoApuracao.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
    await prisma.cliente.deleteMany({ where: { id: cliente.id } });
    await prisma.recurso.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.user.deleteMany({ where: { id: { in: pessoas } } });
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
