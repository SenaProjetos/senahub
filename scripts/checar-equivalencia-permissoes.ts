/**
 * Gate da Onda B (§6.2): compara a matriz legada (`can(role,...)`, incluindo piso de sócio)
 * com a matriz do motor novo (`permissaoEfetiva()`, perfil + override), célula a célula, para
 * todo usuário interno ativo × todo par recurso:ação do catálogo.
 *
 * Critério assimétrico — é a garantia de fail-closed da migração:
 *   - GANHO (false→true): FALHA DURA. Exit code 1. Ninguém pode ganhar acesso que não tinha.
 *   - PERDA (true→false): warning no relatório. Aceitável — conserta-se com override.
 *
 * Rodado HOJE (Onda A), com todo `perfilId` nulo, o resultado esperado é: zero ganhos (nada
 * para ganhar — `permissaoEfetiva` nega tudo sem perfil) e uma perda por célula hoje permitida
 * (perde tudo, porque ainda não tem perfil). Isso é o comportamento CORRETO desta onda, não
 * uma falha — é a Onda B que faz esse número de perdas cair a zero, perfil por perfil.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-permissoes.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, R1)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { permissaoEfetiva } from "../src/lib/permissao-efetiva";
import { compararPermissoes, type CelulaPermissao } from "../src/lib/equivalencia-permissoes";
import { gerarSnapshotLegado, hashUserId } from "./snapshot-permissoes";

async function gerarMatrizPerfil(antes: CelulaPermissao[]): Promise<CelulaPermissao[]> {
  const userIds = [...new Set(antes.map((c) => c.userId))];
  const usuarios = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, ativo: true, superUsuario: true, perfilId: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  const depois: CelulaPermissao[] = [];
  for (const c of antes) {
    const u = porId.get(c.userId);
    const permitido = u
      ? await permissaoEfetiva(
          { id: u.id, ativo: u.ativo, superUsuario: u.superUsuario, perfilId: u.perfilId },
          c.recurso,
          c.acao,
        )
      : false;
    depois.push({ ...c, permitido });
  }
  return depois;
}

async function main() {
  console.log("Calculando matriz legada (can por role + piso de sócio)...");
  const antes = await gerarSnapshotLegado();

  console.log("Calculando matriz nova (permissaoEfetiva por perfil + override)...");
  const depois = await gerarMatrizPerfil(antes);

  const { ganhos, perdas } = compararPermissoes(antes, depois);

  const anonimizar = (d: (typeof ganhos)[number]) => ({ ...d, userId: hashUserId(d.userId) });
  const relatorio = {
    geradoEm: new Date().toISOString(),
    totalCelulas: antes.length,
    totalUsuarios: new Set(antes.map((c) => c.userId)).size,
    ganhos: ganhos.map(anonimizar),
    perdas: perdas.map(anonimizar),
  };

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `equivalencia-permissoes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify(relatorio, null, 2), "utf8");

  console.log(`\n${relatorio.totalUsuarios} usuário(s) × ${antes.length} célula(s) comparada(s).`);
  console.log(`  → relatório completo: ${arquivo}`);

  // Comparação vazia é FALHA, não sucesso. Sem esta guarda o script imprime "zero ganhos" e
  // sai 0 tendo comparado NADA — foi o que aconteceu ao rodar contra um restore de produção
  // onde a Fase 0 nunca rodou: `gerarSnapshotLegado` filtra `tipo: "interno"`, todo mundo em
  // produção tem `tipo` nulo, e o gate deu verde com 0 usuários (§15.2 do plano). Um gate que
  // aprova o conjunto vazio é pior que gate nenhum, porque dá a impressão de ter medido.
  if (antes.length === 0) {
    console.error("\n✖ Nenhuma célula comparada — o gate não mediu nada.");
    console.error("  Causa provável: nenhum usuário com `ativo: true` E `tipo: \"interno\"`.");
    console.error("  Se for um restore de produção, rode antes o backfill da Fase 0:");
    console.error("    npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts");
    await prisma.$disconnect();
    process.exit(1);
  }

  if (perdas.length > 0) {
    console.warn(`\n⚠ ${perdas.length} perda(s) de acesso (esperado antes da Onda B semear perfis reais).`);
  }

  if (ganhos.length > 0) {
    console.error(`\n✖ ${ganhos.length} GANHO(S) DE ACESSO DETECTADO(S) — bloqueante:`);
    for (const g of ganhos.slice(0, 20)) {
      console.error(`  - [${g.role}] ${g.userId}: ${g.recurso}:${g.acao} passou de negado para permitido`);
    }
    if (ganhos.length > 20) console.error(`  ... e mais ${ganhos.length - 20}.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n✔ Zero ganhos de acesso. Equivalência preservada.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
