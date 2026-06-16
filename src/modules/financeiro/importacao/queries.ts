import "server-only";
import { prisma } from "@/lib/prisma";
import { chaveMatch } from "@/lib/import/valores";
import { chaveCatPai, chaveCatFilha, type Existentes } from "@/modules/financeiro/importacao/processar";

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Carrega os cadastros existentes indexados por chave, para casar/contar na importação. */
export async function carregarExistentes(): Promise<Existentes> {
  const [categorias, contas, formas, centros, fornecedores, clientes] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ select: { id: true, nome: true, tipo: true, paiId: true } }),
    prisma.contaBancaria.findMany({ select: { nome: true, numero: true } }),
    prisma.formaPagamento.findMany({ select: { nome: true } }),
    prisma.centroCusto.findMany({ select: { nome: true } }),
    prisma.fornecedor.findMany({ select: { nome: true, documento: true } }),
    prisma.cliente.findMany({ select: { nome: true, nomeFantasia: true, documento: true } }),
  ]);

  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));
  const catKeys = new Set<string>();
  for (const c of categorias) {
    if (c.paiId) {
      const paiNome = nomePorId.get(c.paiId) ?? "";
      catKeys.add(chaveCatFilha(c.tipo, paiNome, c.nome));
    } else {
      catKeys.add(chaveCatPai(c.tipo, c.nome));
    }
  }

  const contaKeys = new Set<string>();
  for (const c of contas) {
    if (c.nome) contaKeys.add(chaveMatch(c.nome));
    if (c.numero) contaKeys.add(chaveMatch(c.numero));
  }

  const fornDoc = new Set<string>();
  const fornNome = new Set<string>();
  for (const f of fornecedores) {
    const d = soDigitos(f.documento);
    if (d) fornDoc.add(d);
    if (f.nome) fornNome.add(chaveMatch(f.nome));
  }

  const cliDoc = new Set<string>();
  const cliNome = new Set<string>();
  for (const c of clientes) {
    const d = soDigitos(c.documento);
    if (d) cliDoc.add(d);
    if (c.nome) cliNome.add(chaveMatch(c.nome));
    if (c.nomeFantasia) cliNome.add(chaveMatch(c.nomeFantasia));
  }

  return {
    categorias: catKeys,
    contas: contaKeys,
    formas: new Set(formas.map((f) => chaveMatch(f.nome))),
    centros: new Set(centros.map((c) => chaveMatch(c.nome))),
    fornecedoresDoc: fornDoc,
    fornecedoresNome: fornNome,
    clientesDoc: cliDoc,
    clientesNome: cliNome,
    hashes: new Set(),
  };
}

/** Hashes de lançamentos já importados (dedup global por importHash). */
export async function hashesExistentes(hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const found = await prisma.lancamento.findMany({
    where: { importHash: { in: hashes } },
    select: { importHash: true },
  });
  return new Set(found.map((f) => f.importHash!).filter(Boolean));
}

/** Histórico de importações (lotes não desfeitos primeiro), para a tela. */
export async function listarImportacoes() {
  const lotes = await prisma.importacaoFinanceira.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { autor: { select: { name: true } } },
  });
  return lotes.map((l) => ({
    id: l.id,
    nomeArquivo: l.nomeArquivo,
    origem: l.origem,
    totalLinhas: l.totalLinhas,
    lancamentosCriados: l.lancamentosCriados,
    categoriasCriadas: l.categoriasCriadas,
    contasCriadas: l.contasCriadas,
    fornecedoresCriados: l.fornecedoresCriados,
    clientesCriados: l.clientesCriados,
    autor: l.autor.name,
    desfeitoEm: l.desfeitoEm ? l.desfeitoEm.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));
}

export type ImportacaoItem = Awaited<ReturnType<typeof listarImportacoes>>[number];
