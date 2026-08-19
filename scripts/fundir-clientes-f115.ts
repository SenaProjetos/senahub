/**
 * F1.15 — Fusão dos grupos de `Cliente` duplicado em produção.
 *
 * Executa, com confirmação humana, a fusão dos grupos levantados em `docs/crm/03-migracao.md` §4.
 * A ação em si é a `mesclarClientes` da F1.14 (`src/modules/clientes/fusao.ts`) — este script NÃO
 * reimplementa a movimentação, só decide os pares, confere as premissas e registra a auditoria.
 *
 * ── Por que os IDs são explícitos, e não resolvidos por nome ───────────────────────────────
 * Fundir errado move obra para a empresa errada (§4). Resolver o grupo por `LIKE` no nome em
 * tempo de execução deixaria o alvo mudar em silêncio caso alguém cadastre um cliente parecido
 * entre o dry-run e o `--gravar`. Os IDs abaixo foram conferidos à mão contra produção em
 * 2026-08-19; o script REVALIDA nome e documento de cada um antes de tocar em qualquer coisa e
 * aborta na primeira divergência.
 *
 * ── Os 3 grupos e por que cada sobrevivente venceu ─────────────────────────────────────────
 * Critério de `03-migracao.md` §4, nesta ordem: (1) mais vínculos — projetos, propostas,
 * lançamentos (lead NÃO conta aqui); (2) documento preenchido; (3) mais antigo.
 *
 * 1. MADANO (2 registros) — sobrevive o de 2026-07-17, que tem o projeto `260028 · AVCB -
 *    SMERALDA DEL MARE`. Vence pelo critério (1): o outro só tem um lead, e lead não entra na
 *    contagem de vínculos. O critério (3) confirma (é o mais antigo). O lead absorvido tem
 *    `origemDetalhada = "SMERALDA DEL MARE"`, o mesmo empreendimento do projeto — é a mesma
 *    empresa, conferido.
 *
 * 2. ZÁPHIS (4 registros — um a mais do que o §4 previa) — sobrevive `Zaphis Inc LTDA`
 *    (CNPJ 40.817.865/0001-60), que vence os TRÊS critérios: 2 projetos, tem documento, e é o
 *    mais antigo (2026-07-02). O §4 só enxergou os 3 `Záphis Incorporadora` vazios porque a
 *    normalização de nome não casa "Inc" com "Incorporadora"; o 4º registro apareceu na
 *    conferência manual. Que são a mesma empresa foi decidido pelo usuário em 2026-08-19, com
 *    a evidência do lead "EDIF. ISA BEACH" (num dos vazios) contra o projeto `260030 · ISA
 *    BEACH 2` (no `Zaphis Inc LTDA`).
 *
 * 3. NOMINAL (2 registros) — sobrevive `Nominal Engenharia LTDA` (CNPJ 66403270000151) pelo
 *    critério (2). ⚠️ **Aqui o critério (1) apontaria para o outro**: quem tem o projeto
 *    `260031 · SESI ARAÇUAI - FIEMG` é o `NOMINAL ENGENHARIA` sem documento, que será absorvido.
 *    A inversão é deliberada e está escrita no §4 ("no grupo nominal engenharia o critério (2)
 *    decide") — é justamente esta fusão que PREENCHE o documento que faltava, destravando a
 *    F1.16. Consequência prática: o projeto 260031 muda de cliente. É esperado.
 *
 * ── O que o script prova ───────────────────────────────────────────────────────────────────
 * Antes e depois ele tira um retrato de `projeto.id → projeto.clienteId` INTEIRO (não só dos
 * grupos) e compara. Qualquer projeto que trocar de cliente fora dos pares planejados faz o
 * script gritar. É a prova exigida pelo aceite, e vale mais do que conferir só a contagem: a
 * contagem de projetos continuaria 32 mesmo se um projeto fosse parar na empresa errada.
 *
 * ── Auditoria ──────────────────────────────────────────────────────────────────────────────
 * Uma linha de `AuditLog` por fusão (5 no total, não 3 — o aceite falava em 3 supondo um par por
 * grupo, mas Záphis absorve 3). Gravadas com `prisma.auditLog.create` direto, e NÃO com
 * `logAudit()`: aquele helper chama `getClientIp()` → `headers()` do Next, que lança fora de uma
 * request; como a chamada está dentro do try/catch do próprio `logAudit`, a linha de auditoria
 * seria engolida em silêncio e o script alegaria um registro que não existe.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/fundir-clientes-f115.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/fundir-clientes-f115.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mesclarClientes, REFERENCIAS_CLIENTE } from "../src/modules/clientes/fusao";

const GRAVAR = process.argv.includes("--gravar");

type Alvo = { id: string; nome: string; documento: string | null };
type Grupo = { grupo: string; sobrevivente: Alvo; absorvidos: Alvo[]; motivo: string };

/** Conferidos à mão contra produção em 2026-08-19. Revalidados em tempo de execução. */
const GRUPOS: Grupo[] = [
  {
    grupo: "MADANO",
    sobrevivente: { id: "cmrp0p8g1014etwnunrsyglg5", nome: "MADANO", documento: null },
    absorvidos: [{ id: "cms38k67100cws0nu2t845n83", nome: "MADANO", documento: null }],
    motivo: "critério (1) mais vínculos: tem o projeto 260028; confirmado por (3) mais antigo",
  },
  {
    grupo: "ZÁPHIS",
    sobrevivente: {
      id: "cmr3kqb57006hywnu1x3z4t3j",
      nome: "Zaphis Inc LTDA",
      documento: "40.817.865/0001-60",
    },
    absorvidos: [
      { id: "cms38knd200d0s0nu2wc5759x", nome: "Záphis Incorporadora", documento: null },
      { id: "cms38kq6r00d2s0nushj7z88v", nome: "Záphis Incorporadora", documento: null },
      { id: "cms38kssi00d4s0nucev5930y", nome: "Záphis Incorporadora", documento: null },
    ],
    motivo: "vence os 3 critérios (2 projetos, tem CNPJ, mais antigo); mesma empresa confirmada pelo usuário",
  },
  {
    grupo: "NOMINAL ENGENHARIA",
    sobrevivente: {
      id: "cmsqawghw01if74nueumptdh3",
      nome: "Nominal Engenharia LTDA",
      documento: "66403270000151",
    },
    absorvidos: [
      { id: "cmshtgi25077vb0nuzn126dw6", nome: "NOMINAL ENGENHARIA", documento: null },
    ],
    motivo: "critério (2) documento preenchido — inverte o (1) de propósito (§4); é o que preenche o CNPJ para a F1.16",
  },
];

