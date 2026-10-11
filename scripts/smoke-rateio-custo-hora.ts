/**
 * Smoke do custo da hora (R1 do rateio). SÓ LEITURA: calcula o custo de outubro/2026 de todo
 * mundo com vínculo CLT/estágio/sócio e confere as regras contra o próprio banco.
 *
 *   npm run smoke:rateio-custo-hora
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import { calcularRateioDoMes } from "@/modules/rh/rateio/queries";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

async function main() {
  const ano = 2026;
  const mes = 10;
  const tabelas = await prisma.tabelaEncargos.count();
  ok(tabelas >= 3, `${tabelas} versão(ões) de tabela de encargos`);

  const vinculos = await prisma.vinculo.findMany({
    where: { contratacao: { in: ["clt", "estagio", "pro_labore", "pj"] }, dataFim: null },
    select: { userId: true, contratacao: true },
  });
  const custos = await custosDoMes(ano, mes, vinculos.map((v) => v.userId));
  for (const v of vinculos) {
    const c = custos.get(v.userId)!;
    if (v.contratacao === "pj") ok(c.custo === null, `PJ ${v.userId} entra só com horas`);
    else if (c.custo) ok(c.custo.totalCent >= c.custo.baseCent, `${v.contratacao} ${v.userId}: total ${c.custo.totalCent} ≥ base ${c.custo.baseCent} (${c.origemBase})`);
    else console.log(`· ${v.contratacao} ${v.userId} sem base cadastrada`);
  }

  const { calculo, linhas } = await calcularRateioDoMes(ano, mes);
  ok(calculo === "v2", `outubro/2026 usa o cálculo novo (${calculo})`);
  for (const [userId, c] of custos) {
    if (!c.custo || c.contratacao === "pro_labore") continue;
    const soma = linhas.filter((l) => l.userId === userId).reduce((s, l) => s + l.custoCent, 0);
    ok(soma === c.custo.totalCent, `${userId}: linhas somam o custo do mês (${soma} = ${c.custo.totalCent})`);
  }
  const { calculo: setembro } = await calcularRateioDoMes(2026, 9);
  ok(setembro === "legado", "setembro/2026 segue no cálculo antigo");

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
