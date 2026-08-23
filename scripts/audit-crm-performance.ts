/**
 * F6.11 — medição reproduzível dos cinco caminhos críticos do CRM contra a fixture da F6.2.
 *
 * Este script é somente leitura. Conta statements SQL emitidos pelo Prisma e usa a mediana de
 * três execuções aquecidas para reduzir o ruído do relógio. A quantidade de queries é a prova
 * determinística contra N+1; o tempo é diagnóstico local e deve ser registrado junto do volume.
 *
 * Uso: npm run audit:crm-performance
 */
process.env.PRISMA_LOG_QUERIES = "1";

/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");
const { empresa360 } =
  require("../src/modules/comercial/empresa-360/queries") as typeof import("../src/modules/comercial/empresa-360/queries");
const { funilProspeccao, funilNegociacao, homeComercial } =
  require("../src/modules/comercial/queries") as typeof import("../src/modules/comercial/queries");
const { inteligenciaComercial } =
  require("../src/modules/comercial/inteligencia/queries") as typeof import("../src/modules/comercial/inteligencia/queries");
const { lerFiltrosInteligencia } =
  require("../src/modules/comercial/inteligencia/filtros") as typeof import("../src/modules/comercial/inteligencia/filtros");
/* eslint-enable @typescript-eslint/no-require-imports */

type EventoQuery = { query: string; duration: number };
type Amostra = { statements: number; ms: number; sqlMs: number };

const base = (globalThis as {
  __prismaBase?: { $on: (evento: "query", cb: (e: EventoQuery) => void) => void };
}).__prismaBase;

let coletor: EventoQuery[] | null = null;
base?.$on("query", (evento) => {
  if (!coletor || /^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(evento.query)) return;
  coletor.push(evento);
});

async function umaAmostra<T>(fn: () => Promise<T>): Promise<Amostra> {
  const eventos: EventoQuery[] = [];
  coletor = eventos;
  const inicio = performance.now();
  try {
    await fn();
    const ms = performance.now() - inicio;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      statements: eventos.length,
      ms,
      sqlMs: eventos.reduce((soma, evento) => soma + evento.duration, 0),
    };
  } finally {
    coletor = null;
  }
}

async function medir<T>(nome: string, fn: () => Promise<T>) {
  await umaAmostra(fn);
  const amostras: Amostra[] = [];
  for (let i = 0; i < 3; i++) amostras.push(await umaAmostra(fn));
  amostras.sort((a, b) => a.ms - b.ms);
  const mediana = amostras[1];
  return { fluxo: nome, ...mediana };
}

async function main() {
  if (!base) throw new Error("PRISMA_LOG_QUERIES precisa ser ligado antes de carregar o client.");

  const empresa = await prisma.cliente.findFirst({
    where: { nome: { startsWith: "SEED_VOL_" } },
    orderBy: { nome: "asc" },
    select: { id: true },
  });
  if (!empresa) throw new Error("Fixture ausente. Rode `npm run seed:crm-volume` antes da auditoria.");

  const agora = new Date();
  const filtrosInteligencia = lerFiltrosInteligencia({});
  const resultados = [];
  resultados.push(await medir("Empresa 360", () => empresa360(empresa.id)));
  resultados.push(await medir("Kanban de prospecção", () => funilProspeccao()));
  resultados.push(await medir("Kanban de negociação", () => funilNegociacao({})));
  resultados.push(await medir("Home / Meu Dia", () => homeComercial(agora)));
  resultados.push(
    await medir("Inteligência Comercial", () => inteligenciaComercial(filtrosInteligencia, agora)),
  );

  const volume = {
    clientes: await prisma.cliente.count({ where: { nome: { startsWith: "SEED_VOL_" } } }),
    leads: await prisma.lead.count({ where: { nome: { startsWith: "SEED_VOL_" } } }),
    negociacoes: await prisma.negociacao.count({ where: { titulo: { startsWith: "SEED_VOL_" } } }),
    propostas: await prisma.proposta.count({ where: { numero: { startsWith: "SEED_VOL-" } } }),
  };
  const ids = (
    await prisma.cliente.findMany({
      where: { nome: { startsWith: "SEED_VOL_" } },
      select: { id: true },
    })
  ).map((cliente) => cliente.id);
  const atividades = await prisma.atividade.count({ where: { clienteId: { in: ids } } });

  console.log(`\nVolume: ${JSON.stringify({ ...volume, atividades })}`);
  console.table(
    resultados.map((r) => ({
      fluxo: r.fluxo,
      statements: r.statements,
      "mediana total (ms)": Number(r.ms.toFixed(1)),
      "tempo SQL (ms)": Number(r.sqlMs.toFixed(1)),
    })),
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

export {};