type RetratoProjeto = Map<string, string | null>;

async function retratoDosProjetos(): Promise<RetratoProjeto> {
  const linhas = await prisma.$queryRawUnsafe<{ id: string; clienteId: string | null }[]>(
    `SELECT id, "clienteId" FROM projeto`,
  );
  return new Map(linhas.map((l) => [l.id, l.clienteId]));
}

async function contagens() {
  const [c] = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(`
    SELECT (SELECT count(*) FROM cliente) AS cliente_linhas,
           (SELECT count(*) FROM cliente WHERE "fundidoEmId" IS NULL) AS cliente_nao_fundido,
           (SELECT count(*) FROM cliente WHERE "excluidoEm" IS NULL) AS cliente_nao_excluido,
           (SELECT count(*) FROM projeto) AS projeto,
           (SELECT count(*) FROM lead) AS lead,
           (SELECT count(*) FROM proposta) AS proposta,
           (SELECT count(*) FROM lancamento) AS lancamento,
           (SELECT count(*) FROM contato_cliente) AS contato_cliente,
           (SELECT count(*) FROM anexo_lead) AS anexo_lead
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

/** Aborta se o banco não estiver no estado que os IDs hardcoded pressupõem. */
async function conferirPremissas(): Promise<void> {
  const erros: string[] = [];

  for (const g of GRUPOS) {
    for (const alvo of [g.sobrevivente, ...g.absorvidos]) {
      const [row] = await prisma.$queryRawUnsafe<
        { nome: string; documento: string | null; fundidoEmId: string | null }[]
      >(`SELECT nome, documento, "fundidoEmId" FROM cliente WHERE id = $1`, alvo.id);

      if (!row) {
        erros.push(`[${g.grupo}] cliente ${alvo.id} ("${alvo.nome}") NÃO EXISTE neste banco`);
        continue;
      }
      if (row.nome !== alvo.nome) {
        erros.push(`[${g.grupo}] ${alvo.id}: nome esperado "${alvo.nome}", encontrado "${row.nome}"`);
      }
      if ((row.documento ?? null) !== alvo.documento) {
        erros.push(
          `[${g.grupo}] ${alvo.id}: documento esperado ${alvo.documento ?? "NULL"}, encontrado ${row.documento ?? "NULL"}`,
        );
      }
      if (row.fundidoEmId) {
        erros.push(`[${g.grupo}] ${alvo.id} ("${row.nome}") JÁ FOI FUNDIDO em ${row.fundidoEmId}`);
      }
    }
  }

  if (erros.length) {
    console.error("\n✖ PREMISSAS NÃO CONFEREM — nada foi tocado:\n");
    for (const e of erros) console.error(`   ${e}`);
    console.error(
      "\nOs IDs deste script foram conferidos contra produção em 2026-08-19. Se o banco mudou,\n" +
        "reconfira os grupos à mão antes de editar as constantes.\n",
    );
    process.exit(1);
  }
}

/**
 * O que cada cliente carrega hoje — é o que vai se mover.
 *
 * Percorre `REFERENCIAS_CLIENTE` INTEIRA, e não uma lista escolhida a dedo, porque foi
 * exatamente isso que o ensaio pegou: uma contagem manual de projetos/propostas/lançamentos/
 * contatos/leads não mostrava as **7 linhas de `documento`** que a fusão do grupo Nominal move.
 * Confirmar uma fusão sem ver tudo que se move é assinar em branco.
 */
async function vinculosDe(clienteId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const ref of REFERENCIAS_CLIENTE) {
    const tabela = ref.tabela === "user" ? '"user"' : `"${ref.tabela}"`;
    const [r] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM ${tabela} WHERE "${ref.coluna}" = $1`,
      clienteId,
    );
    if (Number(r.n) > 0) out[ref.tabela] = Number(r.n);
  }
  return out;
}

