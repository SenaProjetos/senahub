/**
 * Smoke da Fase 6 do CRM (Inteligência) contra o banco de dev — mesmo padrão de
 * `smoke-crm-fase1/.../5.ts`. Cobre F6.2 (`seed-crm-volume.ts`) e F6.5 (Home/Meu Dia).
 *
 * ── F6.2 ── as 3 provas do aceite, todas exercitando o script REAL via CLI (`execSync`), não uma
 * cópia da lógica: a guarda anti-produção só vale alguma coisa testada no MESMO caminho que um
 * humano roda (`npm run seed:crm-volume`), e o volume/idempotência só provam algo rodando o
 * script duas vezes de verdade — reescrever a lógica aqui e chamá-la programaticamente testaria
 * o teste, não o script.
 *
 * ⚠️ Este smoke RODA O SEED DE VOLUME (2× — é o que prova idempotência) e deixa o resultado no
 * banco ao final, de propósito: é a fixture que F6.5/F6.7/F6.11 vão usar. NÃO limpa no `finally`
 * como os outros smokes — limpar destruiria a própria fixture que a fase precisa.
 *
 * ── F6.5 ── mede `homeComercial()` contra a MESMA fixture (2.000/6.000/4.000/1.500/3.000/50.000)
 * que o F6.2 acabou de deixar no banco — é o "meça e reporte" do critério de aceite, número real,
 * não estimativa. Reusa a técnica de contagem de query da F3.7 (`smoke-crm-fase3.ts`): liga
 * `PRISMA_LOG_QUERIES` ANTES do client existir, então os `require` (não `import`) do client e da
 * query ficam DEPOIS da linha que liga a env — é por isso que este arquivo, diferente dos outros
 * smokes, não usa `import` no topo para o que toca `lib/prisma`.
 *
 * Uso: npm run smoke:crm-fase6
 */
process.env.PRISMA_LOG_QUERIES = "1";

/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");
const { execSync } = require("node:child_process") as typeof import("node:child_process");
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");
const { homeComercial, resumoComercial } =
  require("../src/modules/comercial/queries") as typeof import("../src/modules/comercial/queries");
const { reagendarProximaAcao } =
  require("../src/modules/comercial/service") as typeof import("../src/modules/comercial/service");
/* eslint-enable @typescript-eslint/no-require-imports */

const TAG = "SEED_VOL_";

/** Mesmo padrão de contagem da F3.7 — ver docblock daquele arquivo para o porquê de cada linha. */
type Contador = { total: number; sqls: string[] };
const base = (globalThis as { __prismaBase?: { $on: (e: string, cb: (x: { query: string }) => void) => void } })
  .__prismaBase;
let coletor: Contador | null = null;
base?.$on("query", (e) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(e.query)) return;
  if (!coletor) return;
  coletor.total++;
  coletor.sqls.push(e.query.slice(0, 90));
});
async function contando<T>(fn: () => Promise<T>): Promise<{ r: T; c: Contador; ms: number }> {
  const c: Contador = { total: 0, sqls: [] };
  coletor = c;
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = performance.now() - t0;
    await new Promise((res) => setTimeout(res, 50));
    return { r, c, ms };
  } finally {
    coletor = null;
  }
}

