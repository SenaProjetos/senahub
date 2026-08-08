/**
 * Arnês de AUDIÊNCIA (§6.2 passo 4 do plano de Setor × Contratação × Perfil de acesso).
 *
 * Fotografa os dois lugares que **não passam por `can()`** e que, por isso, o arnês de
 * permissão (`checar-equivalencia-permissoes.ts`) não enxerga:
 *   (i)  as audiências de notificação/seleção — quem recebe o quê (`lib/audiencias.ts`);
 *   (ii) o menu visível por usuário (`navItemsForRole`).
 * É o gate que falta para a Onda D: sem ele, a troca de `role` por Perfil de acesso pode
 * esvaziar uma audiência sem erro, sem log e sem ninguém perceber por semanas (R2).
 *
 * As audiências saem do MESMO `whereAudiencia()` que os call-sites usam — não há uma segunda
 * declaração dos papéis aqui. É o que faz um resultado verde significar alguma coisa.
 *
 * `userId` sai HASHEADO (sha256, 12 chars), igual ao arnês de permissão: o arquivo em `logs/`
 * pode ser anexado num relatório sem vazar id real.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/snapshot-audiencia.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, §7-R2)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { AUDIENCIAS, AUDIENCIAS_PARAMETRIZADAS, AUDIENCIA_KEYS, whereAudiencia } from "../src/lib/audiencias";
import { navItemsForRole } from "../src/lib/nav-config";
import { conjuntosVazios, type ConjuntoNomeado } from "../src/lib/equivalencia-audiencia";
import { hashUserId } from "./snapshot-permissoes";
import type { Role } from "../src/lib/roles";

export type SnapshotAudiencia = {
  geradoEm: string;
  /** Audiências de papel constante — as chaves de `AUDIENCIAS`. */
  audiencias: ConjuntoNomeado[];
  /** Audiências cujo conjunto de papéis é argumento; a chave carrega os argumentos concretos. */
  parametrizadas: ConjuntoNomeado[];
  /** Menu visível: chave = usuário (hasheado), ids = hrefs. */
  nav: ConjuntoNomeado[];
};

async function idsDe(where: object): Promise<string[]> {
  const us = await prisma.user.findMany({ where, select: { id: true } });
  return us.map((u) => hashUserId(u.id)).sort();
}

export async function gerarSnapshotAudiencia(): Promise<SnapshotAudiencia> {
  const audiencias: ConjuntoNomeado[] = [];
  for (const chave of AUDIENCIA_KEYS) {
    audiencias.push({ chave, ids: await idsDe(whereAudiencia(chave)) });
  }

  // Parametrizadas: fotografadas com os argumentos concretos das chamadas reais. Sem
  // `argumentosConhecidos` não há o que fotografar (os papéis vêm do banco ou de dado por
  // linha) — ficam registradas com conjunto explicitamente ausente, não com um palpite.
  const parametrizadas: ConjuntoNomeado[] = [];
  for (const p of AUDIENCIAS_PARAMETRIZADAS) {
    for (const args of p.argumentosConhecidos) {
      parametrizadas.push({
        chave: `${p.chave}(${args.join(",")})`,
        ids: await idsDe({ ativo: true, role: { in: args } }),
      });
    }
  }

  // Menu por usuário: `navItemsForRole` é a mesma função que a sidebar chama.
  const usuarios = await prisma.user.findMany({ where: { ativo: true }, select: { id: true, role: true } });
  const nav: ConjuntoNomeado[] = usuarios
    .map((u) => ({
      chave: hashUserId(u.id),
      ids: navItemsForRole(u.role as Role)
        .flatMap((g) => g.items.map((i) => i.href))
        .sort(),
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave));

  return { geradoEm: new Date().toISOString(), audiencias, parametrizadas, nav };
}

async function main() {
  const snap = await gerarSnapshotAudiencia();

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `snapshot-audiencia-${snap.geradoEm.replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify(snap, null, 2), "utf8");

  console.log(`\n${snap.audiencias.length} audiência(s) de papel constante:`);
  for (const c of snap.audiencias) {
    console.log(`  ${c.ids.length.toString().padStart(3)} · ${c.chave} — ${AUDIENCIAS[c.chave as keyof typeof AUDIENCIAS].descricao}`);
  }
  if (snap.parametrizadas.length > 0) {
    console.log(`\n${snap.parametrizadas.length} audiência(s) parametrizada(s):`);
    for (const c of snap.parametrizadas) console.log(`  ${c.ids.length.toString().padStart(3)} · ${c.chave}`);
  }
  console.log(`\n${snap.nav.length} usuário(s) ativo(s) com menu fotografado.`);

  const vazias = conjuntosVazios(snap.audiencias);
  if (vazias.length > 0) {
    console.warn(`\n⚠ Audiência(s) VAZIA(S) — quase nunca é intencional (R2): ${vazias.join(", ")}`);
  }

  console.log(`\n  → ${arquivo}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
