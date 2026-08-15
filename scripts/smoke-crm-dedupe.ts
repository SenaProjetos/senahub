/**
 * Smoke da fusão de clientes duplicados (F1.14).
 *
 * Por que existe: a fusão MOVE PROJETO entre empresas. Em produção são 31 projetos para 46
 * clientes — quase todo cliente tem obra vinculada, então uma fusão errada leva projeto de obra
 * para a empresa errada. lint/tsc/vitest não alcançam isso: só se prova com Prisma real,
 * transação real e as 11 tabelas que apontam para `cliente`.
 *
 * O check mais importante daqui NÃO é o do critério de aceite — é o §1: enumerar as FKs reais
 * do banco e falhar se aparecer alguma que a fusão não trata. Sem ele, a lista em `fusao.ts`
 * vira um retrato de hoje, e a Fase 2 (`Negociacao.clienteId`) / Fase 3 (`Atividade.clienteId`)
 * passariam despercebidas — deixando registro órfão apontando para cliente arquivado.
 *
 * Cria dados throwaway e apaga tudo no final. Seguro em dev.
 *
 * Uso: npm run smoke:crm-dedupe
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mesclarClientes, REFERENCIAS_CLIENTE } from "../src/modules/clientes/fusao";

/** Tabelas cujo total de linhas não pode mudar com uma fusão (nada é apagado). */
const TABELAS_INVARIANTES = [...new Set(REFERENCIAS_CLIENTE.map((r) => r.tabela)), "cliente"];

async function contarTudo(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABELAS_INVARIANTES) {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM "${t}"`,
    );
    out[t] = Number(r[0]?.n ?? 0);
  }
  return out;
}

async function main() {
  const tag = `SMKDEDUPE_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  // ── 1. A lista de referências cobre todas as FKs reais do banco? ──────────
  // Este é o check que impede REFERENCIAS_CLIENTE de envelhecer em silêncio.
  const fks = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'cliente'
      AND tc.table_schema = 'public'`;

  const tratadas = new Set(REFERENCIAS_CLIENTE.map((r) => `${r.tabela}.${r.coluna}`));
  // A auto-referência da própria fusão não é "dado do cliente" — é o ponteiro que ela cria.
  const naoTratadas = fks
    .map((f) => `${f.table_name}.${f.column_name}`)
    .filter((k) => k !== "cliente.fundidoEmId" && !tratadas.has(k));

  check(
    `todas as FKs para cliente estão tratadas na fusão (${fks.length} encontradas)`,
    naoTratadas.length === 0,
  );
  if (naoTratadas.length > 0) {
    console.log(`      ⚠ NÃO TRATADAS: ${naoTratadas.join(", ")}`);
    console.log(`      → adicione em REFERENCIAS_CLIENTE e no mesclarClientes (fusao.ts)`);
  }

  const antes = await contarTudo();

  // ── 2. Cenário do aceite: 2 clientes, 1 projeto em cada ──────────────────
  const sobrevivente = await prisma.cliente.create({
    data: { tipo: "PJ", nome: `${tag}_sobrevivente`, documento: null },
  });
  const absorvido = await prisma.cliente.create({
    data: { tipo: "PJ", nome: `${tag}_absorvido`, documento: "11222333000199" },
  });

  const anoAtual = new Date().getFullYear();
  const seqBase = Date.now() % 100000;
  const projA = await prisma.projeto.create({
    data: {
      ano: anoAtual, sequencial: seqBase, codigo: `${tag}A`,
      tipo: "particular", nome: `${tag}_projetoA`, clienteId: sobrevivente.id,
    },
  });
  const projB = await prisma.projeto.create({
    data: {
      ano: anoAtual, sequencial: seqBase + 1, codigo: `${tag}B`,
      tipo: "particular", nome: `${tag}_projetoB`, clienteId: absorvido.id,
    },
  });
  const contato = await prisma.contatoCliente.create({
    data: { clienteId: absorvido.id, nome: `${tag}_contato` },
  });

  // ── 3. Funde ─────────────────────────────────────────────────────────────
  const resultado = await mesclarClientes(sobrevivente.id, absorvido.id);
  console.log(`      movidos: ${JSON.stringify(resultado.movidos)}`);

  const projetosDoSobrevivente = await prisma.projeto.findMany({
    where: { clienteId: sobrevivente.id },
    select: { id: true },
  });
  check(
    "os 2 projetos ficaram no sobrevivente",
    projetosDoSobrevivente.length === 2 &&
      projetosDoSobrevivente.some((p) => p.id === projA.id) &&
      projetosDoSobrevivente.some((p) => p.id === projB.id),
  );

  const contatoDepois = await prisma.contatoCliente.findUniqueOrThrow({ where: { id: contato.id } });
  check("contato migrou para o sobrevivente", contatoDepois.clienteId === sobrevivente.id);

  const absorvidoDepois = await prisma.cliente.findUniqueOrThrow({ where: { id: absorvido.id } });
  check("absorvido CONTINUA EXISTINDO (nada é apagado)", !!absorvidoDepois);
  check("absorvido ficou arquivado", absorvidoDepois.ativo === false);
  check("absorvido aponta para o sobrevivente", absorvidoDepois.fundidoEmId === sobrevivente.id);
  check("data da fusão registrada", !!absorvidoDepois.fusaoEm);
  check(
    "absorvido não tem mais projeto",
    (await prisma.projeto.count({ where: { clienteId: absorvido.id } })) === 0,
  );

  // ── 4. Nada foi apagado: total de linhas idêntico ────────────────────────
  const depois = await contarTudo();
  const divergentes = TABELAS_INVARIANTES.filter((t) => {
    // `cliente`, `projeto` e `contato_cliente` cresceram pelos dados que ESTE smoke criou.
    const criadosAqui = t === "cliente" ? 2 : t === "projeto" ? 2 : t === "contato_cliente" ? 1 : 0;
    return depois[t] !== antes[t] + criadosAqui;
  });
  check(
    "nenhuma linha foi apagada em nenhuma das tabelas envolvidas",
    divergentes.length === 0,
  );
  if (divergentes.length > 0) {
    for (const t of divergentes) console.log(`      ⚠ ${t}: antes=${antes[t]} depois=${depois[t]}`);
  }

  // ── 5. Refundir é recusado ───────────────────────────────────────────────
  let recusouRefusao = false;
  try {
    await mesclarClientes(sobrevivente.id, absorvido.id);
  } catch {
    recusouRefusao = true;
  }
  check("fundir de novo o mesmo cliente é recusado", recusouRefusao);

  let recusouSiMesmo = false;
  try {
    await mesclarClientes(sobrevivente.id, sobrevivente.id);
  } catch {
    recusouSiMesmo = true;
  }
  check("fundir um cliente com ele mesmo é recusado", recusouSiMesmo);

  // ── 6. Limpeza ───────────────────────────────────────────────────────────
  // Ordem: o absorvido aponta para o sobrevivente (FK), então some primeiro.
  await prisma.projeto.deleteMany({ where: { id: { in: [projA.id, projB.id] } } });
  await prisma.contatoCliente.deleteMany({ where: { id: contato.id } });
  await prisma.cliente.delete({ where: { id: absorvido.id } });
  await prisma.cliente.delete({ where: { id: sobrevivente.id } });

  const restou = await prisma.cliente.count({ where: { nome: { startsWith: tag } } });
  check("limpeza completa", restou === 0);

  console.log(ok ? "\nSmoke da fusão de clientes: OK" : "\nSmoke da fusão de clientes: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
