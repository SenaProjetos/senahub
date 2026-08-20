/**
 * Censo dos campos que persistem `Role` COMO DADO (R6 do plano de acesso).
 *
 * Só LÊ — não muda nada. Serve para decidir se cada campo é uma migração de dado de
 * verdade ou só um rename com rótulo de exibição.
 *
 * A distinção que mais importa está em `Aviso`:
 *   - aviso JÁ DISPARADO (`enviadoEm != null`) → `alvoRoles` é histórico/exibição. Os
 *     destinatários já viraram linhas em `AvisoDestinatario`; mexer no campo não muda ninguém.
 *   - aviso AGENDADO e ainda não disparado → `alvoRoles` é AO VIVO: `dispatcharAviso()` resolve
 *     o alvo no momento do disparo. Migrar sem tratar esses = aviso que dispara para o
 *     conjunto errado (ou para ninguém), em silêncio. É o único item com risco real do lote.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/censo-role-como-dado.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (R6, §7)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== CENSO: Role como dado (R6) ===\n");

  // ── 1. Aviso.alvoRoles ────────────────────────────────────────────────────
  const avisosCategoria = await prisma.aviso.findMany({
    where: { alvoTipo: "categoria" },
    select: {
      id: true,
      titulo: true,
      alvoRoles: true,
      agendadoPara: true,
      enviadoEm: true,
      canceladoEm: true,
    },
    orderBy: { criadoEm: "desc" },
  });

  const aoVivo = avisosCategoria.filter((a) => a.enviadoEm === null && a.canceladoEm === null);
  const historicos = avisosCategoria.filter((a) => a.enviadoEm !== null);
  const cancelados = avisosCategoria.filter((a) => a.canceladoEm !== null);

  console.log("[Aviso.alvoRoles]");
  console.log(`  total com alvoTipo=categoria: ${avisosCategoria.length}`);
  console.log(`  ├─ AO VIVO (agendado, não disparado) — RISCO REAL: ${aoVivo.length}`);
  console.log(`  ├─ histórico (já disparado, só exibição): ${historicos.length}`);
  console.log(`  └─ cancelado (inerte): ${cancelados.length}`);
  if (aoVivo.length > 0) {
    console.log("\n  ⚠ Os agendados ao vivo (resolvem alvoRoles no disparo):");
    for (const a of aoVivo) {
      console.log(`     - "${a.titulo}" → [${a.alvoRoles.join(", ")}] · dispara em ${a.agendadoPara?.toISOString() ?? "?"}`);
    }
  }
  const rolesUsadasEmAvisos = new Set(avisosCategoria.flatMap((a) => a.alvoRoles));
  console.log(`\n  papéis efetivamente usados em avisos: [${[...rolesUsadasEmAvisos].sort().join(", ") || "nenhum"}]`);

  // ── 2. DocumentoModelo.perfis ─────────────────────────────────────────────
  const modelosPorPerfil = await prisma.documentoModelo.findMany({
    where: { visibilidade: "perfis" },
    select: { id: true, nome: true, perfis: true, ativo: true },
  });
  const totalModelos = await prisma.documentoModelo.count();

  console.log("\n[DocumentoModelo.perfis]");
  console.log(`  modelos no total: ${totalModelos}`);
  console.log(`  com visibilidade="perfis" (o único caso que lê o campo): ${modelosPorPerfil.length}`);
  for (const m of modelosPorPerfil) {
    console.log(`     - "${m.nome}" → [${m.perfis.join(", ")}]${m.ativo ? "" : " (inativo)"}`);
  }
  const rolesUsadasEmModelos = new Set(modelosPorPerfil.flatMap((m) => m.perfis));
  console.log(`  papéis efetivamente usados: [${[...rolesUsadasEmModelos].sort().join(", ") || "nenhum"}]`);

  // ── 3. SolicitacaoCadastro.role ───────────────────────────────────────────
  const pendentes = await prisma.solicitacaoCadastro.count({ where: { status: "pendente" } });
  const totalSolic = await prisma.solicitacaoCadastro.count();
  const porRole = await prisma.solicitacaoCadastro.groupBy({
    by: ["role"],
    _count: { role: true },
  });

  console.log("\n[SolicitacaoCadastro.role]");
  console.log(`  total: ${totalSolic} · pendentes (o campo ainda vai ser lido): ${pendentes}`);
  for (const g of porRole) {
    console.log(`     - ${g.role}: ${g._count.role}`);
  }

  // ── 4. EscalaRole.role — o 4º campo, preso na Onda E ──────────────────────
  const escalaRoleLinhas = await prisma.escalaRole.count();
  const escalaContratacaoLinhas = await prisma.escalaContratacao.count();
  console.log("\n[EscalaRole.role] — 4º campo, NÃO é deste lote (preso ao passo 4 da Onda E)");
  console.log(`  linhas em escala_role (legado, dual-write): ${escalaRoleLinhas}`);
  console.log(`  linhas em escala_contratacao (sucessora, já é quem manda): ${escalaContratacaoLinhas}`);

  console.log("\n=== fim do censo — nada foi alterado ===");
}

main().finally(() => prisma.$disconnect());
