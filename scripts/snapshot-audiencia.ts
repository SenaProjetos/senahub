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
 *   npx tsx --tsconfig tsconfig.server.json scripts/snapshot-audiencia.ts [caminho-de-saida.json]
 *
 * Sem argumento grava em `logs/` (gitignored) — foto descartável. Com caminho explícito é como
 * a BASELINE versionada é regerada (`docs/superpowers/baselines/audiencia-antes-onda-d.json`):
 * o comparador exige um "antes" salvo, e um "antes" que só existe em `logs/` não sobrevive a
 * um clone do repositório. Os ids saem hasheados, então a baseline não carrega dado pessoal.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, §7-R2)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { AUDIENCIAS, AUDIENCIAS_PARAMETRIZADAS, AUDIENCIA_KEYS, whereAudiencia } from "../src/lib/audiencias";
import { navItemsPara } from "../src/lib/nav-config";
import { permissoesEfetivas } from "../src/lib/permissao-efetiva";
import { conjuntosVazios, type ConjuntoNomeado } from "../src/lib/equivalencia-audiencia";
import { hashUserId } from "./snapshot-permissoes";


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

  // Menu por usuário: `navItemsPara` é a mesma função que a sidebar chama, com o mesmo contexto
  // que o layout monta — é isso que faz o snapshot medir o menu real, e não uma aproximação.
  const usuarios = await prisma.user.findMany({
    where: { ativo: true },
    select: { id: true, role: true, tipo: true, setor: true, superUsuario: true, perfilId: true },
  });
  const nav: ConjuntoNomeado[] = [];
  for (const u of usuarios) {
    const permitidas = await permissoesEfetivas({
      id: u.id,
      ativo: true,
      superUsuario: u.superUsuario,
      perfilId: u.perfilId,
    });
    nav.push({
      chave: hashUserId(u.id),
      ids: navItemsPara({ permitidas, tipo: u.tipo, setor: u.setor })
        .flatMap((g) => g.items.map((i) => i.href))
        .sort(),
    });
  }
  nav.sort((a, b) => a.chave.localeCompare(b.chave));

  return { geradoEm: new Date().toISOString(), audiencias, parametrizadas, nav };
}

async function main() {
  const snap = await gerarSnapshotAudiencia();

  const destino = process.argv[2];
  const arquivo = destino
    ? join(process.cwd(), destino)
    : join(process.cwd(), "logs", `snapshot-audiencia-${snap.geradoEm.replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(arquivo), { recursive: true });
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
