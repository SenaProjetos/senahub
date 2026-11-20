import "server-only";
import { prisma } from "@/lib/prisma";
import { parseModeloId, serieDoModelo } from "@/modules/coordenacao/modelo-ref";
import { modelosCoordenacao } from "@/modules/coordenacao/queries";
import type { ModeloDoPortal } from "@/modules/portal/modelo3d/queries";
import { marcaModeloDeLeitura, type MarcaModeloLeitura } from "./modelo-regras";

/**
 * Leituras do pedido no modelo 3D para as telas (spec 2026-11-20, "Pedir revisão no modelo"): as marcações dos pedidos
 * aguardando (esmaecidas no 3D do portal, para ninguém pedir duas vezes) e, no detalhe da coordenação, os modelos do
 * pedido para o visualizador em leitura, com o aviso de versão mais nova na Coordenação.
 */

const selectMarca = { id: true, modeloId: true, texto: true, guids: true, ponto: true, camera: true } as const;

/**
 * Marcações dos pedidos de modelo AGUARDANDO do projeto (de qualquer conta do mesmo cliente), numeradas na ordem dos
 * pedidos. Só as dos modelos que esta conta vê (`modelos`) — nada de outro modelo vaza para a tela.
 */
export async function marcasAguardandoNoModelo(projetoId: string, clienteId: string, modelosVisiveis: readonly string[]): Promise<MarcaModeloLeitura[]> {
  if (modelosVisiveis.length === 0) return [];
  const linhas = await prisma.marcacaoModeloCliente.findMany({
    where: {
      modeloId: { in: [...modelosVisiveis] },
      pedido: { projetoId, projeto: { clienteId }, status: "aguardando", tipo: "modelo" },
    },
    orderBy: [{ pedido: { createdAt: "asc" } }, { ordem: "asc" }],
    take: 500,
    select: selectMarca,
  });
  return linhas.map((m, i) => marcaModeloDeLeitura(m, i + 1));
}

export type MarcaDoPedidoModelo = MarcaModeloLeitura & { modeloRotulo: string; apontamentoNumero: number | null };

export type ModeloDoPedidoView = {
  /** Os modelos das marcações, para o visualizador 3D (rota `.frag` da coordenação). */
  modelos: ModeloDoPortal[];
  marcas: MarcaDoPedidoModelo[];
  /** A série de algum modelo marcado tem upload (ou versão do recebido) mais novo na Coordenação. */
  versaoMaisNova: boolean;
};

/**
 * O pedido de modelo para o detalhe da coordenação (escopo já conferido por quem chama: `pedidoParaCoordenacao`).
 * Cada modelo marcado entra uma vez, servido pela rota interna (`/api/coordenacao/frag`, gate `coordenacao:ver`).
 */
export async function modeloDoPedidoParaCoordenacao(pedidoId: string): Promise<ModeloDoPedidoView | null> {
  const p = await prisma.pedidoRevisaoCliente.findUnique({
    where: { id: pedidoId },
    select: {
      tipo: true,
      projetoId: true,
      marcacoesModelo: { orderBy: { ordem: "asc" }, select: { ...selectMarca, apontamentoId: true, origemUploadId: true, documentoRecebidoId: true } },
    },
  });
  if (!p || p.tipo !== "modelo") return null;

  const latestPorSerie = new Map((await modelosCoordenacao(p.projetoId)).map((m) => [m.serie, m.uploadId]));
  const modelos: ModeloDoPortal[] = [];
  const rotulos = new Map<string, string>();
  let versaoMaisNova = false;
  for (const marca of p.marcacoesModelo) {
    if (rotulos.has(marca.modeloId)) continue;
    const ref = parseModeloId(marca.modeloId);
    let modelo: { rotulo: string; nomeArquivo: string; serie: string; status: string | null; disciplinaId: string | null } | null = null;
    if (ref.tipo === "upload") {
      const u = await prisma.upload.findFirst({
        where: { id: ref.id, excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } },
        select: {
          nomeArquivo: true,
          excluidoEm: true,
          disciplinaId: true,
          disciplina: { select: { disciplinaTextoLegado: true } },
          conversao: { select: { status: true } },
        },
      });
      if (u) {
        modelo = {
          rotulo: u.disciplina.disciplinaTextoLegado,
          nomeArquivo: u.nomeArquivo,
          serie: serieDoModelo({ tipo: "upload", disciplinaId: u.disciplinaId, nomeArquivo: u.nomeArquivo }),
          status: u.excluidoEm ? "erro" : (u.conversao?.status ?? null),
          disciplinaId: u.disciplinaId,
        };
      }
    } else {
      const v = await prisma.documentoVersao.findUnique({
        where: { id: ref.id },
        select: { nomeArquivo: true, documentoId: true, conversao: { select: { status: true } } },
      });
      if (v) {
        modelo = {
          rotulo: `Enviado pelo cliente · ${v.nomeArquivo}`,
          nomeArquivo: v.nomeArquivo,
          serie: serieDoModelo({ tipo: "documento", documentoId: v.documentoId }),
          status: v.conversao?.status ?? null,
          disciplinaId: null,
        };
      }
    }
    rotulos.set(marca.modeloId, modelo?.rotulo ?? "Modelo indisponível");
    if (!modelo) continue;
    const maisNovo = latestPorSerie.get(modelo.serie);
    if (maisNovo && maisNovo !== marca.modeloId) versaoMaisNova = true;
    const pronto = modelo.status === "concluido";
    modelos.push({
      modeloId: marca.modeloId,
      origem: ref.tipo === "upload" ? "entrega" : "cliente",
      origemUploadId: marca.origemUploadId,
      documentoRecebidoId: marca.documentoRecebidoId,
      disciplinaId: modelo.disciplinaId,
      rotulo: modelo.rotulo,
      nomeArquivo: modelo.nomeArquivo,
      situacao: pronto ? "pronto" : modelo.status === "erro" ? "erro" : "preparando",
      url: pronto ? `/api/coordenacao/frag/${encodeURIComponent(marca.modeloId)}` : null,
    });
  }

  const apontamentoIds = p.marcacoesModelo.flatMap((m) => (m.apontamentoId ? [m.apontamentoId] : []));
  const numeros = new Map(
    (await prisma.apontamentoCoordenacao.findMany({ where: { id: { in: apontamentoIds } }, select: { id: true, numero: true } })).map((a) => [
      a.id,
      a.numero,
    ]),
  );
  return {
    modelos,
    marcas: p.marcacoesModelo.map((m, i) => ({
      ...marcaModeloDeLeitura(m, i + 1),
      modeloRotulo: rotulos.get(m.modeloId) ?? "",
      apontamentoNumero: m.apontamentoId ? (numeros.get(m.apontamentoId) ?? null) : null,
    })),
    versaoMaisNova,
  };
}
