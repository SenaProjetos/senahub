/**
 * Smoke de PRODUÇÃO do CRM — implementa o checklist de `docs/crm/03-migracao.md` §7.
 *
 * SOMENTE LEITURA. Não escreve nada, em nenhuma circunstância — é seguro rodar a qualquer momento,
 * inclusive com o SenaHub no ar.
 *
 * Roda antes e depois da F1.15/F1.16: os checks que dependem da fusão se ADAPTAM ao estado do
 * banco (detectam se já houve fusão pelo `fundidoEmId`) em vez de falharem por estarem sendo
 * rodados cedo demais. Um smoke que só pode rodar depois não serve de linha de base.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/smoke-crm-prod.ts
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

let ok = 0;
let falhas = 0;
let avisos = 0;

function check(nome: string, condicao: boolean, detalhe: string): void {
  if (condicao) {
    ok++;
    console.log(`  ✓ ${nome} — ${detalhe}`);
  } else {
    falhas++;
    console.error(`  ✖ ${nome} — ${detalhe}`);
  }
}

function pular(nome: string, motivo: string): void {
  avisos++;
  console.log(`  ⊘ ${nome} — PULADO: ${motivo}`);
}

async function num(sql: string, ...params: unknown[]): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(r.n);
}

/**
 * A coluna existe? Deixa o smoke rodar contra bancos em estágios diferentes da migração sem
 * quebrar — e, mais importante, sem PULAR em silêncio uma checagem cuja premissa já mudou. Foi
 * exatamente o que aconteceu com `needsReview`: a versão pulada continuou no script depois de a
 * F2.3 criar o campo, e o smoke passou a afirmar que a coluna não existia enquanto ela existia.
 */
