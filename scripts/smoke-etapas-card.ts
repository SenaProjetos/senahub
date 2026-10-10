/**
 * Smoke das etapas no card da disciplina (áudio do dono, 2026-10-10) contra o banco de dev: etapas padrão pelo tipo
 * de projeto e de empreendimento (a 0%), e o botão "enviei os documentos da etapa para análise" — só responsável,
 * avisa coordenação + responsáveis, desfaz enquanto não aprovada. Notificador falso: nada é disparado.
 *
 * Uso: npm run smoke:etapas-card
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { semearEtapasPadrao } from "../src/modules/projetos/etapas-service";
import { desfazerEnvioEtapa, enviarEtapaParaAnalise } from "../src/modules/projetos/envio-etapa-service";

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

const tag = `smoke-etapas-card-${Date.now()}`;

async function main() {
  const [proj, coord, membro] = await Promise.all(
    ["proj", "coord", "membro"].map((n) =>
      prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, role: "projetista_pj", emailVerified: false } }),
    ),
  );
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const unifamiliar = await prisma.tipoEmpreendimento.create({ data: { nome: `${tag}-casa`, semEstudoPreliminar: true } });
  let seq = 0;
  const mk = (tipo: "particular" | "laudo", tipoEmpreendimentoId: string | null) =>
    prisma.projeto.create({
      data: {
        codigo: `${Date.now()}`.slice(-5) + ++seq,
        ano: 2026,
        sequencial: Number(`${Date.now()}`.slice(-5)) + seq,
        nome: `${tag}-${seq}`,
        clienteId: cliente.id,
        tipo,
        tipoEmpreendimentoId,
      },
    });
  const [predio, casa, laudo] = [await mk("particular", null), await mk("particular", unifamiliar.id), await mk("laudo", null)];
  const disc = (projetoId: string) => prisma.disciplina.create({ data: { projetoId, disciplinaTextoLegado: "Estrutural" } });
  const [dPredio, dCasa, dLaudo] = [await disc(predio.id), await disc(casa.id), await disc(laudo.id)];
  const siglas = async (disciplinaId: string) =>
    (
      await prisma.disciplinaEtapa.findMany({ where: { disciplinaId }, orderBy: { ordem: "asc" }, select: { percentual: true, etapa: { select: { sigla: true } } } })
    ).map((e) => `${e.etapa.sigla}:${Number(e.percentual)}`);

  const envios: { userIds: string[]; titulo: string }[] = [];
  const notificar = (async (userIds: string[], n: { titulo: string }) => {
    envios.push({ userIds: [...userIds].sort(), titulo: n.titulo });
  }) as typeof notificarMuitos;

  try {
    // ── 1. Etapas padrão ──
    await prisma.$transaction(async (tx) => {
      await semearEtapasPadrao(tx, [dPredio.id], { tipoProjeto: "particular", tipoEmpreendimentoId: null });
      await semearEtapasPadrao(tx, [dCasa.id], { tipoProjeto: "particular", tipoEmpreendimentoId: unifamiliar.id });
      await semearEtapasPadrao(tx, [dLaudo.id], { tipoProjeto: "laudo", tipoEmpreendimentoId: null });
    });
    check("projeto sem tipo marcado: EP, Básico e Executivo, a 0%", JSON.stringify(await siglas(dPredio.id)) === JSON.stringify(["PL:0", "BS:0", "EX:0"]), await siglas(dPredio.id));
    check("tipo sem EP (unifamiliar): só Básico e Executivo", JSON.stringify(await siglas(dCasa.id)) === JSON.stringify(["BS:0", "EX:0"]), await siglas(dCasa.id));
    check("laudo nasce sem etapa", (await siglas(dLaudo.id)).length === 0);
    await prisma.$transaction((tx) => semearEtapasPadrao(tx, [dPredio.id], { tipoProjeto: "particular", tipoEmpreendimentoId: null }));
    check("semear de novo não duplica", (await siglas(dPredio.id)).length === 3);

    // Fase inativa no catálogo: a disciplina nasce só com as que existem, sem erro. Dentro de uma transação que desfaz.
    const sentinela = new Error("desfazer");
    const semBasico = await prisma
      .$transaction(async (tx) => {
        await tx.pranchaCatalogo.updateMany({ where: { categoria: "fase", projetoId: null, sigla: "BS" }, data: { ativo: false } });
        const extra = await tx.disciplina.create({ data: { projetoId: predio.id, disciplinaTextoLegado: "Sem Básico" } });
        await semearEtapasPadrao(tx, [extra.id], { tipoProjeto: "particular", tipoEmpreendimentoId: null });
        const feitas = await tx.disciplinaEtapa.findMany({ where: { disciplinaId: extra.id }, select: { etapa: { select: { sigla: true } } } });
        throw Object.assign(sentinela, { feitas: feitas.map((e) => e.etapa.sigla).sort() });
      })
      .catch((e) => (e === sentinela ? (e as unknown as { feitas: string[] }).feitas : Promise.reject(e)));
    check("fase inativa no catálogo é pulada, sem erro (nasce só EP e EX)", JSON.stringify(semBasico) === JSON.stringify(["EX", "PL"]), semBasico);
    check("e o rollback devolve a fase ativa", (await prisma.pranchaCatalogo.count({ where: { categoria: "fase", projetoId: null, sigla: "BS", ativo: true } })) === 1);

    // ── 2. Enviar para análise ──
    await prisma.disciplinaResponsavel.create({ data: { disciplinaId: dPredio.id, userId: proj.id } });
    await prisma.projetoMembro.create({ data: { projetoId: predio.id, userId: coord.id, papel: "Coordenador" } });
    await prisma.projetoMembro.create({ data: { projetoId: predio.id, userId: membro.id, papel: "projetista" } });
    const ep = await prisma.disciplinaEtapa.findFirstOrThrow({ where: { disciplinaId: dPredio.id, etapa: { sigla: "PL" } }, select: { id: true } });

    check("quem não é responsável não envia", (await erroDe(() => enviarEtapaParaAnalise({ etapaId: ep.id, userId: membro.id, notificar })))?.includes("responsável") === true);
    await enviarEtapaParaAnalise({ etapaId: ep.id, userId: proj.id, notificar });
    const depois = await prisma.disciplinaEtapa.findUniqueOrThrow({ where: { id: ep.id }, select: { status: true, entregueEm: true } });
    check("responsável envia: etapa fica Entregue, com data", depois.status === "entregue" && depois.entregueEm != null, depois);
    check("avisa a coordenação — não o membro comum nem quem enviou", JSON.stringify(envios[0]?.userIds) === JSON.stringify([coord.id]), envios[0]);
    check("enviar de novo é recusado", (await erroDe(() => enviarEtapaParaAnalise({ etapaId: ep.id, userId: proj.id, notificar })))?.includes("já foi enviada") === true);

    // ── 3. Desfazer ──
    await desfazerEnvioEtapa({ etapaId: ep.id, userId: proj.id, notificar });
    const desfeita = await prisma.disciplinaEtapa.findUniqueOrThrow({ where: { id: ep.id }, select: { status: true, entregueEm: true } });
    check("desfazer volta para Em andamento e limpa a data", desfeita.status === "em_andamento" && desfeita.entregueEm == null, desfeita);
    check("desfazer também avisa", envios.length === 2 && envios[1].titulo.startsWith("Envio desfeito"));
    await prisma.disciplinaEtapa.update({ where: { id: ep.id }, data: { status: "aprovado" } });
    check("etapa aprovada não desfaz", (await erroDe(() => desfazerEnvioEtapa({ etapaId: ep.id, userId: proj.id, notificar })))?.includes("já aprovou") === true);
  } finally {
    await prisma.disciplinaResponsavel.deleteMany({ where: { disciplina: { projeto: { nome: { startsWith: tag } } } } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projeto: { nome: { startsWith: tag } } } } });
    await prisma.disciplina.deleteMany({ where: { projeto: { nome: { startsWith: tag } } } });
    await prisma.projetoMembro.deleteMany({ where: { projeto: { nome: { startsWith: tag } } } });
    await prisma.projeto.deleteMany({ where: { nome: { startsWith: tag } } });
    await prisma.tipoEmpreendimento.delete({ where: { id: unifamiliar.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
