import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { interpretarNomeArquivo, confiavel } from "../src/modules/uploads/nomenclatura/interpretar";
import { montarVocabulario } from "../src/modules/uploads/nomenclatura/vocabulario";
import { carregarCatalogosNomenclatura, carregarExtensoesNomenclatura } from "../src/modules/uploads/nomenclatura/queries";
import { resolverNomenclatura } from "../src/modules/projetos/nomenclatura/queries";
import { catalogosPrancha } from "../src/modules/projetos/pranchas/queries";
import { lerTamanhoPapelPdf } from "../src/modules/uploads/tamanho-papel-pdf";
import { registrarEventoDocumento } from "../src/modules/uploads/historico/service";
import { camposAlterados } from "../src/modules/uploads/historico/eventos";

/**
 * Backfill de tipo, número da prancha e tamanho do papel dos documentos que ficaram sem
 * (F4 da spec `2026-09-15-motor-nomenclatura.md`).
 *
 * DIFERENTE de `preencher-fase-documentos.ts`: aquele roda numa produção AINDA na v1.17.0 e por
 * isso repete a regra à mão. ESTE importa o motor de verdade (`interpretarNomeArquivo`,
 * catálogos com sinônimo, padrão por projeto) — só rode depois que o deploy de F1–F4 chegou em
 * produção; numa v1.17.0 os imports abaixo simplesmente não existem.
 *
 * FASE não entra aqui de propósito: já tem script próprio. Rodar os dois é seguro (cada um só
 * escreve o SEU campo vazio), mas juntar os dois aqui misturaria uma regra provada (fase) com
 * uma nova, dificultando isolar o efeito de cada uma no relatório.
 *
 * Duas fases bem diferentes:
 *  1. Tipo + número: leitura pura do NOME (mesma regra do envio, confiança alta = D7). Roda em
 *     qualquer máquina com acesso ao banco.
 *  2. Tamanho do papel: lê o ARQUIVO físico (1ª página do PDF). Só funciona rodando NO SERVIDOR
 *     — precisa de `STORAGE_BASE_PATH` e dos arquivos de verdade, não só do banco. Rodar de uma
 *     estação de trabalho com túnel para o banco pula esta fase inteira sem avisar (o filtro
 *     de fs.stat falha silenciosamente, mas os documentos ficam sem papel, e o relatório abaixo
 *     mostra o total = 0).
 *
 * SEM `--aplicar` roda em modo relatório. Idempotente: só toca campo `null`, então nunca
 * sobrescreve o que alguém já classificou (só há classificação manual futura — F4 não abriu
 * edição de tipo/número/papel no painel — mas o backfill é seguro para rodar de novo mesmo
 * assim, e voltará a ficar seguro no dia em que essa edição existir).
 */

const APLICAR = process.argv.includes("--aplicar");

type CatalogoNomenclaturaPorProjeto = Awaited<ReturnType<typeof carregarCatalogosNomenclatura>>;

