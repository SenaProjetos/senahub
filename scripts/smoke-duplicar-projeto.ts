/**
 * Smoke da duplicação de projeto com a EAP (B3) contra o banco de dev. Exercita o I/O que o vitest de
 * `duplicar-eap.ts` não alcança:
 *
 *   1. A EAP copiada leva a estrutura (árvore, tipo, duração, prioridade, fase e classificador
 *      global, tipo e defasagem da dependência) e NÃO leva avanço, situação, datas reais, bloqueio,
 *      restrição nem classificador do projeto de origem.
 *   2. Cada linha nova ganha um ID corporativo próprio, único, e o contador anda.
 *   3. O cronograma do clone nasce em rascunho, com o início pedido; o motor calcula as datas a
 *      partir dele e o código da EAP (1.1, 1.2…) é preenchido.
 *   4. Sem `copiarEap`, não nasce EAP nem cronograma. Duplicar de novo não repete ID.
 *   5. A disciplina do clone leva o vínculo com o catálogo e a estrutura das etapas por fase (fase, %,
 *      ordem — sem prazo, situação nem pagamento); a linha só leva a fase que a disciplina do clone tem.
 *
 * Uso: npm run smoke:duplicar-projeto
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { paraDia } from "../src/modules/planejamento/agenda";
import { duplicarProjetoNoBanco } from "../src/modules/projetos/duplicar-service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-dup-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const OPCOES = { copiarResponsaveis: true, copiarMembros: true, copiarComposicao: false } as const;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const fases = await prisma.pranchaCatalogo.findMany({ where: { categoria: "fase", projetoId: null }, orderBy: { sigla: "asc" }, take: 3 });
  const origemCli = await prisma.eapCatalogo.findFirst({ where: { categoria: "origem", projetoId: null } });
  const catalogo = await prisma.disciplinaCatalogo.findFirst();
  if (fases.length < 2 || !origemCli || !catalogo) throw new Error("Catálogos globais de fase/origem/disciplina ausentes — rode npm run db:seed.");
  const fase = fases[0];

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-origem`,
      clienteId: cliente.id,
    },
  });
  const clones: string[] = [];
  let locProjeto: { id: string } | null = null;

  try {
    const disciplina = await prisma.disciplina.create({
      data: { projetoId: projeto.id, disciplinaId: catalogo.id, disciplinaTextoLegado: "Elétrica", ordem: 0, prazo: d("2026-12-18") },
    });
    await prisma.disciplinaEtapa.createMany({
      data: [
        { disciplinaId: disciplina.id, etapaId: fases[0].id, percentual: 60, ordem: 0, prazo: d("2026-11-20"), status: "entregue" },
        { disciplinaId: disciplina.id, etapaId: fases[1].id, percentual: 40, ordem: 1 },
      ],
    });
    locProjeto = await prisma.eapCatalogo.create({
      data: { categoria: "localizacao", sigla: `L${Date.now()}`.slice(0, 8), nome: `${tag}-loc`, projetoId: projeto.id },
    });

    const base = { projetoId: projeto.id, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-09") };
    const [idR, idA, idM] = await reservarIdsParaLinhas(prisma, ["disc", "atv", "mrc"]);
    const R = await prisma.eapTarefa.create({
      data: { ...base, idCorporativo: idR, disciplinaId: disciplina.id, nome: "Elétrica", tipoEap: "disc", ordem: 0, duracaoDias: 1 },
    });
    const A = await prisma.eapTarefa.create({
      data: {
        ...base, idCorporativo: idA, parentId: R.id, disciplinaId: disciplina.id, nome: "Modelagem", tipoEap: "atv", duracaoDias: 4, ordem: 1,
        prioridade: "alt", etapaId: fase.id, origemId: origemCli.id, localizacaoId: locProjeto.id,
        progresso: 60, status: "and", inicioReal: d("2026-10-05"),
        restricaoTipo: "iniciar_nao_antes_de", restricaoData: d("2026-10-05"),
      },
    });
    const M = await prisma.eapTarefa.create({
      data: {
        ...base, idCorporativo: idM, parentId: R.id, disciplinaId: disciplina.id, nome: "Entrega do executivo", tipoEap: "mrc", duracaoDias: 0, ordem: 2,
        status: "blq", motivoBloqueio: "aguardando o cliente",
        // Fase que a disciplina NÃO tem como etapa: no clone ela ficaria invisível — não é copiada.
        ...(fases[2] ? { etapaId: fases[2].id } : {}),
      },
    });
    await prisma.eapDependencia.create({ data: { tarefaId: M.id, predecessoraId: A.id, tipo: "ff", lagDias: 2 } });

    // ── 1–3. Duplica com EAP e início pedido ─────────────────────────────
    const dup = await duplicarProjetoNoBanco({ id: projeto.id, ...OPCOES, copiarEap: true, inicioCronograma: "2026-11-09" }, admin.id);
    clones.push(dup.id);
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: dup.id }, orderBy: { ordem: "asc" } });
    const [cR, cA, cM] = linhas;
    check("3 linhas copiadas, na mesma ordem", linhas.length === 3 && cR?.nome === "Elétrica" && cA?.nome === "Modelagem" && cM?.nome === "Entrega do executivo", linhas.map((l) => l.nome));
    check("tipo preservado (disc / atv / mrc)", cR?.tipoEap === "disc" && cA?.tipoEap === "atv" && cM?.tipoEap === "mrc", linhas.map((l) => l.tipoEap));
    check("duração preservada (marco = 0)", Number(cA?.duracaoDias) === 4 && Number(cM?.duracaoDias) === 0);
    check("prioridade preservada", cA?.prioridade === "alt");
    check("árvore refeita no clone (filhas apontam para a raiz NOVA)", cA?.parentId === cR?.id && cM?.parentId === cR?.id && cR?.id !== R.id);
    check("fase e classificador GLOBAIS copiados", cA?.etapaId === fase.id && cA?.origemId === origemCli.id, { etapa: cA?.etapaId, origem: cA?.origemId });
    check("classificador do PROJETO de origem não vai para o clone", cA?.localizacaoId === null);

    check("avanço, situação e data real zerados", cA?.progresso === 0 && cA?.status === "nin" && cA?.inicioReal === null);
    check("restrição de data não é copiada", cA?.restricaoTipo === null && cA?.restricaoData === null);
    check("bloqueio não é copiado", cM?.status === "nin" && cM?.motivoBloqueio === null);

    const dep = await prisma.eapDependencia.findFirst({ where: { tarefaId: cM!.id } });
    const cDisc = await prisma.disciplina.findFirst({ where: { projetoId: dup.id }, include: { etapas: { orderBy: { ordem: "asc" } } } });
    check("a disciplina do clone leva o vínculo com o catálogo", cDisc?.disciplinaId === catalogo.id, cDisc?.disciplinaId);
    check(
      "etapas por fase copiadas (fase, % e ordem), sem prazo, situação nem pagamento",
      cDisc?.etapas.length === 2 &&
        cDisc.etapas[0].etapaId === fases[0].id && Number(cDisc.etapas[0].percentual) === 60 &&
        cDisc.etapas[1].etapaId === fases[1].id && Number(cDisc.etapas[1].percentual) === 40 &&
        cDisc.etapas.every((e) => e.prazo === null && e.status === "aguardando" && e.liberadaEm === null && e.valorPagamento === null),
      cDisc?.etapas,
    );
    check("a linha leva a fase que a disciplina do clone tem", cA?.etapaId === fases[0].id);
    if (fases[2]) check("fase que a disciplina não tem como etapa não é copiada", cM?.etapaId === null, cM?.etapaId);

    check("dependência copiada com tipo e defasagem", dep?.predecessoraId === cA?.id && dep?.tipo === "ff" && Number(dep?.lagDias) === 2, dep);

    const ids = linhas.map((l) => l.idCorporativo);
    const idsOrigem = [R, A, M].map((l) => l.idCorporativo);
    check("toda linha nova tem ID corporativo, no padrão", ids.every((i) => /^[A-Z]+-\d{5,}$/.test(i ?? "")), ids);
    check("os IDs são distintos entre si e dos da origem", new Set(ids).size === 3 && ids.every((i) => !idsOrigem.includes(i)), { ids, idsOrigem });

    const cron = await prisma.cronogramaProjeto.findUnique({ where: { projetoId: dup.id } });
    check("cronograma do clone nasce em rascunho, com o início pedido", cron?.aprovado === false && cron.inicioProjeto != null && paraDia(cron.inicioProjeto) === "2026-11-09", cron);
    check("o motor calculou as datas a partir do início (Modelagem começa em 09/11)", cA?.inicioPrevisto != null && paraDia(cA.inicioPrevisto) === "2026-11-09", cA?.inicioPrevisto);
    check("código da EAP preenchido (WBS)", linhas.every((l) => !!l.codigoEap) && cR?.codigoEap === "1" && cA?.codigoEap === "1.1", linhas.map((l) => l.codigoEap));
    const disc = await prisma.disciplina.findMany({ where: { projetoId: dup.id } });
    check("linhas do clone ligadas à disciplina do CLONE", linhas.every((l) => l.disciplinaId === disc[0]?.id) && disc[0]?.id !== disciplina.id);

    // ── 4. Sem copiarEap: nada de EAP nem de cronograma; e outra cópia não repete ID ──
    const semEap = await duplicarProjetoNoBanco({ id: projeto.id, ...OPCOES, copiarEap: false }, admin.id);
    clones.push(semEap.id);
    check("sem copiarEap: nenhuma linha, nenhum cronograma", (await prisma.eapTarefa.count({ where: { projetoId: semEap.id } })) === 0 && (await prisma.cronogramaProjeto.count({ where: { projetoId: semEap.id } })) === 0);

    const dup2 = await duplicarProjetoNoBanco({ id: projeto.id, ...OPCOES, copiarEap: true }, admin.id);
    clones.push(dup2.id);
    const ids2 = (await prisma.eapTarefa.findMany({ where: { projetoId: dup2.id }, select: { idCorporativo: true } })).map((l) => l.idCorporativo);
    check("outra cópia: 3 IDs novos, sem repetir nenhum", ids2.length === 3 && ids2.every((i) => !!i && !ids.includes(i) && !idsOrigem.includes(i)), { ids2, ids });
    const cron2 = await prisma.cronogramaProjeto.findUnique({ where: { projetoId: dup2.id } });
    check("sem início pedido: cronograma em rascunho sem âncora, datas partindo do original", cron2?.aprovado === false && cron2.inicioProjeto === null);
  } finally {
    for (const id of clones) {
      await prisma.eapTarefa.deleteMany({ where: { projetoId: id, parentId: { not: null } } });
      await prisma.eapTarefa.deleteMany({ where: { projetoId: id } });
      await prisma.cronogramaSaudeSnapshot.deleteMany({ where: { projetoId: id } });
      await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: id } });
      await prisma.disciplina.deleteMany({ where: { projetoId: id } });
      await prisma.projeto.delete({ where: { id } });
    }
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id, parentId: { not: null } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    if (locProjeto) await prisma.eapCatalogo.deleteMany({ where: { id: locProjeto.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
