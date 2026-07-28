import "server-only";
import { createRequire } from "node:module";
import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { lerArquivo } from "@/lib/storage";
import {
  lerInsumosSinapi,
  lerComposicoesSinapi,
  SHEET_POR_REGIME,
  SHEET_ANALITICO,
  type InsumoLido,
  type RegimeSinapi,
  type UfSinapi,
} from "./importador-sinapi";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — mesmo contorno do Turbopack usado em lib/import/planilha.ts.
const ExcelJS = require("exceljs") as typeof import("exceljs");

/** Nome da fila pg-boss on-demand do import de base de custos. */
export const FILA_IMPORTAR_CUSTOS = "importar-base-custos";

/**
 * Acessa o pg-boss vivo direto do globalThis (mesma ponte de lib/jobs.ts), sem importar
 * lib/jobs.ts — evita puxar o grafo inteiro de handlers de automação para o bundle da action
 * de upload. Mesmo padrão de modules/coordenacao/service.ts.
 */
function bossVivo(): PgBoss | null {
  return (globalThis as unknown as { __senahubBoss?: PgBoss | null }).__senahubBoss ?? null;
}

const REGIME_LABEL: Record<RegimeSinapi, string> = {
  sem_desoneracao: "sem desoneração",
  com_desoneracao: "com desoneração",
  sem_encargos: "sem encargos",
};

