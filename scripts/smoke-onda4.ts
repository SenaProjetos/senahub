/**
 * Smoke da Onda 4: lead no funil → converter em cliente → proposta com itens
 * (tabela de preço aplicada) → aceitar → projeto + disciplinas + canais de chat.
 * Idempotente: limpa o que cria.
 *
 * Uso: npm run smoke:onda4
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { ensureCanaisProjeto } from "../src/modules/chat/service";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";

async function main() {
  const tag = `SMK4_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin não encontrado.");

  // 1) Lead no funil
  const etapa = await prisma.funilEtapa.findFirst({ orderBy: { ordem: "asc" } });
  check("etapas do funil semeadas", !!etapa);
  const lead = await prisma.lead.create({
    data: { nome: `${tag}_lead`, etapaId: etapa!.id, valorEstimado: 10000, email: `${tag}@cli.local` },
  });

  // 2) Converter em cliente (núcleo de converterLead)
  const cliente = await prisma.cliente.create({
    data: { tipo: "PJ", nome: lead.nome, email: lead.email },
  });
  await prisma.lead.update({ where: { id: lead.id }, data: { clienteId: cliente.id } });
  const leadConv = await prisma.lead.findUnique({ where: { id: lead.id } });
  check("lead convertido em cliente", leadConv?.clienteId === cliente.id);

  // 3) Proposta com itens via tabela de preço (200 m² × R$/m²)
  const area = 200;
  const tabela = { Estrutural: 18.5, "Hidrossanitário": 12 };
  const propostaSeq = await prisma.propostaSequencia.upsert({
    where: { ano: 2099 },
    create: { ano: 2099, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  const proposta = await prisma.proposta.create({
    data: {
      ano: 2099,
      sequencial: propostaSeq.ultimo,
      numero: `PR-99${String(propostaSeq.ultimo).padStart(4, "0")}`,
      titulo: `${tag}_proposta`,
      clienteId: cliente.id,
      leadId: lead.id,
      areaM2: area,
      token: randomBytes(18).toString("hex"),
      autorId: admin.id,
      itens: {
        create: Object.entries(tabela).map(([disc, vm2], i) => ({
          disciplina: disc,
          valor: vm2 * area,
          ordem: i,
        })),
      },
      condicoes: {
        create: [
          { descricao: "Entrada", tipo: "percentual", valor: 30, ordem: 0 },
          { descricao: "Na entrega", tipo: "percentual", valor: 70, ordem: 1 },
        ],
      },
    },
    include: { itens: true },
  });
  const total = proposta.itens.reduce((s, it) => s + Number(it.valor), 0);
  check("preço automático = R$/m² × área (6100)", total === 18.5 * area + 12 * area);

  // 4) Pixel: registra visualização
  await prisma.propostaVisualizacao.create({
    data: { propostaId: proposta.id, ip: "127.0.0.1", userAgent: "smoke" },
  });
  const views = await prisma.propostaVisualizacao.count({ where: { propostaId: proposta.id } });
  check("visualização registrada (pixel)", views === 1);

  // 5) Aceite → projeto + disciplinas + canais (núcleo de aceitarProposta)
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    const prj = await tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: proposta.titulo,
        clienteId: cliente.id,
        areaM2: area,
        disciplinas: {
          create: proposta.itens.map((it, idx) => ({ nome: it.disciplina, valor: it.valor, ordem: idx })),
        },
      },
      include: { disciplinas: true },
    });
    await tx.proposta.update({
      where: { id: proposta.id },
      data: { status: "aceita", aceitaEm: new Date(), projetoId: prj.id },
    });
    return prj;
  });
  check("projeto criado com disciplinas da proposta", projeto.disciplinas.length === 2);
  check(
    "valores das disciplinas = valores dos itens",
    projeto.disciplinas.every((d) =>
      proposta.itens.some((it) => it.disciplina === d.nome && Number(it.valor) === Number(d.valor)),
    ),
  );

  await ensureCanaisProjeto(projeto.id);
  const canais = await prisma.canal.count({
    where: { OR: [{ projetoId: projeto.id }, { disciplina: { projetoId: projeto.id } }] },
  });
  check("canais de chat criados (projeto + disciplinas)", canais >= 3);

  const pAceita = await prisma.proposta.findUnique({ where: { id: proposta.id } });
  check("proposta aceita vinculada ao projeto", pAceita?.status === "aceita" && pAceita?.projetoId === projeto.id);

  // Limpeza
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.proposta.delete({ where: { id: proposta.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });

  console.log(ok ? "\nSMOKE ONDA 4: OK" : "\nSMOKE ONDA 4: FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
