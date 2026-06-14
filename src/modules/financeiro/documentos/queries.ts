import "server-only";
import { prisma } from "@/lib/prisma";

export const TIPO_DOC_LABEL: Record<string, string> = {
  nf_entrada: "NF de entrada",
  nf_servico: "NF de serviço",
  contrato: "Contrato",
  proposta: "Proposta",
  medicao: "Medição",
};

/** Documentos financeiros com resumo dos lançamentos vinculados e nomes resolvidos. */
export async function listarDocumentosFinanceiros() {
  const docs = await prisma.documentoFinanceiro.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      lancamentos: { select: { id: true, valor: true, valorEfetivo: true, status: true } },
    },
  });

  const fornIds = [...new Set(docs.map((d) => d.fornecedorId).filter(Boolean) as string[])];
  const cliIds = [...new Set(docs.map((d) => d.clienteId).filter(Boolean) as string[])];
  const [forns, clis] = await Promise.all([
    prisma.fornecedor.findMany({ where: { id: { in: fornIds } }, select: { id: true, nome: true } }),
    prisma.cliente.findMany({ where: { id: { in: cliIds } }, select: { id: true, nome: true } }),
  ]);
  const fmap = new Map(forns.map((f) => [f.id, f.nome]));
  const cmap = new Map(clis.map((c) => [c.id, c.nome]));

  return docs.map((d) => {
    const vinculado = d.lancamentos.reduce(
      (s, l) => s + Number(l.status === "confirmado" ? (l.valorEfetivo ?? l.valor) : l.valor),
      0,
    );
    return {
      id: d.id,
      tipo: d.tipo,
      numero: d.numero,
      dataEmissao: d.dataEmissao ? d.dataEmissao.toISOString().slice(0, 10) : null,
      valorDocumento: d.valorDocumento != null ? Number(d.valorDocumento) : null,
      fornecedor: d.fornecedorId ? (fmap.get(d.fornecedorId) ?? null) : null,
      cliente: d.clienteId ? (cmap.get(d.clienteId) ?? null) : null,
      observacao: d.observacao,
      arquivoNome: d.arquivoNome,
      temArquivo: !!d.arquivoPath,
      lancamentos: d.lancamentos.length,
      totalVinculado: vinculado,
    };
  });
}

/** Opções para criar documentos e gerar parcelas. */
export async function opcoesDocumentoFinanceiro() {
  const [fornecedores, clientes, categorias, contas, propostas, medicoes] = await Promise.all([
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true, tipo: true } }),
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.proposta.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, numero: true, titulo: true } }),
    prisma.medicaoLicitacao.findMany({ orderBy: { numero: "desc" }, take: 100, select: { id: true, numero: true, valor: true } }),
  ]);
  return {
    fornecedores,
    clientes,
    categorias,
    contas,
    propostas: propostas.map((p) => ({ id: p.id, label: `#${p.numero} · ${p.titulo}` })),
    medicoes: medicoes.map((m) => ({ id: m.id, label: `Medição ${m.numero} · ${Number(m.valor).toLocaleString("pt-BR")}` })),
  };
}
