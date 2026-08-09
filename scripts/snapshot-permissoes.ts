/**
 * Gera o snapshot "antes" do arnês de equivalência (§6.2): a matriz legada de permissão —
 * `can(role, recurso, acao)` incluindo o piso de sócio — para todo usuário interno ativo ×
 * todo par recurso:ação do catálogo. Exatamente a mesma fórmula que `requirePermission`
 * calcula hoje (`lib/session.ts`).
 *
 * NÃO gera um fixture "congelado para sempre": o catálogo de permissões ainda está mudando
 * (outros módulos adicionam recurso:ação com frequência), então uma foto de hoje ficaria
 * obsoleta antes da Onda B rodar o corte de verdade. Roda sob demanda, grava em `logs/`
 * (gitignored) — não é para commitar.
 *
 * `userId` sai HASHEADO (sha256, 12 chars) — mesmo se `logs/` for compartilhado ou anexado
 * em algum lugar, não vaza id real de usuário.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/snapshot-permissoes.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2)
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { can } from "../src/lib/permissions";
import { PERMISSOES_CATALOGO } from "../src/lib/permissions-catalog";
import type { CelulaPermissao } from "../src/lib/equivalencia-permissoes";
import type { Role } from "../src/lib/roles";

export function hashUserId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

/**
 * `userId` sai REAL aqui de propósito — é o que permite `checar-equivalencia-permissoes.ts`
 * reconsultar o mesmo usuário para calcular o lado "depois". Só o script que PERSISTE em
 * disco (abaixo) hasheia, na hora de escrever.
 */
export async function gerarSnapshotLegado(): Promise<CelulaPermissao[]> {
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, tipo: "interno" },
    select: { id: true, role: true, socio: { select: { ativo: true } } },
  });

  const pares = PERMISSOES_CATALOGO.flatMap((r) => r.acoes.map((a) => ({ recurso: r.recurso, acao: a.acao })));

  const celulas: CelulaPermissao[] = [];
  for (const u of usuarios) {
    const role = u.role as Role;
    const ehSocio = u.socio?.ativo === true;
    for (const { recurso, acao } of pares) {
      const daRole = await can(role, recurso, acao);

      // Duas fórmulas, porque os dois caminhos de autorização DIVERGEM hoje (ver
      // `ViaAutorizacao` em lib/equivalencia-permissoes.ts):
      //   `requirePermission` (session.ts:94) aplica o piso de sócio;
      //   `defineAction` (with-action.ts:76) chama `can(user.role, ...)` e NÃO aplica.
      // Medir só a primeira esconderia o ganho de escrita que um sócio não-admin teria ao
      // trocar `defineAction` por `permissaoEfetiva` — que não faz essa distinção.
      const comPiso = daRole || (ehSocio && (await can("supervisor", recurso, acao)));

      celulas.push({ userId: u.id, role, recurso, acao, via: "requirePermission", permitido: comPiso });
      celulas.push({ userId: u.id, role, recurso, acao, via: "defineAction", permitido: daRole });
    }
  }
  return celulas;
}

async function main() {
  const celulas = await gerarSnapshotLegado();
  const anonimizadas = celulas.map((c) => ({ ...c, userId: hashUserId(c.userId) }));

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `snapshot-permissoes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify(anonimizadas, null, 2), "utf8");

  const usuarios = new Set(celulas.map((c) => c.userId)).size;
  const permitidas = celulas.filter((c) => c.permitido).length;
  console.log(`✔ ${usuarios} usuário(s) × ${celulas.length / Math.max(usuarios, 1)} par(es) recurso:ação.`);
  console.log(`  ${permitidas}/${celulas.length} células permitidas.`);
  console.log(`  → ${arquivo}`);

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
