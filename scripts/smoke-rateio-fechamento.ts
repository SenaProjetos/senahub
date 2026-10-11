/**
 * Smoke do fechamento travado do rateio (R3) contra o banco de dev. Usa um mês já terminado e ainda
 * sem fechamento; ao fim, desfaz tudo o que criou (cabeçalho, linhas e eventos desse mês).
 *
 *   1. Mês em curso não fecha.
 *   2. Fechar grava cabeçalho com custo total, linhas e evento "fechou"; fechar de novo é recusado.
 *   3. Reabrir sem motivo é recusado; com motivo apaga cabeçalho e linhas e grava "reabriu".
 *   4. Recalcular um mês fechado no cálculo antigo gera o cálculo novo e os eventos.
 *
 * Uso: npm run smoke:rateio-fechamento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fecharMesNoBanco, reabrirMesNoBanco, recalcularMesNoBanco } from "../src/modules/rh/rateio/fechamento/service";
import { MSG_JA_FECHADO, MSG_MES_EM_CURSO, MSG_MOTIVO_CURTO, MSG_SO_LEGADO } from "../src/modules/rh/rateio/fechamento/regras";

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

async function main() {
  const autor = await prisma.user.findFirstOrThrow({ where: { superUsuario: true }, select: { id: true } });
  // Mês terminado sem fechamento, procurando para trás a partir de 2026-03.
  let ano = 2026;
  let mes = 3;
  while (await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } } })) {
    mes -= 1;
    if (mes === 0) { mes = 12; ano -= 1; }
  }
  const agora = new Date();
  const emCurso = { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
  console.log(`mês de teste: ${String(mes).padStart(2, "0")}/${ano}`);

  try {
    // 1
    check("mês em curso não fecha", (await erroDe(() => fecharMesNoBanco(emCurso.ano, emCurso.mes, autor.id))) === MSG_MES_EM_CURSO);

    // 2
    const r = await fecharMesNoBanco(ano, mes, autor.id);
    const cab = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } } });
    const soma = await prisma.rateioHora.aggregate({ where: { ano, mes }, _sum: { custo: true } });
    check("fechar grava cabeçalho com o custo total igual à soma das linhas", !!cab && Number(cab.custoTotal) === Number(soma._sum.custo ?? 0), { cab: cab?.custoTotal, soma: soma._sum.custo });
    check("fechar grava o evento 'fechou'", (await prisma.fechamentoRateioEvento.count({ where: { ano, mes, tipo: "fechou" } })) === 1);
    check("fechar de novo é recusado", (await erroDe(() => fecharMesNoBanco(ano, mes, autor.id))) === MSG_JA_FECHADO);

    // 4 (antes de reabrir: mês < corte = cálculo antigo)
    if (r.calculo === "legado") {
      check("recalcular sem motivo é recusado", (await erroDe(() => recalcularMesNoBanco(ano, mes, "curto", autor.id))) === MSG_MOTIVO_CURTO);
      await recalcularMesNoBanco(ano, mes, "trazer os encargos para este mês", autor.id);
      const cab2 = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } } });
      check("recalcular troca para o cálculo novo", cab2?.calculo === "v2", cab2?.calculo);
      check("recalcular grava 'recalculou' e um novo 'fechou'", (await prisma.fechamentoRateioEvento.count({ where: { ano, mes, tipo: "recalculou" } })) === 1 && (await prisma.fechamentoRateioEvento.count({ where: { ano, mes, tipo: "fechou" } })) === 2);
      check("recalcular de novo (já no cálculo novo) é recusado", (await erroDe(() => recalcularMesNoBanco(ano, mes, "trazer os encargos para este mês", autor.id))) === MSG_SO_LEGADO);
    } else {
      console.log("  --  mês de teste já está no cálculo novo: recálculo não se aplica");
    }

    // 3
    check("reabrir sem motivo é recusado", (await erroDe(() => reabrirMesNoBanco(ano, mes, "  x  ", autor.id))) === MSG_MOTIVO_CURTO);
    await reabrirMesNoBanco(ano, mes, "ajuste de ponto depois do fechamento", autor.id);
    check("reabrir apaga cabeçalho e linhas", !(await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } } })) && (await prisma.rateioHora.count({ where: { ano, mes } })) === 0);
    const ev = await prisma.fechamentoRateioEvento.findFirst({ where: { ano, mes, tipo: "reabriu" } });
    check("reabrir guarda o motivo no histórico", ev?.motivo === "ajuste de ponto depois do fechamento", ev?.motivo);
  } finally {
    await prisma.rateioHora.deleteMany({ where: { ano, mes } });
    await prisma.fechamentoRateio.deleteMany({ where: { ano, mes } });
    await prisma.fechamentoRateioEvento.deleteMany({ where: { ano, mes } });
  }
  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
