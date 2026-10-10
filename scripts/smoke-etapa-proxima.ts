/**
 * Smoke do aviso da etapa que vem (reunião de 08/10/2026, decisão 4) contra o banco de dev. O vitest cobre a regra
 * pura (`etapa-proxima.ts`); aqui vai o I/O: só cronograma aprovado, destinatários (atividade + coordenação, nunca o
 * Externo), uma vez por etapa e data, data nova rearma, etapa iniciada não avisa.
 *
 * Roda com um "hoje" fixo e um notificador falso — não dispara notificação de verdade. As reservas que a rodada
 * gravar em OUTROS projetos do banco de dev são apagadas no fim.
 *
 * Uso: npm run smoke:etapa-proxima
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { avisarEtapasProximas } from "../src/modules/planejamento/etapa-proxima-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-etapa-proxima-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
// Terça 03/11/2026; a etapa começa quinta 05/11 = 2 dias úteis depois.
const HOJE = "2026-11-03";

type Envio = { userIds: string[]; titulo: string };

async function main() {
  const inicioSmoke = new Date();
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", projetoId: null, ativo: true }, select: { id: true, nome: true } });
  if (!fase) {
    console.log("Banco de dev sem fase no catálogo — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const [maria, coord, membroComum] = await Promise.all(
    ["maria", "coord", "membro"].map((n) =>
      prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, role: "clt", tipo: "interno", emailVerified: false } }),
    ),
  );
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: 2026, sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  const envios: Envio[] = [];
  const notificar = (async (userIds: string[], n: { titulo: string }) => {
    envios.push({ userIds: [...userIds].sort(), titulo: n.titulo });
  }) as typeof notificarMuitos;
  const rodar = async (hoje = HOJE) => {
    envios.length = 0;
    const r = await avisarEtapasProximas({ hoje, notificar });
    return { r, meus: envios.filter((e) => e.userIds.includes(maria.id) || e.userIds.includes(coord.id)) };
  };

  try {
    const disciplina = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural" } });
    const etapa = await prisma.disciplinaEtapa.create({ data: { disciplinaId: disciplina.id, etapaId: fase.id, percentual: 100, ordem: 0 } });
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05"), aprovado: false } });
    await prisma.projetoMembro.create({ data: { projetoId: projeto.id, userId: coord.id, papel: "Coordenador" } });
    await prisma.projetoMembro.create({ data: { projetoId: projeto.id, userId: membroComum.id, papel: "projetista" } });

    const linha = (nome: string, inicio: string) =>
      prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          nome,
          tipoEap: "atv",
          duracaoDias: 3,
          inicioPrevisto: d(inicio),
          fimPrevisto: d(inicio),
          disciplinaId: disciplina.id,
          etapaId: fase.id,
        },
      });
    const modelagem = await linha("Modelagem", "2026-11-05");
    const documentacao = await linha("Documentação", "2026-11-10");
    await prisma.eapAtribuicao.create({ data: { tarefaId: modelagem.id, userId: maria.id, papel: "pro", horasPrevistas: 8, principal: true } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: documentacao.id, papel: "ext", principal: false } });

    // ── 1. Rascunho não avisa ──
    let x = await rodar();
    check("cronograma em rascunho não avisa", x.meus.length === 0, x.meus);

    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { aprovado: true } });

    // ── 2. Um dia antes da janela não avisa ──
    x = await rodar("2026-11-02");
    check("3 dias úteis antes ainda não avisa", x.meus.length === 0, x.meus);

    // ── 3. Na janela: atividade + coordenação, sem o membro comum ──
    x = await rodar();
    check("2 dias úteis antes avisa uma vez", x.meus.length === 1, x.meus);
    check("vai para quem tem atividade e para a coordenação, não para membro comum", JSON.stringify(x.meus[0]?.userIds) === JSON.stringify([maria.id, coord.id].sort()), x.meus[0]);
    check("o título diz disciplina e etapa", x.meus[0]?.titulo === `Próxima etapa: Estrutural · ${fase.nome}`, x.meus[0]?.titulo);
    const reservas = await prisma.avisoEtapaEnviado.count({ where: { disciplinaEtapaId: etapa.id } });
    check("grava a reserva da etapa", reservas === 1, reservas);

    // ── 4. Uma vez só ──
    x = await rodar("2026-11-04");
    check("no dia seguinte (mesma data de início) não repete", x.meus.length === 0, x.meus);

    // ── 5. Data nova rearma ──
    await prisma.eapTarefa.update({ where: { id: modelagem.id }, data: { inicioPrevisto: d("2026-11-09"), fimPrevisto: d("2026-11-09") } });
    x = await rodar("2026-11-05");
    check("início adiado para 09/11 rearma o aviso (05/11 = 2 dias úteis antes)", x.meus.length === 1, x.meus);

    // ── 6. Etapa iniciada não avisa ──
    await prisma.eapTarefa.update({ where: { id: modelagem.id }, data: { inicioPrevisto: d("2026-11-12"), fimPrevisto: d("2026-11-12") } });
    await prisma.eapTarefa.update({ where: { id: documentacao.id }, data: { progresso: 10 } });
    x = await rodar("2026-11-10");
    check("etapa com linha já iniciada não avisa", x.meus.length === 0, x.meus);
  } finally {
    await prisma.avisoEtapaEnviado.deleteMany({ where: { enviadoEm: { gte: inicioSmoke } } });
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: projeto.id } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
