/**
 * Lê um XML do MS Project de verdade e imprime o que o SenaHub entendeu dele: a árvore, os tipos de
 * linha, o casamento de disciplina e fase com o catálogo do banco, e as etapas de terceiro sugeridas.
 *
 * Existe porque o `vitest` do leitor e do mapeamento usa XML sintético: o arquivo real da casa fica em
 * `docs/samples/` (pasta fora do git), e teste que depende dele não roda em máquina nenhuma. Aqui é o
 * contrário — a conferência só faz sentido com o arquivo real.
 *
 *   npm run verify:modelo-mspdi                          (usa o primeiro XML de docs/samples)
 *   npm run verify:modelo-mspdi -- "caminho/arquivo.xml"
 *
 * Não grava nada.
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { lerMspdi } from "../src/modules/planejamento/modelos/mspdi";
import { mapearArquivo } from "../src/modules/planejamento/modelos/mapeamento";

const PASTA = join(process.cwd(), "docs", "samples");

function acharArquivo(): string | null {
  const pedido = process.argv.slice(2).find((a) => a.toLowerCase().endsWith(".xml"));
  if (pedido) return pedido;
  try {
    const xml = readdirSync(PASTA).filter((f) => f.toLowerCase().endsWith(".xml"));
    return xml.length > 0 ? join(PASTA, xml[0]) : null;
  } catch {
    return null;
  }
}

async function main() {
  const caminho = acharArquivo();
  if (!caminho) {
    console.log(`Nenhum XML encontrado em ${PASTA}. Passe o caminho: npm run verify:modelo-mspdi -- "arquivo.xml"`);
    return;
  }
  console.log(`Arquivo: ${caminho}\n`);

  const arquivo = lerMspdi(readFileSync(caminho, "utf8"));
  console.log(`Título: ${arquivo.titulo} · jornada ${arquivo.minutosPorDia} min · ${arquivo.linhas.length} linhas`);

  const [disciplinas, fases] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, sinonimos: true },
      orderBy: { nome: "asc" },
    }),
    prisma.pranchaCatalogo.findMany({
      where: { categoria: "fase", projetoId: null, ativo: true },
      select: { id: true, nome: true, sigla: true, sinonimos: true },
      orderBy: { ordem: "asc" },
    }),
  ]);

  const { estrutura, conferencia } = mapearArquivo(arquivo, {
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.nome, sigla: d.codigo, sinonimos: d.sinonimos })),
    fases: fases.map((f) => ({ id: f.id, nome: f.nome, sigla: f.sigla, sinonimos: f.sinonimos })),
  });

  console.log(
    `\nTotais: ${conferencia.totais.linhas} linhas · ${conferencia.totais.agrupamentos} agrupamentos · ` +
      `${conferencia.totais.marcos} marcos · ${conferencia.totais.vinculos} vínculos · ` +
      `${conferencia.totais.comDisciplina} linhas com disciplina`,
  );

  console.log("\nFases reconhecidas:");
  for (const f of conferencia.fases) {
    console.log(`  ${f.origem} → ${f.catalogoNome ?? "— SEM PAR —"} (${f.como}, ${f.linhas} linha(s))`);
  }

  console.log("\nDisciplinas:");
  for (const d of conferencia.disciplinas) {
    const marca = d.catalogoId ? " " : "!";
    console.log(`  ${marca} ${d.origem} → ${d.catalogoNome ?? "— SEM PAR (escolher na tela) —"} (${d.como}, ${d.linhas} linha(s))`);
  }

  console.log(`\nEtapas de terceiro sugeridas (${conferencia.terceiros.length}):`);
  for (const t of conferencia.terceiros) console.log(`  ${t.nome}`);

  const tipos = estrutura.linhas.reduce<Record<string, number>>((acc, l) => {
    acc[l.tipoEap] = (acc[l.tipoEap] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nTipos de linha:", tipos);

  const semDisciplina = estrutura.linhas.filter((l) => l.disciplinaCatalogoId == null);
  console.log(`\nLinhas SEM disciplina (${semDisciplina.length}) — não herdam responsável nem fecham fase:`);
  for (const l of semDisciplina.slice(0, 15)) console.log(`  [${l.tipoEap}] ${l.nome}`);
  if (semDisciplina.length > 15) console.log(`  … e outras ${semDisciplina.length - 15}`);

  const marcosSemFase = estrutura.linhas.filter((l) => l.tipoEap === "mrc" && (!l.etapaId || !l.disciplinaCatalogoId));
  console.log(`\nMarcos que NÃO fecham fase (sem disciplina ou sem fase): ${marcosSemFase.length}`);
  for (const l of marcosSemFase.slice(0, 10)) console.log(`  ${l.nome}`);

  console.log("\nÁrvore (3 primeiros níveis):");
  const filhos = new Map<string | null, typeof estrutura.linhas>();
  for (const l of estrutura.linhas) {
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l);
    filhos.set(l.parentId, lista);
  }
  const mostrar = (pai: string | null, nivel: number) => {
    if (nivel > 3) return;
    for (const l of (filhos.get(pai) ?? []).sort((a, b) => a.ordem - b.ordem)) {
      const etiquetas = [l.tipoEap, l.duracaoDias > 0 ? `${l.duracaoDias}d` : null, l.deTerceiro ? "terceiro" : null]
        .filter(Boolean)
        .join(" ");
      console.log(`${"  ".repeat(nivel)}${l.nome}  (${etiquetas})`);
      mostrar(l.id, nivel + 1);
    }
  };
  mostrar(null, 1);

  if (conferencia.avisos.length > 0) {
    console.log("\nAvisos:");
    for (const a of conferencia.avisos) console.log(`  · ${a}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