function mesAno(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

type ProgressoParcial = Partial<{
  progresso: number;
  insumosCriados: number;
  precosCriados: number;
  composicoesCriadas: number;
  itensCriados: number;
}>;

async function atualizarProgresso(importacaoId: string, dados: ProgressoParcial) {
  await prisma.custoImportacao.update({ where: { id: importacaoId }, data: dados });
}

// Peso de cada fase no progresso total exibido (0-100).
const FASES = {
  insumos: [0, 20] as const,
  precos: [20, 60] as const,
  composicoes: [60, 75] as const,
  itens: [75, 100] as const,
};
function progressoFase(fase: keyof typeof FASES, feito: number, total: number): number {
  const [ini, fim] = FASES[fase];
  if (total === 0) return fim;
  return Math.round(ini + (fim - ini) * Math.min(1, feito / total));
}

/** Cria a linha de rastreio e publica o job — não roda nada aqui (sem worker em `npm run dev`). */
export async function enfileirarImportacaoCusto(
  input: { caminhoArquivo: string; dataBase: Date; ufs: UfSinapi[]; regimes: RegimeSinapi[] },
  autorId: string,
): Promise<{ enfileirado: true; importacaoId: string } | { enfileirado: false; motivo: "sem_worker" }> {
  const importacao = await prisma.custoImportacao.create({
    data: {
      fonte: "sinapi",
      dataBase: input.dataBase,
      ufs: input.ufs,
      regimes: input.regimes,
      caminhoArquivo: input.caminhoArquivo,
      autorId,
      status: "fila",
    },
  });

  const boss = bossVivo();
  if (!boss) return { enfileirado: false, motivo: "sem_worker" };
  await boss.send(FILA_IMPORTAR_CUSTOS, { importacaoId: importacao.id });
  return { enfileirado: true, importacaoId: importacao.id };
}

/**
 * Executa a importação (handler da fila `importar-base-custos`, lib/jobs.ts). Lê o `.xlsx` do
 * storage, importa insumos+preços (ISD/ICD/ISE dos regimes selecionados) e composições+itens
 * (Analítico, uma vez só — coeficientes não têm UF). Idempotente por reexecução: upsert por
 * chave natural em insumo/base/composição; itens da base estrutural são substituídos por
 * inteiro (não têm chave natural própria na fonte).
 */
export async function executarImportacaoCusto(importacaoId: string): Promise<void> {
  const imp = await prisma.custoImportacao.findUnique({ where: { id: importacaoId } });
  if (!imp) return;

  try {
    await prisma.custoImportacao.update({
      where: { id: importacaoId },
      data: { status: "processando", iniciadoEm: new Date(), progresso: 0 },
    });

    const buffer = await lerArquivo(imp.caminhoArquivo);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const regimes = imp.regimes as RegimeSinapi[];
    const ufs = imp.ufs as UfSinapi[];

    // ── 1. Insumos (catálogo deduplicado entre os regimes) + preços por UF×regime ──
    const insumoPorCodigo = new Map<string, InsumoLido>();
    type PrecoPendente = { chaveBase: string; codigo: string; valor: number };
    const precosPendentes: PrecoPendente[] = [];
    const chavesBase = new Set<string>();

    for (const regime of regimes) {
      const nomeSheet = SHEET_POR_REGIME[regime];
      const sheet = wb.getWorksheet(nomeSheet);
      if (!sheet) throw new Error(`Planilha "${nomeSheet}" não encontrada no arquivo.`);
      const lido = lerInsumosSinapi(sheet);
      if (!lido.ok) throw new Error(lido.erro);
      for (const insumo of lido.insumos) {
        if (!insumoPorCodigo.has(insumo.codigo)) insumoPorCodigo.set(insumo.codigo, insumo);
        for (const uf of ufs) {
          const valor = insumo.precosPorUf[uf];
          if (valor === undefined) continue;
          const chaveBase = `${uf}::${regime}`;
          chavesBase.add(chaveBase);
          precosPendentes.push({ chaveBase, codigo: insumo.codigo, valor });
        }
      }
    }

    const baseIdPorChave = new Map<string, string>();
    for (const chaveBase of chavesBase) {
      const [uf, regime] = chaveBase.split("::");
      const nome = `SINAPI-${uf} (${REGIME_LABEL[regime as RegimeSinapi]}) — ${mesAno(imp.dataBase)}`;
      const base = await prisma.custoBasePreco.upsert({
        where: { fonte_uf_regime_dataBase: { fonte: "sinapi", uf, regime, dataBase: imp.dataBase } },
        create: { fonte: "sinapi", uf, regime, dataBase: imp.dataBase, nome },
        update: { nome, ativo: true },
      });
      baseIdPorChave.set(chaveBase, base.id);
    }

    const baseEstrutural = await prisma.custoBasePreco.upsert({
      where: {
        fonte_uf_regime_dataBase: { fonte: "sinapi", uf: "NACIONAL", regime: "padrao", dataBase: imp.dataBase },
      },
      create: {
        fonte: "sinapi",
        uf: "NACIONAL",
        regime: "padrao",
        dataBase: imp.dataBase,
        nome: `SINAPI — estrutural — ${mesAno(imp.dataBase)}`,
      },
      update: { ativo: true },
    });

    const insumosLista = [...insumoPorCodigo.values()];
    const insumoIdPorCodigo = new Map<string, string>();
    let insumosCriados = 0;
    for (const lote of emLotes(insumosLista, 500)) {
      const resultados = await prisma.$transaction(
        lote.map((ins) =>
          prisma.custoInsumo.upsert({
            where: { fonte_codigo: { fonte: "sinapi", codigo: ins.codigo } },
            create: {
              fonte: "sinapi",
              codigo: ins.codigo,
              descricao: ins.descricao,
              unidade: ins.unidade,
              categoria: ins.categoria as never,
            },
            update: { descricao: ins.descricao, unidade: ins.unidade, categoria: ins.categoria as never },
          }),
        ),
      );
      resultados.forEach((row, i) => insumoIdPorCodigo.set(lote[i].codigo, row.id));
      insumosCriados += lote.length;
      await atualizarProgresso(importacaoId, {
        insumosCriados,
        progresso: progressoFase("insumos", insumosCriados, insumosLista.length),
      });
    }

    let precosCriados = 0;
    for (const lote of emLotes(precosPendentes, 1000)) {
      await prisma.$transaction(
        lote.map((p) =>
          prisma.custoPreco.upsert({
            where: {
              baseId_insumoId: { baseId: baseIdPorChave.get(p.chaveBase)!, insumoId: insumoIdPorCodigo.get(p.codigo)! },
            },
            create: {
              baseId: baseIdPorChave.get(p.chaveBase)!,
              insumoId: insumoIdPorCodigo.get(p.codigo)!,
              valor: p.valor,
            },
            update: { valor: p.valor },
          }),
        ),
      );
      precosCriados += lote.length;
      await atualizarProgresso(importacaoId, {
        precosCriados,
        progresso: progressoFase("precos", precosCriados, precosPendentes.length),
      });
    }

    // ── 2. Composições + itens (Analítico — sem UF, importado uma única vez) ──
    const sheetAnalitico = wb.getWorksheet(SHEET_ANALITICO);
    if (!sheetAnalitico) throw new Error(`Planilha "${SHEET_ANALITICO}" não encontrada no arquivo.`);
    const lidoComp = lerComposicoesSinapi(sheetAnalitico);
    if (!lidoComp.ok) throw new Error(lidoComp.erro);

    const composicaoIdPorCodigo = new Map<string, string>();
    let composicoesCriadas = 0;
    for (const lote of emLotes(lidoComp.composicoes, 500)) {
      const resultados = await prisma.$transaction(
        lote.map((c) =>
          prisma.custoComposicao.upsert({
            where: { baseId_codigo: { baseId: baseEstrutural.id, codigo: c.codigo } },
            create: { baseId: baseEstrutural.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo },
            update: { descricao: c.descricao, unidade: c.unidade, grupo: c.grupo },
          }),
        ),
      );
      resultados.forEach((row, i) => composicaoIdPorCodigo.set(lote[i].codigo, row.id));
      composicoesCriadas += lote.length;
      await atualizarProgresso(importacaoId, {
        composicoesCriadas,
        progresso: progressoFase("composicoes", composicoesCriadas, lidoComp.composicoes.length),
      });
    }

    // Itens não têm chave natural própria na fonte — reimport substitui por inteiro.
    await prisma.custoComposicaoItem.deleteMany({ where: { composicao: { baseId: baseEstrutural.id } } });

    const ordemPorComposicao = new Map<string, number>();
    let itensIgnorados = 0;
    const dadosItens = lidoComp.itens.flatMap((item) => {
      const composicaoId = composicaoIdPorCodigo.get(item.composicaoCodigo);
      const insumoId = item.tipo === "insumo" ? insumoIdPorCodigo.get(item.itemCodigo) : undefined;
      const composicaoAuxId = item.tipo === "composicao" ? composicaoIdPorCodigo.get(item.itemCodigo) : undefined;
      if (!composicaoId || (item.tipo === "insumo" && !insumoId) || (item.tipo === "composicao" && !composicaoAuxId)) {
        itensIgnorados++;
        return [];
      }
      const ordem = ordemPorComposicao.get(item.composicaoCodigo) ?? 0;
      ordemPorComposicao.set(item.composicaoCodigo, ordem + 1);
      return [
        {
          composicaoId,
          tipo: item.tipo,
          insumoId: insumoId ?? null,
          composicaoAuxId: composicaoAuxId ?? null,
          coeficiente: item.coeficiente,
          ordem,
        },
      ];
    });
    if (itensIgnorados > 0) {
      console.warn(`[custos] importação ${importacaoId}: ${itensIgnorados} item(ns) ignorado(s) — referência não resolvida.`);
    }

    let itensCriados = 0;
    for (const lote of emLotes(dadosItens, 2000)) {
      await prisma.custoComposicaoItem.createMany({ data: lote });
      itensCriados += lote.length;
      await atualizarProgresso(importacaoId, {
        itensCriados,
        progresso: progressoFase("itens", itensCriados, dadosItens.length),
      });
    }

    await prisma.custoImportacao.update({
      where: { id: importacaoId },
      data: { status: "concluido", progresso: 100, concluidoEm: new Date() },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido na importação.";
    await prisma.custoImportacao.update({ where: { id: importacaoId }, data: { status: "erro", erro: mensagem } });
    throw err;
  }
}

// ── Composição própria ──────────────────────────────────────────

/** Base estrutural singleton (fonte="propria") que ancora todas as composições próprias. */
async function baseEstruturalPropria() {
  const existente = await prisma.custoBasePreco.findFirst({
    where: { fonte: "propria", uf: "NACIONAL", regime: "padrao" },
  });
  if (existente) return existente;
  return prisma.custoBasePreco.create({
    data: { fonte: "propria", uf: "NACIONAL", regime: "padrao", dataBase: new Date(), nome: "Composições próprias" },
  });
}

export async function criarComposicaoPropria(input: {
  codigo: string;
  descricao: string;
  unidade: string;
  grupo?: string;
}) {
  const base = await baseEstruturalPropria();
  const existente = await prisma.custoComposicao.findUnique({
    where: { baseId_codigo: { baseId: base.id, codigo: input.codigo } },
  });
  if (existente) throw new ActionError(`Já existe uma composição própria com o código "${input.codigo}".`);
  return prisma.custoComposicao.create({
    data: { baseId: base.id, codigo: input.codigo, descricao: input.descricao, unidade: input.unidade, grupo: input.grupo || null },
  });
}

async function exigirComposicaoPropria(composicaoId: string) {
  const comp = await prisma.custoComposicao.findUnique({ where: { id: composicaoId }, include: { base: true } });
  if (!comp) throw new ActionError("Composição não encontrada.");
  if (comp.base.fonte !== "propria") throw new ActionError("Só é possível editar itens de composições próprias.");
  return comp;
}

export async function adicionarItemComposicao(input: {
  composicaoId: string;
  tipo: "insumo" | "composicao";
  insumoId?: string;
  composicaoAuxId?: string;
  coeficiente: number;
}) {
  await exigirComposicaoPropria(input.composicaoId);
  if (input.tipo === "composicao" && input.composicaoAuxId === input.composicaoId) {
    throw new ActionError("Uma composição não pode referenciar a si mesma.");
  }
  const max = await prisma.custoComposicaoItem.aggregate({
    where: { composicaoId: input.composicaoId },
    _max: { ordem: true },
  });
  const ordem = (max._max.ordem ?? -1) + 1;
  return prisma.custoComposicaoItem.create({
    data: {
      composicaoId: input.composicaoId,
      tipo: input.tipo,
      insumoId: input.tipo === "insumo" ? input.insumoId : null,
      composicaoAuxId: input.tipo === "composicao" ? input.composicaoAuxId : null,
      coeficiente: input.coeficiente,
      ordem,
    },
  });
}

export async function removerItemComposicao(itemId: string) {
  const item = await prisma.custoComposicaoItem.findUnique({ where: { id: itemId }, include: { composicao: { include: { base: true } } } });
  if (!item) throw new ActionError("Item não encontrado.");
  if (item.composicao.base.fonte !== "propria") throw new ActionError("Só é possível editar itens de composições próprias.");
  return prisma.custoComposicaoItem.delete({ where: { id: itemId } });
}

export async function excluirComposicaoPropria(id: string) {
  await exigirComposicaoPropria(id);
  const usosComoAuxiliar = await prisma.custoComposicaoItem.count({ where: { composicaoAuxId: id } });
  if (usosComoAuxiliar > 0) {
    throw new ActionError("Esta composição é usada como auxiliar em outra(s) — remova essas referências antes de excluir.");
  }
  return prisma.custoComposicao.delete({ where: { id } });
}
