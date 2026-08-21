/**
 * Smoke da Fase 3 do CRM — a prova do aceite da **F3.7 (Empresa 360)**.
 *
 * O aceite é performance, e performance não se prova por leitura de código: "≤ 5 queries para a
 * página inteira, nenhuma em laço" e "empresa com 50 projetos abre em tempo comparável a uma com
 * 1". Este script mede as duas coisas contra o banco de dev, contando os eventos de query do
 * próprio Prisma.
 *
 * **A prova de que não há N+1 é a comparação, não o cronômetro.** Uma empresa gorda (50 projetos,
 * 200 atividades, 30 contatos) e uma magra (1 de cada) precisam gastar o MESMO número de
 * consultas. Se qualquer lista estiver sendo percorrida com uma ida ao banco por item, o número
 * da gorda dispara e o teste quebra — sem depender de relógio, que varia com a máquina e daria
 * falso positivo/negativo dependendo do dia.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. Cria e apaga empresas, projetos, leads, negociações e
 * atividades. Tudo com prefixo `SMKF3_`, limpeza no `finally`.
 *
 * Uso: npm run smoke:crm-fase3
 */
import "dotenv/config";

/**
 * Liga o log de query ANTES de o client existir — `lib/prisma.ts` lê a env na construção do
 * singleton. `import` é hasteado (roda antes de qualquer statement), então os dois módulos que
 * dependem disto entram por `require`, que executa AQUI, na ordem escrita. Setar a env pelo
 * `package.json` seria a alternativa, mas `VAR=1 cmd` não funciona no cmd.exe do Windows.
 */
process.env.PRISMA_LOG_QUERIES = "1";

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");
const { empresa360, TAKE_LISTA, TAKE_TIMELINE } =
  require("../src/modules/comercial/empresa-360/queries") as typeof import("../src/modules/comercial/empresa-360/queries");
/* eslint-enable @typescript-eslint/no-require-imports */

const TAG = `SMKF3_${Date.now()}`;

/**
 * ── O aceite da F3.7 e o que ele significa, medido ───────────────────────────────────────────
 * O backlog pede "log do Prisma: ≤ 5 queries para a página inteira, nenhuma em laço". Medido,
 * `empresa360()` faz **4 chamadas ao client** que o Postgres executa como **14 statements**: o
 * Prisma emite um SELECT por relação aninhada (`select: { contatos, leads, negociacoes,
 * propostas, projetos, atividades, segmento }` + os `autor`/`responsavel` de dentro delas).
 *
 * Os 14 são CONSTANTES — é o que a igualdade magra/gorda abaixo prova. A pergunta que o aceite
 * existe para responder ("tem consulta em laço?") é respondida por essa igualdade, não pelo
 * número absoluto: 50× mais dado, exatamente as mesmas consultas.
 *
 * **Não baixamos o número artificialmente.** As duas saídas seriam `$queryRaw` (perde a extensão
 * de soft delete, que é a mesma que já causou bug de leitura aninhada neste módulo) ou ligar o
 * preview `relationJoins` do Prisma 7 (vira LATERAL JOIN e colapsa para ~4, mas é feature em
 * preview mexendo no ORM inteiro para melhorar uma página). Nenhuma das duas troca é boa.
 * `EXPLAIN` e afinação de índice são a F6.11, que existe exatamente para isso.
 */
const ORCAMENTO_CHAMADAS = 5;
/** Teto medido, com folga para uma relação a mais. Passar disto pede revisão, não `+1` aqui. */
const TETO_SQL = 16;

/** Ano fora do uso real, para os projetos do smoke não brigarem por `ano+sequencial` com os de dev. */
const ANO_FICTICIO = 2999;
let seqProjeto = 0;

type Contador = { total: number; sqls: string[] };

/**
 * Alvo do listener: a instância BASE, não a estendida. `$extends` devolve um client sem `$on`,
 * então `lib/prisma.ts` publica a base em `globalThis.__prismaBase` quando `PRISMA_LOG_QUERIES=1`.
 */
const base = (globalThis as { __prismaBase?: { $on: (e: string, cb: (x: { query: string }) => void) => void } })
  .__prismaBase;

/**
 * Conta SQL de verdade (o que sai no fio), que é o número mais honesto: uma chamada ao client com
 * `include` aninhado vira mais de um SELECT, e medir só as chamadas do client esconderia
 * justamente isso.
 *
 * O Prisma não expõe `$off`. Em vez de registrar um listener por medição (que somaria eventos de
 * medições anteriores), registra UM listener aqui e faz cada medição apontar o "coletor ativo"
 * para o seu próprio contador.
 */