function resumo(v: Record<string, number>): string {
  const partes = Object.entries(v).map(([k, n]) => `${k}=${n}`);
  return partes.length ? partes.join(" ") : "(nenhum vínculo)";
}

async function nomesDosProjetos(clienteId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ codigo: string | null; nome: string }[]>(
    `SELECT codigo, nome FROM projeto WHERE "clienteId" = $1 ORDER BY codigo`,
    clienteId,
  );
  return rows.map((r) => `${r.codigo ?? "?"} · ${r.nome}`);
}

async function main() {
  console.log(`\n=== F1.15 — fusão de clientes duplicados (${GRAVAR ? "GRAVAR" : "DRY-RUN"}) ===\n`);

  await conferirPremissas();
  console.log("✓ Premissas conferidas: os 8 clientes existem, com nome/documento esperados, nenhum já fundido.\n");

  const antes = await contagens();
  const retratoAntes = await retratoDosProjetos();

  // Quais projetos ESTÁ PREVISTO mover, para separar do que seria acidente.
  const movimentacaoPrevista = new Map<string, string>(); // projetoId → clienteId destino
  for (const g of GRUPOS) {
    for (const a of g.absorvidos) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM projeto WHERE "clienteId" = $1`,
        a.id,
      );
      for (const r of rows) movimentacaoPrevista.set(r.id, g.sobrevivente.id);
    }
  }

  console.log("── Plano ─────────────────────────────────────────────────────────────────\n");
  for (const g of GRUPOS) {
    console.log(`${g.grupo}`);
    console.log(`  motivo do sobrevivente: ${g.motivo}`);
    const vs = await vinculosDe(g.sobrevivente.id);
    const projS = await nomesDosProjetos(g.sobrevivente.id);
    console.log(
      `  SOBREVIVE  "${g.sobrevivente.nome}" [${g.sobrevivente.documento ?? "sem documento"}]  ${resumo(vs)}`,
    );
    for (const p of projS) console.log(`               · ${p}`);
    for (const a of g.absorvidos) {
      const va = await vinculosDe(a.id);
      const projA = await nomesDosProjetos(a.id);
      console.log(`  absorve    "${a.nome}" [${a.documento ?? "sem documento"}]  ${resumo(va)}`);
      for (const p of projA) console.log(`               → move: ${p}`);
    }
    console.log();
  }

  const totalAbsorvidos = GRUPOS.reduce((n, g) => n + g.absorvidos.length, 0);
  console.log("── Efeito esperado ───────────────────────────────────────────────────────\n");
  console.log(`  fusões (linhas de AuditLog):        ${totalAbsorvidos}`);
  console.log(`  cliente (linhas na tabela):         ${antes.cliente_linhas} → ${antes.cliente_linhas}  (nada é apagado)`);
  console.log(
    `  cliente não fundido:                ${antes.cliente_nao_fundido} → ${antes.cliente_nao_fundido - totalAbsorvidos}`,
  );
  console.log(`  projeto:                            ${antes.projeto} → ${antes.projeto}  (inalterado)`);
  console.log(`  projetos que mudam de cliente:      ${movimentacaoPrevista.size} (previstos, listados acima)\n`);

  if (!GRAVAR) {
    console.log("DRY-RUN — nada foi gravado. Para executar:\n");
    console.log("   tsx --tsconfig tsconfig.server.json scripts/fundir-clientes-f115.ts --gravar\n");
    return;
  }

  // ── Execução ────────────────────────────────────────────────────────────────────────────
  console.log("── Executando ────────────────────────────────────────────────────────────\n");

  // `user` NÃO tem `excluidoEm` — o soft delete de F1.17/F1.18 pegou `cliente`, `lead` e
  // `contatoCliente`, não usuários. Aqui o desligamento é `ativo = false`.
  const operador = await prisma.$queryRawUnsafe<{ id: string; name: string | null }[]>(
    `SELECT id, name FROM "user" WHERE role = 'admin' AND ativo = true ORDER BY "createdAt" LIMIT 1`,
  );
  const operadorId = operador[0]?.id ?? null;
  console.log(`  auditoria atribuída a: ${operador[0]?.name ?? "(nenhum admin encontrado — userId null)"}\n`);

  let feitas = 0;
  for (const g of GRUPOS) {
    for (const a of g.absorvidos) {
      const r = await mesclarClientes(g.sobrevivente.id, a.id);
      await prisma.auditLog.create({
        data: {
          userId: operadorId,
          modulo: "clientes",
          acao: "mesclar-clientes",
          entidade: "Cliente",
          entidadeId: g.sobrevivente.id,
          resultado: "sucesso",
          detalhe: {
            origem: "script:fundir-clientes-f115",
            tarefa: "F1.15",
            grupo: g.grupo,
            motivoSobrevivente: g.motivo,
            sobrevivente: { id: g.sobrevivente.id, nome: g.sobrevivente.nome, documento: g.sobrevivente.documento },
            absorvido: { id: a.id, nome: a.nome, documento: a.documento },
            movidos: r.movidos,
          },
          ip: null,
        },
      });
      feitas++;
      const detalhe = Object.entries(r.movidos).map(([k, n]) => `${k}=${n}`).join(" ") || "(nada a mover)";
      console.log(`  ✓ [${g.grupo}] "${a.nome}" → "${g.sobrevivente.nome}"  ${detalhe}`);
    }
  }

  // ── Verificação ─────────────────────────────────────────────────────────────────────────
  console.log("\n── Verificação ───────────────────────────────────────────────────────────\n");
  const depois = await contagens();
  const retratoDepois = await retratoDosProjetos();

  const problemas: string[] = [];

  if (depois.projeto !== antes.projeto) {
    problemas.push(`projeto mudou de ${antes.projeto} para ${depois.projeto} — deveria ser inalterado`);
  }
  if (depois.cliente_linhas !== antes.cliente_linhas) {
    problemas.push(`cliente perdeu linhas: ${antes.cliente_linhas} → ${depois.cliente_linhas} — nada podia ser apagado`);
  }
  if (depois.cliente_nao_fundido !== antes.cliente_nao_fundido - totalAbsorvidos) {
    problemas.push(
      `cliente não fundido: esperado ${antes.cliente_nao_fundido - totalAbsorvidos}, encontrado ${depois.cliente_nao_fundido}`,
    );
  }
  for (const chave of ["lead", "proposta", "lancamento", "contato_cliente", "anexo_lead"] as const) {
    if (depois[chave] !== antes[chave]) {
      problemas.push(`${chave}: ${antes[chave]} → ${depois[chave]} — fusão não pode criar nem apagar`);
    }
  }

  // A prova que importa: nenhum projeto trocou de cliente fora do previsto.
  let movidosOk = 0;
  for (const [projetoId, clienteAntes] of retratoAntes) {
    const clienteDepois = retratoDepois.get(projetoId);
    if (clienteAntes === clienteDepois) continue;
    const destinoPrevisto = movimentacaoPrevista.get(projetoId);
    if (destinoPrevisto && clienteDepois === destinoPrevisto) {
      movidosOk++;
    } else {
      problemas.push(
        `projeto ${projetoId} trocou de cliente FORA DO PREVISTO: ${clienteAntes} → ${clienteDepois}`,
      );
    }
  }
  for (const projetoId of retratoDepois.keys()) {
    if (!retratoAntes.has(projetoId)) problemas.push(`projeto ${projetoId} apareceu do nada`);
  }

  const auditadas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM audit_log WHERE acao = 'mesclar-clientes' AND detalhe->>'tarefa' = 'F1.15'`,
  );
  if (Number(auditadas[0].n) !== totalAbsorvidos) {
    problemas.push(`AuditLog: esperadas ${totalAbsorvidos} entradas da F1.15, encontradas ${Number(auditadas[0].n)}`);
  }

  console.log(`  fusões executadas:                  ${feitas}`);
  console.log(`  cliente (linhas):                   ${antes.cliente_linhas} → ${depois.cliente_linhas}`);
  console.log(`  cliente não fundido:                ${antes.cliente_nao_fundido} → ${depois.cliente_nao_fundido}`);
  console.log(`  projeto:                            ${antes.projeto} → ${depois.projeto}`);
  console.log(`  projetos movidos (todos previstos): ${movidosOk}`);
  console.log(`  entradas de AuditLog (F1.15):       ${Number(auditadas[0].n)}`);

  if (problemas.length) {
    console.error("\n✖ VERIFICAÇÃO FALHOU:\n");
    for (const p of problemas) console.error(`   ${p}`);
    console.error("\nO backup mais recente está em F:\\Senahub\\backups. Ver docs/DEPLOY.md §8 para restaurar.\n");
    process.exitCode = 1;
    return;
  }

  console.log("\n✓ Tudo confere. Nada foi apagado, nenhum projeto saiu do lugar previsto.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