async function colunaExiste(tabela: string, coluna: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2`,
    tabela,
    coluna,
  );
  return Number(r[0].n) > 0;
}

async function main() {
  console.log("\n=== Smoke CRM produção — checklist de 03-migracao.md §7 ===\n");

  const fusoes = await num(`SELECT count(*) AS n FROM cliente WHERE "fundidoEmId" IS NOT NULL`);
  const jaFundiu = fusoes > 0;
  console.log(`Estado: ${jaFundiu ? `F1.15 JÁ executada (${fusoes} fusões)` : "F1.15 ainda NÃO executada"}\n`);

  // ── Nada pode sumir ─────────────────────────────────────────────────────────────────────
  console.log("── Nada pode sumir ───────────────────────────────────────────────────────\n");

  const projetos = await num(`SELECT count(*) AS n FROM projeto`);
  check("projeto", projetos === 32, `${projetos} (esperado 32 — o trabalho real do escritório)`);

  const clienteLinhas = await num(`SELECT count(*) AS n FROM cliente`);
  check("cliente (linhas na tabela)", clienteLinhas === 46, `${clienteLinhas} (esperado 46 — fusão arquiva, não apaga)`);

  const naoFundidos = await num(`SELECT count(*) AS n FROM cliente WHERE "fundidoEmId" IS NULL`);
  const esperadoNaoFundido = jaFundiu ? 41 : 46;
  check(
    "cliente (não fundidos)",
    naoFundidos === esperadoNaoFundido,
    `${naoFundidos} (esperado ${esperadoNaoFundido}${jaFundiu ? " — 46 menos as 5 fusões" : " — antes da F1.15"})`,
  );

  const leads = await num(`SELECT count(*) AS n FROM lead`);
  check("lead", leads === 8, `${leads} (esperado 8)`);

  const anexos = await prisma.$queryRawUnsafe<{ nome: string; caminho: string }[]>(
    `SELECT nome, caminho FROM anexo_lead`,
  );
  check("anexo_lead", anexos.length === 4, `${anexos.length} (esperado 4)`);

  const base = process.env.STORAGE_BASE_PATH;
  if (!base) {
    pular("anexo_lead — arquivos em disco", "STORAGE_BASE_PATH não configurado neste shell");
  } else {
    const faltando = anexos.filter((a) => !existsSync(path.resolve(base, a.caminho)));
    check(
      "anexo_lead — arquivos abrem",
      faltando.length === 0,
      faltando.length === 0
        ? `os ${anexos.length} arquivos existem em STORAGE_BASE_PATH`
        : `faltam ${faltando.length}: ${faltando.map((f) => f.nome).join(", ")}`,
    );
  }

  const tabelas = await num(`SELECT count(*) AS n FROM tabela_preco`);
  const itens = await num(`SELECT count(*) AS n FROM item_tabela_preco`);
  check("tabela_preco", tabelas === 1 && itens > 0, `${tabelas} tabela com ${itens} itens`);

  // ── A proposta única ────────────────────────────────────────────────────────────────────
  console.log("\n── A proposta única ──────────────────────────────────────────────────────\n");

  const propostas = await prisma.$queryRawUnsafe<{ numero: string; token: string; ano: number }[]>(
    `SELECT numero, token, ano FROM proposta`,
  );
  check("proposta existe", propostas.length === 1, `${propostas.length} proposta (esperado 1)`);
  if (propostas[0]) {
    const p = propostas[0];
    check("proposta — numero e token preenchidos", Boolean(p.numero && p.token), `numero=${p.numero} token=${p.token.slice(0, 8)}…`);

    const seq = await prisma.$queryRawUnsafe<{ ano: number; ultimo: number }[]>(
      `SELECT ano, ultimo FROM proposta_sequencia WHERE ano = $1`,
      p.ano,
    );
    // O contador precisa estar À FRENTE do número já emitido, senão a próxima proposta colide
    // com um número que o cliente já recebeu.
    const sequencial = Number(p.numero.replace(/\D/g, "").slice(-4));
    check(
      "PropostaSequencia não colide com o número emitido",
      seq.length === 1 && seq[0].ultimo >= sequencial,
      seq.length === 1 ? `ultimo=${seq[0].ultimo} vs sequencial emitido=${sequencial}` : "sem linha de sequência para o ano",
    );
  }

  // ── Integridade ─────────────────────────────────────────────────────────────────────────
  console.log("\n── Integridade ───────────────────────────────────────────────────────────\n");

  const orfaos = await num(
    `SELECT count(*) AS n FROM lead l WHERE l."clienteId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM cliente c WHERE c.id = l."clienteId")`,
  );
  check("nenhum lead aponta para cliente inexistente", orfaos === 0, `${orfaos} órfão(s)`);

  const projOrfaos = await num(
    `SELECT count(*) AS n FROM projeto p WHERE p."clienteId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM cliente c WHERE c.id = p."clienteId")`,
  );
  check("nenhum projeto aponta para cliente inexistente", projOrfaos === 0, `${projOrfaos} órfão(s)`);

  // O campo nasceu na F2.3 (migration `crm_lead_v2_status_contatos`). Antes disso esta checagem
  // era pulada; a versão pulada continuou no smoke depois da migration existir, então ela ficou
  // dizendo "ainda não existe" sobre uma coluna que já existia — verificação morta em silêncio.
  const temNeedsReview = await colunaExiste("lead", "needsReview");
  if (!temNeedsReview) {
    pular("leads marcados para revisão", "o campo `needsReview` ainda não existe em `Lead` (F2.3)");
  } else {
    // Antes da F2.18 o número CORRETO é zero: a migration preencheu `status` com o default e
    // ninguém revisou nada ainda. Marcar tudo para revisão é o que a F2.18 faz, e é lá que este
    // número deve virar 8. Checar ">0" aqui daria falso alarme no estado intermediário.
    const [{ n: comRevisao }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM lead WHERE "needsReview" = true`,
    );
    const [{ n: totalLeads }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM lead`,
    );
    check(
      "needsReview coerente com o estágio da migração",
      Number(comRevisao) === 0 || Number(comRevisao) === Number(totalLeads),
      `${Number(comRevisao)} de ${Number(totalLeads)} marcado(s) — 0 antes da F2.18, ${Number(totalLeads)} depois`,
    );
  }

  // `status` (F2.3) precisa estar preenchido em todo lead: a coluna é NOT NULL com default, então
  // zero nulos é garantia do banco — o que vale conferir é que ninguém ficou fora do enum novo.
  if (await colunaExiste("lead", "status")) {
    const [{ n: semStatus }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM lead WHERE "status" IS NULL`,
    );
    check("todo lead tem status de prospecção (F2.3)", Number(semStatus) === 0, `${Number(semStatus)} sem status`);
  }

  // F2.5: o índice de campanha existe; o "sem campanha" foi REMOVIDO em 2026-08-21 porque o dado
  // real o refuta (Záphis com 3 obras ativas). Se ele reaparecer, alguém reverteu a correção sem
  // resolver a regra — e o próximo deploy volta a abortar.
  const idxF25 = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename='lead' AND indexname LIKE 'lead_prospeccao%'`,
  );
  const nomes = idxF25.map((i) => i.indexname);
  check(
    "índice de prospecção ativa por campanha existe",
    nomes.includes("lead_prospeccao_ativa_campanha_unica"),
    nomes.join(", ") || "nenhum",
  );
  check(
    "índice sem-campanha NÃO existe (removido: o dado real refuta o ADR-02)",
    !nomes.includes("lead_prospeccao_ativa_sem_campanha_unica"),
    nomes.includes("lead_prospeccao_ativa_sem_campanha_unica") ? "reapareceu — ver 06-progresso" : "ok",
  );

  // Nenhum vínculo pode ter ficado apontando para um cliente absorvido.
  if (jaFundiu) {
    const resto = await prisma.$queryRawUnsafe<{ tabela: string; n: bigint }[]>(`
      SELECT 'projeto' AS tabela, count(*) AS n FROM projeto x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL
      UNION ALL SELECT 'lead', count(*) FROM lead x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL
      UNION ALL SELECT 'proposta', count(*) FROM proposta x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL
      UNION ALL SELECT 'lancamento', count(*) FROM lancamento x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL
      UNION ALL SELECT 'contato_cliente', count(*) FROM contato_cliente x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL
    `);
    const sobrando = resto.filter((r) => Number(r.n) > 0);
    check(
      "nenhum vínculo ficou num cliente absorvido",
      sobrando.length === 0,
      sobrando.length === 0 ? "todos repontados para os sobreviventes" : sobrando.map((s) => `${s.tabela}=${Number(s.n)}`).join(" "),
    );

    const auditadas = await num(
      `SELECT count(*) AS n FROM audit_log WHERE acao = 'mesclar-clientes' AND detalhe->>'tarefa' = 'F1.15'`,
    );
    check("AuditLog das fusões", auditadas === 5, `${auditadas} entradas (esperado 5)`);
  } else {
    pular("vínculos em cliente absorvido", "F1.15 ainda não executada");
    pular("AuditLog das fusões", "F1.15 ainda não executada");
  }

  // ── F1.16 ───────────────────────────────────────────────────────────────────────────────
  console.log("\n── F1.16 — documento único ───────────────────────────────────────────────\n");

  const foraDoFormato = await num(
    `SELECT count(*) AS n FROM cliente WHERE documento IS NOT NULL AND (documento = '' OR documento ~ '[^0-9]')`,
  );
  check("documentos normalizados (só dígitos, sem string vazia)", foraDoFormato === 0, `${foraDoFormato} fora do formato`);

  const dups = await num(
    `SELECT count(*) AS n FROM (SELECT documento FROM cliente WHERE documento IS NOT NULL
       GROUP BY documento HAVING count(*) > 1) d`,
  );
  check("nenhum documento duplicado", dups === 0, `${dups} valor(es) repetido(s)`);

  const indice = await num(
    `SELECT count(*) AS n FROM pg_indexes WHERE tablename = 'cliente' AND indexname = 'cliente_documento_unico'`,
  );
  if (indice === 1) {
    check("índice cliente_documento_unico", true, "existe");
  } else {
    pular("índice cliente_documento_unico", "migration da F1.16 ainda não aplicada");
  }

  // ── Resultado ───────────────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(74)}\n`);
  console.log(`  ${ok} OK · ${falhas} falha(s) · ${avisos} pulado(s)\n`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
