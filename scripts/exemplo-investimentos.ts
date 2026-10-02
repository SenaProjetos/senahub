/**
 * Dados de exemplo da carteira (M4) para o dono ver as telas no banco de DEV — os números do mock aprovado.
 * Idempotente; `--limpar` apaga o que ele criou.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/exemplo-investimentos.ts [--limpar]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { criarInvestimentoNoBanco, registrarRendimentoNoBanco } from "../src/modules/financeiro/investimentos/service";

const MARCA = "[exemplo do mock]";
const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function limpar() {
  const invs = await prisma.investimento.findMany({ where: { nome: { contains: MARCA } }, select: { id: true, contaId: true } });
  const contas = invs.map((i) => i.contaId);
  // As pernas de aporte na conta corrente saem junto com as da conta do ativo (mesmo transferenciaId).
  const pares = (await prisma.lancamento.findMany({ where: { contaId: { in: contas }, transferenciaId: { not: null } }, select: { transferenciaId: true } })).map((l) => l.transferenciaId!);
  await prisma.lancamento.deleteMany({ where: { OR: [{ contaId: { in: contas } }, { transferenciaId: { in: pares } }], excluidoEm: { not: undefined } } });
  await prisma.investimento.deleteMany({ where: { id: { in: invs.map((i) => i.id) } } });
  await prisma.contaBancaria.deleteMany({ where: { id: { in: contas } } });
  console.log(`Removidos ${invs.length} ativo(s) de exemplo.`);
}

async function main() {
  if (process.env.DATABASE_URL && !/_remake|_dev|_test|_vscode/.test(process.env.DATABASE_URL)) throw new Error("Só para banco de desenvolvimento.");
  await limpar();
  if (process.argv.includes("--limpar")) return;
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" }, select: { id: true } });
  const conta = await prisma.contaBancaria.findFirstOrThrow({ where: { ativo: true, investimento: null }, orderBy: [{ padrao: "desc" }, { ordem: "asc" }], select: { id: true } });
  const venc = (meses: number) => { const d = new Date(); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10); };
  const ativos = [
    { nome: `CDB 105% CDI ${MARCA}`, tipo: "cdb" as const, instituicao: "Itaú", indexador: "105% do CDI", liquidez: "vencimento" as const, vencimento: venc(14), isentoIR: false, aporte: 80_000, bruto: 83_920 },
    { nome: `LCI 92% CDI ${MARCA}`, tipo: "lci" as const, instituicao: "Bradesco", indexador: "92% do CDI", liquidez: "vencimento" as const, vencimento: venc(2), isentoIR: true, aporte: 50_000, bruto: 51_700 },
    { nome: `Tesouro Selic 2029 ${MARCA}`, tipo: "tesouro" as const, instituicao: "Tesouro Direto", indexador: "Selic + 0,05%", liquidez: "d1" as const, vencimento: venc(30), isentoIR: false, aporte: 30_000, bruto: 31_800 },
    { nome: `Fundo DI ${MARCA}`, tipo: "fundo" as const, instituicao: "Sicredi", indexador: "DI, taxa adm. 0,3%", liquidez: "diaria" as const, vencimento: null, isentoIR: false, aporte: 20_000, bruto: 21_500 },
  ];
  for (const a of ativos) {
    const { id } = await criarInvestimentoNoBanco({ ...a, contaOrigemId: conta.id, aporte: { valor: a.aporte, data: dias(200), contaId: conta.id } }, admin.id);
    await registrarRendimentoNoBanco({ investimentoId: id, brutoInformado: a.bruto, data: dias(1) }, admin.id);
  }
  console.log("Carteira de exemplo criada (4 ativos). Para remover: npx tsx --tsconfig tsconfig.server.json scripts/exemplo-investimentos.ts --limpar");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
