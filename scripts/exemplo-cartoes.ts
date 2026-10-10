/**
 * Dados de exemplo dos cartões (M3) para o dono ver as telas no banco de DEV. Idempotente: roda de
 * novo sem duplicar. `--limpar` apaga tudo o que ele criou.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/exemplo-cartoes.ts [--limpar]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { lancarCompraNoBanco } from "../src/modules/financeiro/cartoes/service";

const MARCA = "[exemplo do mock]";
const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function limpar() {
  const cartoes = await prisma.cartaoCredito.findMany({ where: { nome: { contains: MARCA } }, select: { id: true } });
  const ids = cartoes.map((c) => c.id);
  if (ids.length) {
    await prisma.lancamento.deleteMany({ where: { cartaoId: { in: ids } } });
    await prisma.faturaCartao.deleteMany({ where: { cartaoId: { in: ids } } });
    await prisma.cartaoCredito.deleteMany({ where: { id: { in: ids } } });
  }
  const socios = await prisma.socio.findMany({ where: { user: { name: { contains: MARCA } } }, select: { id: true, userId: true } });
  if (socios.length) {
    await prisma.socio.deleteMany({ where: { id: { in: socios.map((s) => s.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: socios.map((s) => s.userId) } } });
  }
  console.log(`Removidos ${ids.length} cartão(ões) de exemplo${socios.length ? " e o sócio de exemplo" : ""}.`);
}

async function main() {
  if (process.env.DATABASE_URL && !/_remake|_dev|_test|_vscode/.test(process.env.DATABASE_URL)) {
    throw new Error("Este script é só para banco de desenvolvimento.");
  }
  if (process.argv.includes("--limpar")) return limpar();

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" }, select: { id: true } });
  const conta = await prisma.contaBancaria.findFirst({ where: { ativo: true }, select: { id: true } });
  const cats = await prisma.categoriaFinanceira.findMany({ where: { tipo: "despesa", ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, nome: true } });
  if (cats.length === 0) throw new Error("Sem categorias de despesa: rode npm run db:seed.");
  const cat = (n: number) => cats[Math.min(n, cats.length - 1)].id;
  const projeto = await prisma.projeto.findFirst({ select: { id: true } });

  await limpar();

  const empresa = await prisma.cartaoCredito.create({
    data: { nome: `Visa Empresarial ${MARCA}`, ultimosDigitos: "4821", tipo: "empresa", limite: 30000, diaFechamento: 25, diaVencimento: 5, contaPadraoId: conta?.id ?? null },
  });
  // Sem sócio no banco de dev não dá para ver o cartão pessoal: cria um, com a marca, para o `--limpar` levar junto.
  let socio = await prisma.socio.findFirst({ where: { ativo: true }, select: { id: true } });
  if (!socio) {
    const user = await prisma.user.create({
      data: { name: `Lúcio (sócio) ${MARCA}`, email: `socio-exemplo@dev.local`, role: "admin", tipo: "interno", emailVerified: false },
    });
    socio = await prisma.socio.create({ data: { userId: user.id, percentual: 100 }, select: { id: true } });
  }
  const pessoal = await prisma.cartaoCredito.create({
    data: { nome: `Cartão pessoal ${MARCA}`, tipo: "pessoal", socioId: socio.id, diaFechamento: 25, diaVencimento: 10, contaPadraoId: conta?.id ?? null },
  });

  const compras = [
    { cartaoId: empresa.id, descricao: "Licença AutoCAD", valor: 5670, dataCompra: dias(40), categoriaId: cat(1), parcelas: 3 },
    { cartaoId: empresa.id, descricao: "Combustível — visita de obra", valor: 320, dataCompra: dias(38), categoriaId: cat(0), parcelas: 1, projetoId: projeto?.id ?? null },
    { cartaoId: empresa.id, descricao: "Plotagem e impressões", valor: 740, dataCompra: dias(12), categoriaId: cat(1), parcelas: 1 },
    { cartaoId: empresa.id, descricao: "Hospedagem — obra Sul", valor: 1980, dataCompra: dias(8), categoriaId: cat(0), parcelas: 1, projetoId: projeto?.id ?? null },
    { cartaoId: empresa.id, descricao: "Material de escritório", valor: 600, dataCompra: dias(3), categoriaId: cat(1), parcelas: 1 },
  ];
  for (const c of compras) await lancarCompraNoBanco({ ...c, parcelas: c.parcelas }, admin.id);

  {
    for (const c of [
      { descricao: "Almoço com cliente", valor: 1250, dataCompra: dias(35) },
      { descricao: "Taxa de ART — CREA-SC", valor: 184, dataCompra: dias(33) },
      { descricao: "Passagem — vistoria Joinville", valor: 980, dataCompra: dias(9) },
      { descricao: "Assinatura de software", valor: 766, dataCompra: dias(4) },
    ]) {
      await lancarCompraNoBanco({ cartaoId: pessoal.id, categoriaId: cat(1), parcelas: 1, ...c }, admin.id);
    }
  }

  console.log("Cartões de exemplo criados (empresa + pessoal do sócio).");
  console.log("Para remover: npx tsx --tsconfig tsconfig.server.json scripts/exemplo-cartoes.ts --limpar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