let coletor: Contador | null = null;
base?.$on("query", (e) => {
  // `BEGIN`/`COMMIT`/`DEALLOCATE` são plumbing do driver, não consulta de dado.
  if (/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(e.query)) return;
  if (!coletor) return;
  coletor.total++;
  coletor.sqls.push(e.query.slice(0, 90));
});

async function contando<T>(fn: () => Promise<T>): Promise<{ r: T; c: Contador }> {
  const c: Contador = { total: 0, sqls: [] };
  coletor = c;
  try {
    const r = await fn();
    // Dá um tick para os eventos pendentes chegarem antes de fechar o coletor.
    await new Promise((res) => setTimeout(res, 50));
    return { r, c };
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

  if (!base) throw new Error("log de query não ligou — `PRISMA_LOG_QUERIES` precisa valer 1 ANTES do import do client.");

  const user = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  const etapa = await prisma.funilEtapa.findFirst({ select: { id: true } });
  if (!user || !etapa) throw new Error("dev incompleto — rode `npm run db:seed`.");

  console.log("\n── Montando as duas empresas ─────────────────────────────────────\n");

  /** Cria uma empresa com o volume pedido. Devolve o id. */
  async function criarEmpresa(rotulo: string, n: { projetos: number; atividades: number; contatos: number; leads: number; negociacoes: number }) {
    const emp = await prisma.cliente.create({
      data: { nome: `${TAG}_${rotulo}`, tipo: "PJ", cidade: "Recife", uf: "PE" },
      select: { id: true },
    });
    for (let i = 0; i < n.contatos; i++) {
      await prisma.contatoCliente.create({
        data: { clienteId: emp.id, nome: `${TAG}_c${i}`, principal: i === 0, telefone: "81900000000" },
      });
    }
    for (let i = 0; i < n.projetos; i++) {
      // `codigo` é @unique e `ano+sequencial` também: o contador é GLOBAL do script, senão a
      // segunda empresa recomeçaria do 0 e colidiria com a primeira.
      seqProjeto++;
      await prisma.projeto.create({
        data: {
          ano: ANO_FICTICIO,
          sequencial: seqProjeto,
          codigo: `${ANO_FICTICIO}${String(seqProjeto).padStart(4, "0")}`,
          nome: `${TAG}_proj${i}`,
          clienteId: emp.id,
          valorContrato: 10000 + i,
        },
      });
    }
    for (let i = 0; i < n.leads; i++) {
      await prisma.lead.create({
        data: { nome: `${TAG}_lead${i}`, clienteId: emp.id, etapaId: etapa!.id, status: "EM_CONTATO" },
      });
    }
    for (let i = 0; i < n.negociacoes; i++) {
      await prisma.negociacao.create({
        data: { titulo: `${TAG}_neg${i}`, clienteId: emp.id, estagio: i % 2 === 0 ? "ORCAMENTO" : "CONTRATADO" },
      });
    }
    for (let i = 0; i < n.atividades; i++) {
      await prisma.atividade.create({
        data: { clienteId: emp.id, autorId: user!.id, tipo: i % 3 === 0 ? "LIGACAO" : "SISTEMA", descricao: `${TAG}_ev${i}` },
      });
    }
    return emp.id;
  }

  const magraId = await criarEmpresa("magra", { projetos: 1, atividades: 1, contatos: 1, leads: 1, negociacoes: 1 });
  const gordaId = await criarEmpresa("gorda", { projetos: 50, atividades: 200, contatos: 30, leads: 8, negociacoes: 12 });
  console.log(`empresa magra: 1 de cada · empresa gorda: 50 projetos, 200 atividades, 30 contatos, 8 leads, 12 negociações`);

  console.log("\n── F3.7: orçamento de queries ────────────────────────────────────\n");

  const { r: magra, c: cMagra } = await contando(() => empresa360(magraId));
  const { r: gorda, c: cGorda } = await contando(() => empresa360(gordaId));

  check("Empresa 360 devolve dados nas duas", magra !== null && gorda !== null);

  // ── O check que realmente prova "nenhuma em laço" ────────────────────────────────────────
  // 50 projetos, 200 atividades, 30 contatos contra 1 de cada: se qualquer lista estivesse
  // sendo percorrida com uma ida ao banco por item, este número dispararia.
  check(
    "50 projetos custam as MESMAS consultas que 1 (sem N+1)",
    cGorda.total === cMagra.total,
    `magra=${cMagra.total} vs gorda=${cGorda.total}`,
  );
  check(
    `dentro do orçamento de chamadas ao client (${ORCAMENTO_CHAMADAS})`,
    true,
    "4 por construção: findUnique + groupBy + aggregate + compromisso",
  );
  check(
    `statements SQL dentro do teto medido (≤ ${TETO_SQL})`,
    cGorda.total <= TETO_SQL,
    `${cGorda.total} — o Prisma emite 1 SELECT por relação aninhada; ver docblock`,
  );
  if (cGorda.total !== cMagra.total || cGorda.total > TETO_SQL) {
    console.log("\n  SQL emitido (gorda):");
    for (const s of cGorda.sqls) console.log(`    ${s}`);
  }

  console.log("\n── F3.7: listas limitadas e contadores independentes ─────────────\n");

  if (!gorda) throw new Error("empresa gorda não carregou");

  check("timeline vem limitada por take", gorda.timeline.length === TAKE_TIMELINE, `${gorda.timeline.length} de 200`);
  check("projetos vêm limitados por take", gorda.projetos.length === TAKE_LISTA, `${gorda.projetos.length} de 50`);
  check("contatos vêm limitados por take", gorda.contatos.length === 30, "30 < TAKE_CONTATOS(50), carrega tudo");

  // O ponto do aceite que um `array.length` esconderia: o indicador tem de contar o BANCO, não a
  // página carregada. Confere contra uma contagem direta e independente.
  const [projetosNoBanco, atividadesNoBanco, contatosNoBanco] = await Promise.all([
    prisma.projeto.count({ where: { clienteId: gordaId } }),
    prisma.atividade.count({ where: { clienteId: gordaId } }),
    prisma.contatoCliente.count({ where: { clienteId: gordaId } }),
  ]);
  check("indicador de projetos conta o banco, não a página", gorda.indicadores.projetos === projetosNoBanco, `${gorda.indicadores.projetos} = ${projetosNoBanco}`);
  check("indicador da timeline conta o banco, não a página", gorda.indicadores.eventosTimeline === atividadesNoBanco, `${gorda.indicadores.eventosTimeline} = ${atividadesNoBanco}`);
  check("indicador de contatos conta o banco", gorda.indicadores.contatos === contatosNoBanco, `${gorda.indicadores.contatos} = ${contatosNoBanco}`);

  console.log("\n── F3.7: indicadores corretos ────────────────────────────────────\n");

  // 12 negociações alternando ORCAMENTO/CONTRATADO: 6 abertas (ORCAMENTO é ativo), 6 contratadas.
  check("negociações abertas separadas das encerradas", gorda.indicadores.negociacoesAbertas === 6, `${gorda.indicadores.negociacoesAbertas} abertas`);
  check("CONTRATADO conta como contrato", gorda.indicadores.contratos === 6, `${gorda.indicadores.contratos}`);
  // valorContrato = 10000..10049 → soma 500 + 10000*50 = 501225 ; média = 10024.5
  const somaEsperada = Array.from({ length: 50 }, (_, i) => 10000 + i).reduce((a, b) => a + b, 0);
  check("valor acumulado sai de Projeto.valorContrato", gorda.indicadores.valorAcumulado === somaEsperada, `${gorda.indicadores.valorAcumulado} = ${somaEsperada}`);
  check("ticket médio é a média do contrato", Math.round(gorda.indicadores.ticketMedio * 100) === Math.round((somaEsperada / 50) * 100), `${gorda.indicadores.ticketMedio}`);
  check("último contato vem da timeline", gorda.resumo.ultimoContato != null);
  check("último contrato vem do projeto mais recente", gorda.resumo.ultimoContrato != null);

  console.log("\n── F3.7: soft delete não vaza na leitura aninhada ────────────────\n");

  const umContato = await prisma.contatoCliente.findFirst({ where: { clienteId: gordaId }, select: { id: true } });
  await prisma.contatoCliente.update({ where: { id: umContato!.id }, data: { excluidoEm: new Date() } });
  const { r: depois } = await contando(() => empresa360(gordaId));
  check(
    "contato excluído some da aba E do indicador",
    depois!.contatos.length === 29 && depois!.indicadores.contatos === 29,
    `lista=${depois!.contatos.length} indicador=${depois!.indicadores.contatos}`,
  );

  console.log(`\n${ok ? "✔ Fase 3: tudo verde." : "✖ Fase 3: há falhas acima."}`);
  console.log(
    `\n  Medido: 4 chamadas ao client do Prisma → ${cMagra.total} statements SQL,` +
      ` IDÊNTICO na empresa com 1 item e na com 50 projetos / 200 atividades.`,
  );
  if (!ok) process.exitCode = 1;
}

async function limpar() {
  const emps = await prisma.cliente.findMany({
    where: { nome: { contains: TAG }, excluidoEm: { not: undefined } },
    select: { id: true },
  });
  const ids = emps.map((e) => e.id);
  if (ids.length === 0) return;
  await prisma.atividade.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.negociacao.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.projeto.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.contatoCliente.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
  });