async function tipoENumeroPorNome() {
  const docs = await prisma.documentoDisciplina.findMany({
    where: {
      substituidoPorId: null,
      OR: [{ tipoId: null }, { numeroPrancha: null }],
    },
    select: {
      id: true,
      nomeArquivo: true,
      tipoId: true,
      numeroPrancha: true,
      disciplina: {
        select: {
          disciplinaId: true, // FK p/ DisciplinaCatalogo — o motor compara com ela
          projetoId: true,
          projeto: { select: { codigo: true, ano: true, sequencial: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("== Backfill de tipo/número (leitura do nome) ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("documentos candidatos (sem tipo OU sem número):", docs.length);

  // Global (não varia por projeto) — MESMO contexto que a rota de upload monta. Faltar isto
  // aqui faria o motor divergir da rota bem no passo 1 (blocos reservados: extensão, cópia,
  // datas), e o backfill escreveria em lote algo que o envio nunca teria escrito.
  const extensoesCatalogo = await carregarExtensoesNomenclatura();

  // Catálogo/vocabulário/padrão variam por projeto, não por documento — cache evita recarregar
  // a cada linha (mesmo raciocínio de `carregarCatalogosNomenclatura` já ser cara o bastante
  // para não repetir por arquivo dentro de UMA requisição de upload).
  const catalogoPorProjeto = new Map<string, CatalogoNomenclaturaPorProjeto>();
  const vocabPorProjeto = new Map<string, ReturnType<typeof montarVocabulario>>();
  const padraoPorProjeto = new Map<string, string | null>();

  async function contextoDoProjeto(projetoId: string) {
    if (!catalogoPorProjeto.has(projetoId)) {
      const catalogos = await carregarCatalogosNomenclatura(projetoId);
      catalogoPorProjeto.set(projetoId, catalogos);
      vocabPorProjeto.set(projetoId, montarVocabulario(catalogos, projetoId));
      padraoPorProjeto.set(projetoId, (await resolverNomenclatura(projetoId)).padrao);
    }
    return {
      catalogos: catalogoPorProjeto.get(projetoId)!,
      vocabulario: vocabPorProjeto.get(projetoId)!,
      padrao: padraoPorProjeto.get(projetoId)!,
    };
  }

  const atribuicoes: {
    documentoId: string;
    nomeArquivo: string;
    tipoId?: string;
    tipoSigla?: string;
    numeroPrancha?: number;
  }[] = [];
  let semEvidencia = 0;

  for (const doc of docs) {
    const { catalogos, vocabulario, padrao } = await contextoDoProjeto(doc.disciplina.projetoId);
    const interp = interpretarNomeArquivo(doc.nomeArquivo, {
      projeto: doc.disciplina.projeto,
      disciplinaCatalogoId: doc.disciplina.disciplinaId,
      padrao,
      vocabulario,
      extensoes: extensoesCatalogo,
    });

    const tipoDoNome = doc.tipoId === null && confiavel(interp.tipo) ? interp.tipo : undefined;
    const numeroDoNome = doc.numeroPrancha === null && confiavel(interp.numero) ? interp.numero : undefined;
    if (!tipoDoNome && !numeroDoNome) {
      semEvidencia++;
      continue;
    }
    atribuicoes.push({
      documentoId: doc.id,
      nomeArquivo: doc.nomeArquivo,
      ...(tipoDoNome ? { tipoId: tipoDoNome.valor, tipoSigla: catalogos.tipos.find((t) => t.id === tipoDoNome.valor)?.sigla } : {}),
      ...(numeroDoNome ? { numeroPrancha: numeroDoNome.valor } : {}),
    });
  }

  console.log("classificáveis:", atribuicoes.length);
  console.log("sem evidência confiável no nome (ficam como estão):", semEvidencia);
  console.log("\nprimeiros 20 classificáveis:");
  for (const a of atribuicoes.slice(0, 20)) {
    console.log(`  ${a.nomeArquivo} → tipo=${a.tipoSigla ?? "—"} número=${a.numeroPrancha ?? "—"}`);
  }

  if (!APLICAR || atribuicoes.length === 0) {
    console.log(APLICAR ? "\nNada a fazer." : "\nNada foi escrito. Revise a lista acima e rode com --aplicar.");
    return [];
  }

  const tocados: string[] = [];
  for (const a of atribuicoes) {
    const data: { tipoId?: string; numeroPrancha?: number } = {};
    if (a.tipoId) data.tipoId = a.tipoId;
    if (a.numeroPrancha !== undefined) data.numeroPrancha = a.numeroPrancha;
    // Guarda repetida no `where`: se algo preencheu o campo entre o relatório e a escrita
    // (outro backfill, ou edição manual futura), essa escolha vence.
    const r = await prisma.documentoDisciplina.updateMany({
      where: {
        id: a.documentoId,
        ...(data.tipoId !== undefined ? { tipoId: null } : {}),
        ...(data.numeroPrancha !== undefined ? { numeroPrancha: null } : {}),
      },
      data,
    });
    if (r.count === 0) continue;
    tocados.push(a.documentoId);
    const campos = camposAlterados(
      { tipo: null, numeroPrancha: null },
      { tipo: a.tipoSigla ?? null, numeroPrancha: a.numeroPrancha !== undefined ? String(a.numeroPrancha) : null },
      ["tipo", "numeroPrancha"] as const,
    );
    await registrarEventoDocumento({ documentoId: a.documentoId, tipo: "metadados", userId: null, detalhe: { campos, origem: "lote" } });
  }
  console.log(`\npreenchidos (tipo/número): ${tocados.length}`);
  return tocados;
}

async function papelPorPdf() {
  const docs = await prisma.documentoDisciplina.findMany({
    where: { substituidoPorId: null, tamanhoPapelId: null },
    select: {
      id: true,
      nomeArquivo: true,
      disciplina: { select: { projetoId: true } },
      uploads: {
        where: { excluidoEm: null, nomeArquivo: { endsWith: ".pdf", mode: "insensitive" } },
        select: { caminho: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const comPdf = docs.filter((d) => d.uploads.length > 0);

  console.log("\n== Backfill de tamanho de papel (leitura do PDF) ==");
  console.log("documentos sem papel, com PDF no acervo:", comPdf.length, "de", docs.length, "sem papel no total");
  if (comPdf.length === 0) {
    console.log("Nada a ler. Se este número parece baixo, confira se está rodando NO SERVIDOR (STORAGE_BASE_PATH).");
    return [];
  }

  const folhaPorProjeto = new Map<string, Awaited<ReturnType<typeof catalogosPrancha>>["folha"]>();
  async function folhaDoProjeto(projetoId: string) {
    if (!folhaPorProjeto.has(projetoId)) {
      folhaPorProjeto.set(projetoId, (await catalogosPrancha(projetoId)).folha);
    }
    return folhaPorProjeto.get(projetoId)!;
  }

  const atribuicoes: { documentoId: string; nomeArquivo: string; sigla: string; catalogoId: string }[] = [];
  let semLeitura = 0;
  for (const doc of comPdf) {
    const sigla = await lerTamanhoPapelPdf(doc.uploads[0].caminho);
    if (!sigla) {
      semLeitura++;
      continue;
    }
    const folha = await folhaDoProjeto(doc.disciplina.projetoId);
    const item = folha.find((f) => f.sigla === sigla && f.projetoId === doc.disciplina.projetoId) ?? folha.find((f) => f.sigla === sigla && f.projetoId === null);
    if (!item) {
      semLeitura++;
      continue;
    }
    atribuicoes.push({ documentoId: doc.id, nomeArquivo: doc.nomeArquivo, sigla, catalogoId: item.id });
  }

  console.log("lidos com sucesso:", atribuicoes.length);
  console.log("sem leitura (arquivo grande demais, corrompido, ou tamanho fora de A0–A4):", semLeitura);
  console.log("\nprimeiros 20:");
  for (const a of atribuicoes.slice(0, 20)) console.log(`  ${a.nomeArquivo} → ${a.sigla}`);

  if (!APLICAR || atribuicoes.length === 0) {
    console.log(APLICAR ? "\nNada a fazer." : "\nNada foi escrito. Revise a lista acima e rode com --aplicar.");
    return [];
  }

  const tocados: string[] = [];
  for (const a of atribuicoes) {
    const r = await prisma.documentoDisciplina.updateMany({
      where: { id: a.documentoId, tamanhoPapelId: null },
      data: { tamanhoPapelId: a.catalogoId },
    });
    if (r.count === 0) continue;
    tocados.push(a.documentoId);
    const campos = camposAlterados({ tamanhoPapel: null }, { tamanhoPapel: a.sigla }, ["tamanhoPapel"] as const);
    await registrarEventoDocumento({ documentoId: a.documentoId, tipo: "metadados", userId: null, detalhe: { campos, origem: "lote" } });
  }
  console.log(`\npreenchidos (papel): ${tocados.length}`);
  return tocados;
}

async function main() {
  const tocadosNome = await tipoENumeroPorNome();
  const tocadosPapel = await papelPorPdf();

  const tocados = [...new Set([...tocadosNome, ...tocadosPapel])];
  if (tocados.length > 0) {
    const arquivo = `preencher-metadados-documentos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(arquivo, JSON.stringify({ quando: new Date().toISOString(), documentoIds: tocados }, null, 2), "utf8");
    console.log(`\nids tocados (para reversão manual) gravados em ${arquivo}`);
  }
  await prisma.$disconnect();
}

main();
