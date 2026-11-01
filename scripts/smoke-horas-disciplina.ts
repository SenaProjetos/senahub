/**
 * Smoke das horas por disciplina (R5 do rateio) contra o banco de dev. Cria e apaga os próprios dados.
 *
 *   1. Orçado = linha de base mais antiga (só linha-folha); planejado = atribuições da EAP; realizado = ponto.
 *   2. Coordenador (papel no projeto) vê as horas de cada pessoa; projetista vê só as próprias, com o
 *      total da disciplina inteiro.
 *   3. Reais: só superusuário/sócio; os outros recebem `custoCent: null`.
 *
 * Uso: npm run smoke:horas-disciplina
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { horasPorDisciplina } from "../src/modules/projetos/horas-disciplina-queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-horas-disc-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const mk = (n: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, tipo: "interno", emailVerified: false, ...extra } });
  const coord = await mk("coord");
  const ana = await mk("ana");
  const beto = await mk("beto");
  const socio = await mk("socio");
  const ids = [coord.id, ana.id, beto.id, socio.id];
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-c` } });
  const seq = Number(`${Date.now()}`.slice(-5));
  const proj = await prisma.projeto.create({ data: { codigo: `${seq}7`, ano: 2026, sequencial: seq + 7, nome: `${tag}-p`, clienteId: cliente.id } });
  const disc = await prisma.disciplina.create({ data: { projetoId: proj.id, disciplinaTextoLegado: "Estrutural", status: "em_andamento" } });

  try {
    await prisma.projetoMembro.createMany({ data: [{ projetoId: proj.id, userId: coord.id, papel: "coordenador" }, { projetoId: proj.id, userId: ana.id, papel: "projetista" }] });
    const linha = await prisma.eapTarefa.create({ data: { projetoId: proj.id, nome: "Modelagem", tipoEap: "atv", disciplinaId: disc.id, duracaoDias: 5, inicioPrevisto: d("2026-10-01"), fimPrevisto: d("2026-10-07") } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: linha.id, userId: ana.id, horasPrevistas: 40 } });
    const bl = await prisma.eapBaseline.create({ data: { projetoId: proj.id, numero: 0 } });
    await prisma.eapBaselineLinha.create({ data: { baselineId: bl.id, tarefaId: linha.id, nome: "Modelagem", inicio: d("2026-10-01"), fim: d("2026-10-07"), duracaoDias: 5, trabalhoHoras: 32 } });
    const bl1 = await prisma.eapBaseline.create({ data: { projetoId: proj.id, numero: 1 } });
    await prisma.eapBaselineLinha.create({ data: { baselineId: bl1.id, tarefaId: linha.id, nome: "Modelagem", inicio: d("2026-10-01"), fim: d("2026-10-07"), duracaoDias: 5, trabalhoHoras: 99 } });
    await prisma.sessaoTrabalho.createMany({
      data: [
        { userId: ana.id, projetoId: proj.id, tipoAlocacao: "projeto", disciplinaId: disc.id, inicio: new Date("2026-10-05T11:00:00Z"), fim: new Date("2026-10-05T15:00:00Z") },
        { userId: beto.id, projetoId: proj.id, tipoAlocacao: "projeto", disciplinaId: disc.id, inicio: new Date("2026-10-05T11:00:00Z"), fim: new Date("2026-10-05T13:00:00Z") },
      ],
    });
    await prisma.rateioHora.create({ data: { userId: ana.id, projetoId: proj.id, disciplinaId: disc.id, natureza: "projeto", ano: 2026, mes: 9, minutos: 60, custoHora: 50, custo: 50 } });

    const viewer = (u: { id: string; ehSocio?: boolean }, extra: Record<string, unknown> = {}) => ({
      id: u.id, ativo: true, perfilId: null, superUsuario: false, ehSocio: !!u.ehSocio, perfilChave: null, ...extra,
    });

    const doCoord = (await horasPorDisciplina(viewer(coord), proj.id)).linhas[0];
    check("orçado vem da linha de base MAIS ANTIGA (32h)", doCoord.orcadoMin === 32 * 60, doCoord.orcadoMin);
    check("planejado vem das atribuições da EAP (40h)", doCoord.planejadoMin === 40 * 60, doCoord.planejadoMin);
    check("realizado soma o ponto de todos (6h)", doCoord.realizadoMin === 360, doCoord.realizadoMin);
    check("coordenador vê cada pessoa", doCoord.porPessoa.length === 2, doCoord.porPessoa);
    check("coordenador sem ser sócio não vê reais", doCoord.custoCent === null, doCoord.custoCent);

    const daAna = (await horasPorDisciplina(viewer(ana), proj.id)).linhas[0];
    check("projetista vê só as próprias horas por pessoa", daAna.porPessoa.length === 1 && daAna.porPessoa[0].userId === ana.id, daAna.porPessoa);
    check("projetista vê o total da disciplina inteiro", daAna.realizadoMin === 360, daAna.realizadoMin);

    const doSocio = (await horasPorDisciplina(viewer({ id: socio.id, ehSocio: true }), proj.id)).linhas[0];
    check("sócio vê os reais (rateio fechado)", doSocio.custoCent === 5000, doSocio.custoCent);
    const doPerfil = (await horasPorDisciplina(viewer(beto, { perfilChave: "coordenador" }), proj.id)).linhas[0];
    check("perfil Coordenador também vê cada pessoa", doPerfil.porPessoa.length === 2, doPerfil.porPessoa);
  } finally {
    await prisma.rateioHora.deleteMany({ where: { projetoId: proj.id } });
    await prisma.sessaoTrabalho.deleteMany({ where: { userId: { in: ids } } });
    await prisma.eapBaseline.deleteMany({ where: { projetoId: proj.id } });
    await prisma.eapAtribuicao.deleteMany({ where: { userId: { in: ids } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: proj.id } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: proj.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: proj.id } });
    await prisma.projeto.delete({ where: { id: proj.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
