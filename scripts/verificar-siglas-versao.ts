/**
 * Confere que as siglas de `SiglaNomenclatura` (v1) reconhecem EXATAMENTE o mesmo que as colunas
 * antigas (`codigo`/`sigla` + `sinonimos`) — aceite da F1 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`.
 *
 * Só leitura. Roda para o catálogo global e para cada projeto (fase/tipo por projeto e faixa por
 * projeto mudam o vocabulário). Rodar no dev depois da migration e em produção depois do deploy,
 * ANTES de a F2 trocar o motor para a leitura nova. Sai com código 1 se houver divergência.
 * Logo depois da migration, "sem versão fixada" deve ser 0 (ela prende todo projeto na v1).
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-siglas-versao.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  carregarCatalogosNomenclatura,
  carregarCatalogosNomenclaturaDaVersao,
} from "../src/modules/uploads/nomenclatura/queries";
import { montarVocabulario, type CatalogosNomenclatura } from "../src/modules/uploads/nomenclatura/vocabulario";
import { normalizarParte } from "../src/modules/uploads/nomenclatura/normalizar";

function partesDe(cat: CatalogosNomenclatura): string[] {
  return [
    ...cat.disciplinas.flatMap((d) => [d.codigo ?? "", ...(d.sinonimos ?? [])]),
    ...cat.fases.flatMap((f) => [f.sigla, ...(f.sinonimos ?? [])]),
    ...cat.tipos.flatMap((t) => [t.sigla, ...(t.sinonimos ?? [])]),
  ]
    .map(normalizarParte)
    .filter(Boolean);
}

function numerosDe(cat: CatalogosNomenclatura): number[] {
  return cat.disciplinas.flatMap((d) => [d.numeracao, d.numeracaoFim].filter((n): n is number => typeof n === "number"));
}

/** Compara o que os dois vocabulários reconhecem; devolve as divergências em texto. */
function comparar(projetoId: string | null, antes: CatalogosNomenclatura, depois: CatalogosNomenclatura): string[] {
  const va = montarVocabulario(antes, projetoId);
  const vd = montarVocabulario(depois, projetoId);
  const divergencias: string[] = [];
  const ordenar = (xs: ReturnType<typeof va.buscar>) =>
    JSON.stringify([...xs].sort((a, b) => `${a.categoria}${a.id}`.localeCompare(`${b.categoria}${b.id}`)));
  for (const parte of new Set([...partesDe(antes), ...partesDe(depois)])) {
    const a = ordenar(va.buscar(parte));
    const d = ordenar(vd.buscar(parte));
    if (a !== d) divergencias.push(`parte "${parte}": colunas=${a} tabela=${d}`);
  }
  for (const n of new Set([...numerosDe(antes), ...numerosDe(depois)])) {
    for (const numero of [n - 1, n, n + 1]) {
      const a = JSON.stringify(va.faixaDe(numero));
      const d = JSON.stringify(vd.faixaDe(numero));
      if (a !== d) divergencias.push(`número ${numero}: colunas=${a} tabela=${d}`);
    }
  }
  return divergencias;
}

async function main() {
  const projetos = await prisma.projeto.findMany({ select: { id: true, codigo: true } });
  const alvos: { id: string | null; rotulo: string }[] = [
    { id: null, rotulo: "catálogo global" },
    ...projetos.map((p) => ({ id: p.id, rotulo: `projeto ${p.codigo}` })),
  ];
  let falhas = 0;
  for (const alvo of alvos) {
    const [antes, depois] = await Promise.all([
      carregarCatalogosNomenclatura(alvo.id),
      carregarCatalogosNomenclaturaDaVersao(alvo.id, 1),
    ]);
    const divergencias = comparar(alvo.id, antes, depois);
    if (divergencias.length === 0) continue;
    falhas++;
    console.log(`✖ ${alvo.rotulo}: ${divergencias.length} divergência(s)`);
    for (const d of divergencias.slice(0, 20)) console.log(`   ${d}`);
  }
  const semVersao = await prisma.projeto.count({ where: { nomenclaturaVersaoId: null } });
  console.log(
    `${falhas === 0 ? "✔" : "✖"} ${alvos.length - falhas}/${alvos.length} vocabulários idênticos · ` +
      `${semVersao} projeto(s) sem versão fixada (resolvem pela data de criação)`,
  );
  if (falhas > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