async function main() {
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  console.log("\n── F6.2: guarda anti-produção recusa banco de nome não-dev ────────\n");

  // Mesmo host/porta do dev real (localhost:5433) para não pagar timeout de DNS — só o NOME do
  // banco muda, que é exatamente o sinal que a guarda usa (host pode ser "localhost" tanto em
  // dev quanto em produção, ver docblock do script).
  let recusouProducao = "";
  try {
    execSync("npx tsx --tsconfig tsconfig.server.json scripts/seed-crm-volume.ts", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: "postgresql://senahub:x@localhost:5433/senahub" },
      stdio: "pipe",
    });
  } catch (e) {
    recusouProducao = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
  }
  check(
    "banco chamado 'senahub' (nome real de produção, DEPLOY.md) é RECUSADO",
    /RECUSADO/.test(recusouProducao) && /não parece um banco de DEV/.test(recusouProducao),
    recusouProducao.split("\n")[0],
  );

  let recusouUrlVazia = "";
  try {
    execSync("npx tsx --tsconfig tsconfig.server.json scripts/seed-crm-volume.ts", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: "" },
      stdio: "pipe",
    });
  } catch (e) {
    recusouUrlVazia = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
  }
  check("DATABASE_URL vazia também é recusada", /RECUSADO|ausente/i.test(recusouUrlVazia));

  console.log("\n── F6.2: volume exato e idempotência (rodando 2× de verdade) ───────\n");

  execSync("npx tsx --tsconfig tsconfig.server.json scripts/seed-crm-volume.ts", { stdio: "pipe" });

  const contar = async () => ({
    clientes: await prisma.cliente.count({ where: { nome: { startsWith: TAG } } }),
    contatos: await prisma.contatoCliente.count({ where: { nome: { startsWith: TAG } } }),
    leads: await prisma.lead.count({ where: { nome: { startsWith: TAG } } }),
    negociacoes: await prisma.negociacao.count({ where: { titulo: { startsWith: TAG } } }),
    propostas: await prisma.proposta.count({ where: { numero: { startsWith: "SEED_VOL-" } } }),
  });

  const primeira = await contar();
  check(
    "2.000 clientes, 6.000 contatos, 4.000 prospecções, 1.500 negociações, 3.000 propostas — exatos",
    primeira.clientes === 2000 &&
      primeira.contatos === 6000 &&
      primeira.leads === 4000 &&
      primeira.negociacoes === 1500 &&
      primeira.propostas === 3000,
    JSON.stringify(primeira),
  );

  const clientesIds = (
    await prisma.cliente.findMany({ where: { nome: { startsWith: TAG } }, select: { id: true } })
  ).map((c) => c.id);
  const atividades1 = await prisma.atividade.count({ where: { clienteId: { in: clientesIds } } });
  check("50.000 atividades", atividades1 === 50000, `${atividades1}`);

  // ── Rodar de novo: é a prova de idempotência do aceite ──
  execSync("npx tsx --tsconfig tsconfig.server.json scripts/seed-crm-volume.ts", { stdio: "pipe" });

  const segunda = await contar();
  check(
    "rodar 2× NÃO duplica — os mesmos números, byte a byte",
    JSON.stringify(segunda) === JSON.stringify(primeira),
    JSON.stringify(segunda),
  );

  const clientesIds2 = (
    await prisma.cliente.findMany({ where: { nome: { startsWith: TAG } }, select: { id: true } })
  ).map((c) => c.id);
  const atividades2 = await prisma.atividade.count({ where: { clienteId: { in: clientesIds2 } } });
  check("50.000 atividades continuam 50.000 depois da 2ª rodada", atividades2 === 50000, `${atividades2}`);

  console.log("\n── F6.2: integridade básica do que foi gerado ──────────────────────\n");

  const negComEstagioAlterado = await prisma.atividade.count({
    where: {
      clienteId: { in: clientesIds2 },
      metadata: { path: ["evento"], equals: "ESTAGIO_ALTERADO" },
    },
  });
  check(
    "há eventos ESTAGIO_ALTERADO reais (o que a conversão do §3.10 do dicionário lê)",
    negComEstagioAlterado > 0,
    `${negComEstagioAlterado}`,
  );

  const contratadas = await prisma.negociacao.count({
    where: { titulo: { startsWith: TAG }, estagio: "CONTRATADO", valorNegociado: { not: null } },
  });
  check("há negociações CONTRATADO com valorNegociado (o que §3.6/§3.9 medem)", contratadas > 0, `${contratadas}`);

  const propostasComDesconto = await prisma.propostaVersao.count({
    where: { proposta: { numero: { startsWith: "SEED_VOL-" } }, desconto: { not: null } },
  });
  check("há versões de proposta com desconto (o que §3.13 mede)", propostasComDesconto > 0, `${propostasComDesconto}`);

  console.log("\n── F6.5: Home/Meu Dia — queries e tempo contra a fixture da F6.2 ──\n");

  if (!base) throw new Error("log de query não ligou — algo importou lib/prisma antes da env.");

  const { r: dados, c: cHome, ms: msHome } = await contando(() => homeComercial(new Date()));
  console.log(`  Medido: homeComercial() → ${cHome.total} statements SQL em ${msHome.toFixed(0)}ms, contra 2.000 clientes / 1.500 negociações / 3.000 propostas / 50.000 atividades.`);
  check(
    `dentro do orçamento de queries (orçamento 20, medido ${cHome.total})`,
    cHome.total <= 20,
    cHome.sqls.slice(0, 5).join(" | "),
  );
  check("os 7 cards vieram preenchidos (nenhum undefined)", Object.values(dados.cards).every((v) => v !== undefined));
  check(
    "as 6 listas do Meu Dia vieram (arrays, mesmo vazios)",
    Object.values(dados.meuDia).every((l) => Array.isArray(l)),
  );

  console.log("\n── F6.5: reagendarProximaAcao — guardas ──────────────────────────\n");

  const userSmk = await prisma.user.findFirst({ select: { id: true } });
  if (!userSmk) throw new Error("nenhum usuário no banco de dev.");

  const compromissoSmk = await prisma.compromisso.create({
    data: {
      titulo: `${TAG}Reagendar`,
      inicio: new Date("2020-01-01T12:00:00.000Z"),
      criadorId: userSmk.id,
      entidadeTipo: "NEGOCIACAO",
      entidadeId: userSmk.id, // só precisa existir como string — este teste não lê a âncora
      tipo: "LIGACAO",
    },
    select: { id: true },
  });

  const novaData = new Date("2099-06-15T12:00:00.000Z");
  await reagendarProximaAcao({ compromissoId: compromissoSmk.id, novoInicio: novaData });
  const depoisReagendar = await prisma.compromisso.findUnique({
    where: { id: compromissoSmk.id },
    select: { inicio: true },
  });
  check(
    "reagendar move `inicio` para a nova data",
    depoisReagendar?.inicio.getTime() === novaData.getTime(),
  );

  await prisma.compromisso.update({
    where: { id: compromissoSmk.id },
    data: { concluidoEm: new Date() },
  });
  let recusouConcluida = false;
  try {
    await reagendarProximaAcao({ compromissoId: compromissoSmk.id, novoInicio: new Date() });
  } catch (e) {
    recusouConcluida = /já foi concluída/i.test((e as Error).message);
  }
  check("reagendar uma ação já concluída é recusado", recusouConcluida);

  let recusouInexistente = false;
  try {
    await reagendarProximaAcao({ compromissoId: "id-que-nao-existe", novoInicio: new Date() });
  } catch {
    recusouInexistente = true;
  }
  check("reagendar compromisso inexistente é recusado", recusouInexistente);

  await prisma.compromisso.delete({ where: { id: compromissoSmk.id } }).catch(() => {});

  console.log("\n── F6.5: resumoComercial() usa valorVersao (líquido), não itens crus ──\n");

  const clienteResumo = await prisma.cliente.create({
    data: { nome: `${TAG}ClienteResumo` },
    select: { id: true },
  });
  const propostaResumo = await prisma.proposta.create({
    data: {
      ano: new Date().getFullYear(),
      sequencial: 9_999_001,
      numero: `${TAG}RESUMO-9999001`,
      titulo: `${TAG}PropostaResumo`,
      clienteId: clienteResumo.id,
      status: "aceita",
      token: `${TAG.toLowerCase()}resumo`,
      autorId: userSmk.id,
      aceitaEm: new Date(),
      itens: { create: { disciplinaTextoLegado: "x", valor: 10000, ordem: 1 } },
      versoes: {
        create: {
          numero: 1,
          snapshot: {},
          autorId: userSmk.id,
          valorOriginal: 10000,
          desconto: 2000,
          valorVersao: 8000,
          status: "aceita",
        },
      },
    },
    select: { id: true },
  });
  const resumoAntes = await resumoComercial();
  // Prova direta: soma manual das versões vigentes ACEITAS no mês bate com `realizado`. Se a
  // function somasse `itens.valor` cru (o bug pré-F6.5), esta proposta sozinha já divergiria em
  // 2.000 (o desconto que ela tem e a soma crua ignoraria).
  const hojeSmk = new Date();
  const aceitasDoMes = await prisma.proposta.findMany({
    where: {
      status: "aceita",
      // MESMO recorte de `resumoComercial` (`ini`..`fim`, fim = último dia do mês 23:59:59) — sem
      // o teto, propostas sintéticas do F6.2 com `aceitaEm` caindo no mês seguinte (criadoEm perto
      // do fim do mês + 3..30 dias) inflam a soma manual além do que a function calcula certo.
      aceitaEm: {
        gte: new Date(hojeSmk.getFullYear(), hojeSmk.getMonth(), 1),
        lte: new Date(hojeSmk.getFullYear(), hojeSmk.getMonth() + 1, 0, 23, 59, 59),
      },
    },
    select: { versoes: { select: { numero: true, valorVersao: true } } },
  });
  const somaEsperada = aceitasDoMes.reduce((s, p) => {
    const vig = p.versoes.reduce((mv, v) => (v.numero > (mv?.numero ?? -1) ? v : mv), p.versoes[0]);
    return s + (vig ? Number(vig.valorVersao) : 0);
  }, 0);
  check(
    "realizado bate com a soma manual de valorVersao (vigente) das aceitas do mês",
    resumoAntes.realizado === somaEsperada,
    `${resumoAntes.realizado} vs ${somaEsperada}`,
  );

  await prisma.propostaVersao.deleteMany({ where: { propostaId: propostaResumo.id } });
  await prisma.propostaItem.deleteMany({ where: { propostaId: propostaResumo.id } });
  await prisma.proposta.delete({ where: { id: propostaResumo.id } });
  await prisma.cliente.delete({ where: { id: clienteResumo.id } });

  console.log(`\n${ok ? "✔ Fase 6: tudo verde." : "✖ Fase 6: há falhas acima."}`);
  console.log(
    "\n(O volume sintético FICA no banco — é a fixture das próximas tarefas da Fase 6. Não foi limpo de propósito.)",
  );
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
