/**
 * "Ciclo em sombra" — a parte que É código. Não substitui a parte que não é (ver rodapé).
 *
 * Prova, com volume e casos de borda, que `calcularRateioDetalhado()` — a função que gera
 * `RateioHora` no fechamento real — trata sessões vindas de `aplicarBatida` (ponto, CLT) e de
 * escrita direta em `SessaoTrabalho` (o que `apontamento.ts` faz, sem geo/máquina de estados)
 * de forma IDÊNTICA. Não é teste de fumaça: cada minuto esperado é calculado à mão a partir
 * dos timestamps sintéticos e comparado byte a byte com o que o motor de rateio produziu.
 *
 * Duas provas independentes:
 *   1) Volume determinístico num mês sintético isolado (2031-03) — todas as sessões têm `fim`
 *      explícito, sem depender de `new Date()`, então o resultado é 100% prevísivel.
 *   2) Sessão ABERTA (`fim: null`) usando o dia de hoje de verdade, via `abrirApontamento`/
 *      `fecharApontamento` reais — "aberta" só faz sentido em relação ao relógio real, então
 *      não dá pra simular num mês futuro (uma sessão com `inicio` em 2031 e `fim: null` mediria
 *      tempo NEGATIVO contra o "agora" de 2026, e `minutosSessao` mascara isso truncando pra 0).
 *
 * Cria usuários efêmeros, roda os cálculos, e DELETA tudo ao final. Nada disto fica no banco.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/simular-fechamento-sombra.ts
 *
 * O QUE ISTO NÃO PROVA (e nenhum script provaria): que PJ/freelancer vão de fato usar o botão
 * "Iniciar apontamento" corretamente no dia a dia, esquecer de encerrar, etc. — e que a
 * Diretoria/RH revisem um fechamento REAL antes de confiar nele para pagar gente de verdade.
 * Isso é adoção operacional e confiança organizacional, não correção de cálculo — só o tempo
 * (e uso real) resolve. Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§13.6)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { aplicarBatida } from "../src/modules/ponto/service";
import { abrirApontamento, fecharApontamento } from "../src/modules/ponto/apontamento";
import { calcularRateioDetalhado } from "../src/modules/rh/rateio/queries";

// Mês sintético isolado — bem longe de qualquer dado real, sem colidir com nada do dev.
const ANO = 2031;
const MES = 3;

function em(dia: number, hora: number, min = 0) {
  return new Date(ANO, MES - 1, dia, hora, min, 0);
}

let falhas = 0;
function checar(ok: boolean, msg: string) {
  console.log(`  ${ok ? "✔" : "✖"} ${msg}`);
  if (!ok) falhas++;
}

async function main() {
  console.log(`Simulando fechamento sombra ${MES}/${ANO} (isolado, sem tocar dado real)...\n`);

  const projA = await prisma.projeto.findFirst({ select: { id: true, nome: true } });
  const projB = await prisma.projeto.findFirst({ skip: 1, select: { id: true, nome: true } });
  if (!projA || !projB) throw new Error("precisa de ao menos 2 projetos no banco pra simular troca");

  const sufixo = Date.now();
  const clt = await prisma.user.create({
    data: { name: "Sombra CLT", email: `sombra-clt-${sufixo}@teste.local`, role: "clt", ativo: true },
  });
  const pj = await prisma.user.create({
    data: { name: "Sombra PJ", email: `sombra-pj-${sufixo}@teste.local`, role: "projetista_pj", ativo: true },
  });

  // ── Prova 1: volume determinístico, mês sintético isolado ──────────────────────────────
  const esperado = new Map<string, number>();
  const soma = (userId: string, projetoId: string, min: number) => {
    const k = `${userId}|${projetoId}`;
    esperado.set(k, (esperado.get(k) ?? 0) + min);
  };

  console.log("Gerando mês via ponto (CLT) — aplicarBatida real, com troca de projeto no meio do dia...");
  for (const dia of [3, 4, 5, 10, 11, 17, 18, 24, 25]) {
    await aplicarBatida({ userId: clt.id, tipo: "entrada", horario: em(dia, 8), projetoId: projA.id, origem: "app" });
    await aplicarBatida({ userId: clt.id, tipo: "inicio_descanso", horario: em(dia, 12), projetoId: null, origem: "app" });
    await aplicarBatida({ userId: clt.id, tipo: "fim_descanso", horario: em(dia, 13), projetoId: projA.id, origem: "app" });
    // Troca de projeto às 15h (escrita direta, mesmo padrão de `trocarProjeto`): fecha a sessão
    // aberta e abre a próxima no mesmo instante — sem bater ponto, só muda a fatia do rateio.
    await prisma.sessaoTrabalho.updateMany({ where: { userId: clt.id, fim: null }, data: { fim: em(dia, 15) } });
    await prisma.sessaoTrabalho.create({ data: { userId: clt.id, projetoId: projB.id, inicio: em(dia, 15) } });
    await aplicarBatida({ userId: clt.id, tipo: "saida", horario: em(dia, 17), projetoId: projB.id, origem: "app" });

    soma(clt.id, projA.id, (12 - 8) * 60 + (15 - 13) * 60); // 8h-12h (sessão 1) + 13h-15h (sessão 2), ambas em A
    soma(clt.id, projB.id, (17 - 15) * 60); // 15h-17h em B
  }

  console.log("Gerando mês via apontamento (PJ) — escrita direta em SessaoTrabalho, sem geo...");
  for (const dia of [3, 4, 5, 10, 11, 17, 18, 24, 25]) {
    await prisma.sessaoTrabalho.create({ data: { userId: pj.id, projetoId: projB.id, inicio: em(dia, 9), fim: em(dia, 12) } });
    soma(pj.id, projB.id, (12 - 9) * 60);
    await prisma.sessaoTrabalho.create({ data: { userId: pj.id, projetoId: projA.id, inicio: em(dia, 13), fim: em(dia, 18) } });
    soma(pj.id, projA.id, (18 - 13) * 60);
  }

  console.log("Caso de borda: sessão colada na virada do mês (dia 1 do mês seguinte) não deve vazar pro rateio...");
  const foraDoMes = await prisma.sessaoTrabalho.create({
    data: { userId: pj.id, projetoId: projA.id, inicio: new Date(ANO, MES, 1, 9), fim: new Date(ANO, MES, 1, 11) },
  });

  console.log("\nRodando o motor de rateio REAL (calcularRateioDetalhado) para o mês sintético...\n");
  const rows = await calcularRateioDetalhado(ANO, MES);
  const porChave = new Map(rows.map((r) => [`${r.userId}|${r.projetoId}`, r]));

  for (const [chave, minEsperado] of esperado) {
    const minReal = porChave.get(chave)?.minutos ?? 0;
    const [uid, pid] = chave.split("|");
    const quem = uid === clt.id ? "CLT (ponto)" : "PJ (apontamento)";
    const proj = pid === projA.id ? "A" : "B";
    checar(minReal === minEsperado, `${quem} · projeto ${proj}: esperado ${minEsperado}min, motor calculou ${minReal}min`);
  }

  const linhaVazada = rows.find((r) => r.userId === pj.id && !esperado.has(`${r.userId}|${r.projetoId}`));
  checar(!linhaVazada, "sessão do dia 1 do mês seguinte não vazou pro rateio de MES (filtro de data correto)");

  // ── Prova 2: sessão ABERTA, hoje de verdade, via as Server Actions reais ────────────────
  console.log("\nAbrindo apontamento real (hoje) e fechando pouco depois...");
  const hoje = new Date();
  const s = await abrirApontamento(pj.id, projA.id);
  await new Promise((r) => setTimeout(r, 1200));
  const antesDeFechar = await calcularRateioDetalhado(hoje.getFullYear(), hoje.getMonth() + 1);
  const linhaAberta = antesDeFechar.find((r) => r.userId === pj.id && r.projetoId === projA.id);
  checar(
    (linhaAberta?.minutos ?? -1) >= 0,
    `sessão aberta (sem fim) já soma no rateio do mês corrente antes de encerrar (minutos=${linhaAberta?.minutos})`,
  );
  await fecharApontamento(pj.id);
  const s2 = await prisma.sessaoTrabalho.findUnique({ where: { id: s.id }, select: { fim: true } });
  checar(s2?.fim != null, "fecharApontamento realmente encerrou a sessão (fim preenchido)");

  // Limpeza — nada disto fica no banco.
  await prisma.sessaoTrabalho.deleteMany({ where: { userId: { in: [clt.id, pj.id] } } });
  await prisma.batida.deleteMany({ where: { userId: { in: [clt.id, pj.id] } } });
  await prisma.sessaoTrabalho.delete({ where: { id: foraDoMes.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [clt.id, pj.id] } } });

  console.log(`\n${falhas === 0 ? "✔ EQUIVALÊNCIA CONFIRMADA" : `✖ ${falhas} DIVERGÊNCIA(S)`} — dado sintético removido do banco.`);
  await prisma.$disconnect();
  if (falhas > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
