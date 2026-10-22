import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { divergenciasDeDisciplina } from "../src/modules/planejamento/disciplina-linha";

/**
 * Diagnóstico somente-leitura da disciplina das linhas da EAP de um projeto. Existe para confirmar, no projeto
 * real, a causa do "Visita técnica veio com a disciplina de Hidro" (REFORMA WCS - SHP GUARARAPES, 260035):
 * "Inserir acima" criava a linha com a disciplina da linha vizinha (corrigido na Fase A).
 *
 * Mostra (1) a árvore da EAP com a disciplina e a fase de cada linha, marcando as que divergem da disciplina do
 * agrupamento; (2) para cada divergente, o que o histórico de auditoria sabe sobre ela; (3) um resumo.
 * A auditoria das ações da EAP não grava `entidadeId`: as entradas da linha são achadas pelo `id` no detalhe
 * (`editar-eap` etc.). Linha editada sem nenhum `criar-eap` com o mesmo nome no projeto não nasceu pelo diálogo
 * "Nova tarefa": nasceu por "Inserir acima" (a linha nova entra com o nome "Nova tarefa" e é renomeada) ou por
 * modelo/importação, que não passam por esta auditoria.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-disciplina-eap.ts --projeto 260035
 *
 * Não escreve nada no banco nem no disco.
 */

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const codigo = arg("--projeto");
  if (!codigo) {
    console.log("Informe o projeto: --projeto <código>, por exemplo --projeto 260035.");
    process.exitCode = 1;
    return;
  }
  const projeto = await prisma.projeto.findFirst({ where: { codigo }, select: { id: true, codigo: true, nome: true } });
  if (!projeto) {
    console.log(`Projeto ${codigo} não encontrado.`);
    process.exitCode = 1;
    return;
  }

  const [linhas, disciplinas] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId: projeto.id },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        parentId: true,
        nome: true,
        codigoEap: true,
        tipoEap: true,
        disciplinaId: true,
        etapaId: true,
        etapa: { select: { sigla: true } },
      },
    }),
    prisma.disciplina.findMany({
      where: { projetoId: projeto.id },
      select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
    }),
  ]);
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.catalogo?.nome ?? d.disciplinaTextoLegado]));
  const nos = linhas.map((l) => ({ id: l.id, parentId: l.parentId, disciplinaId: l.disciplinaId, etapaId: l.etapaId }));
  const divergencias = new Map(divergenciasDeDisciplina(nos).map((d) => [d.tarefaId, d]));

  console.log(`\n${projeto.codigo} — ${projeto.nome}: ${linhas.length} linha(s) na EAP\n`);
  const filhas = new Map<string | null, typeof linhas>();
  for (const l of linhas) filhas.set(l.parentId, [...(filhas.get(l.parentId) ?? []), l]);
  const imprimir = (pai: string | null, nivel: number) => {
    for (const l of filhas.get(pai) ?? []) {
      const disc = l.disciplinaId ? (nomeDisciplina.get(l.disciplinaId) ?? "?") : "—";
      const fase = l.etapa?.sigla ? ` [${l.etapa.sigla}]` : "";
      const d = divergencias.get(l.id);
      const marca = d ? `   <-- DIVERGE: o agrupamento é ${nomeDisciplina.get(d.esperadaId) ?? "?"}` : "";
      console.log(`${"  ".repeat(nivel)}${l.codigoEap ?? "?"} ${l.nome}  (${disc}${fase})${marca}`);
      imprimir(l.id, nivel + 1);
    }
  };
  imprimir(null, 0);

  let viaInserirAcima = 0;
  if (divergencias.size > 0) console.log("\nHistórico das linhas divergentes:");
  for (const id of divergencias.keys()) {
    const l = linhas.find((x) => x.id === id)!;
    const eventos = await prisma.$queryRaw<{ createdAt: Date; acao: string; usuario: string | null }[]>`
      SELECT a."createdAt", a.acao, u.name AS usuario
        FROM audit_log a LEFT JOIN "user" u ON u.id = a."userId"
       WHERE a.modulo = 'planejamento' AND a.detalhe->>'id' = ${id}
       ORDER BY a."createdAt" ASC`;
    const criou = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM audit_log a
       WHERE a.modulo = 'planejamento' AND a.acao = 'criar-eap'
         AND a.detalhe->>'projetoId' = ${projeto.id} AND a.detalhe->>'nome' = ${l.nome}`;
    const criadaPelaTela = Number(criou[0]?.n ?? 0) > 0;
    const primeira = eventos[0]?.acao;
    const sugereInserirAcima = !criadaPelaTela && (primeira === "editar-eap" || primeira === "inserir-eap-acima" || !primeira);
    if (sugereInserirAcima) viaInserirAcima++;
    console.log(`- ${l.codigoEap ?? "?"} ${l.nome}`);
    for (const e of eventos) console.log(`    ${e.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${e.acao}  ${e.usuario ?? "—"}`);
    console.log(
      `    => ${criadaPelaTela ? "criada pelo diálogo Nova tarefa" : sugereInserirAcima ? "sugere 'Inserir acima' (ou modelo/importação)" : "origem indeterminada"}`,
    );
  }

  console.log(
    `\nResumo: ${linhas.length} linha(s), ${divergencias.size} com disciplina diferente do agrupamento, ${viaInserirAcima} sugerindo "Inserir acima".`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
