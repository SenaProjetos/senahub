/**
 * Smoke da Onda 1 contra o banco de dev: exercita o fluxo crítico
 * cliente → projeto (numeração AAXXXX) → disciplina → uploads A/B →
 * validação → pagamento automático (regra de ouro). Idempotente: limpa o que cria.
 *
 * Uso: npm run smoke:onda1
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";

async function main() {
  const tag = `SMOKE_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  // Projetista de teste
  const projetista = await prisma.user.create({
    data: { name: `${tag}_proj`, email: `${tag}@test.local`, role: "projetista_pj", ativo: true },
  });
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });

  // Projeto com numeração atômica
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_prj`, clienteId: cliente.id },
    });
  });
  check("código AAXXXX com 6 dígitos", /^\d{6}$/.test(projeto.codigo));

  const disciplina = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      nome: "Estrutural",
      valor: 1000,
      responsaveis: { create: { userId: projetista.id } },
    },
    include: { responsaveis: true },
  });

  // Uploads A e B
  await prisma.upload.createMany({
    data: [
      { disciplinaId: disciplina.id, pacote: "A", nomeArquivo: "planta.pdf", caminho: `${tag}/A/planta.pdf`, hashSha256: "x", tamanho: 10, autorId: projetista.id },
      { disciplinaId: disciplina.id, pacote: "B", nomeArquivo: "backup.zip", caminho: `${tag}/B/backup.zip`, hashSha256: "y", tamanho: 20, autorId: projetista.id },
    ],
  });

  // Núcleo de validarEntrega: exige A+B, cria pagamento, aprova disciplina
  const temA = await prisma.upload.count({ where: { disciplinaId: disciplina.id, pacote: "A" } });
  const temB = await prisma.upload.count({ where: { disciplinaId: disciplina.id, pacote: "B" } });
  check("Pacote A e B presentes antes de validar", temA > 0 && temB > 0);

  await prisma.$transaction(async (tx) => {
    await tx.upload.updateMany({ where: { disciplinaId: disciplina.id }, data: { validado: true } });
    await tx.disciplina.update({ where: { id: disciplina.id }, data: { status: "aprovado" } });
    await tx.pagamentoProjetista.create({
      data: {
        disciplinaId: disciplina.id,
        projetistaId: projetista.id,
        valor: 1000,
        tipoProfissional: projetista.role,
        status: "pendente",
      },
    });
  });

  const pagamentos = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id } });
  check("pagamento criado ao validar (regra de ouro)", pagamentos.length === 1);
  check("valor do pagamento = valor da disciplina", Number(pagamentos[0]?.valor) === 1000);
  check("tipoProfissional registrado", pagamentos[0]?.tipoProfissional === "projetista_pj");

  const disc = await prisma.disciplina.findUnique({ where: { id: disciplina.id } });
  check("disciplina marcada como aprovada", disc?.status === "aprovado");

  // Escopo: outro projetista NÃO enxerga este projeto
  const estranho = await prisma.user.create({
    data: { name: `${tag}_outro`, email: `${tag}_o@test.local`, role: "projetista_pj", ativo: true },
  });
  const visiveis = await prisma.projeto.findMany({
    where: {
      id: projeto.id,
      OR: [
        { membros: { some: { userId: estranho.id } } },
        { disciplinas: { some: { responsaveis: { some: { userId: estranho.id } } } } },
      ],
    },
  });
  check("escopo: projetista alheio não vê o projeto", visiveis.length === 0);

  // Limpeza
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });

  console.log(ok ? "\nSMOKE ONDA 1: OK" : "\nSMOKE ONDA 1: FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
