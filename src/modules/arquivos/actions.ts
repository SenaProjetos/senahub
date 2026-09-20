"use server";

import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { listarDocumentosAgrupados } from "@/modules/uploads/documentos-agrupados";

/** Teto de ids por chamada: bem acima dos 100 do lote, só para não aceitar corpo absurdo. */
const TETO_IDS = 500;

const documentosPorIdsSchema = z.object({
  ids: z.array(z.string().min(1)).max(TETO_IDS),
});

/**
 * Linhas de documento por id — a visão "Selecionados" do diretório geral, que junta documentos
 * marcados em filtros diferentes (a seleção atravessa filtro e página).
 *
 * **O escopo é recalculado aqui, no servidor.** `listarDocumentosAgrupados` confia em quem chama
 * (não refaz `escopoProjeto`), então o cliente NUNCA escolhe os projetos: eles saem do escopo do
 * usuário, e os ids recebidos só estreitam o resultado. Id de documento de outro projeto, ou de
 * disciplina que a muralha esconde, simplesmente não volta — quem chama não distingue "não existe"
 * de "não é seu".
 *
 * `audit: false`: é navegação de leitura, cada abertura seria ruído no log.
 */
export const carregarDocumentosPorIds = defineAction(
  {
    modulo: "arquivos",
    acao: "ver-documentos-selecionados",
    recurso: "arquivos",
    permissao: "ver",
    schema: documentosPorIdsSchema,
    audit: false,
  },
  async (input, { user }) => {
    if (input.ids.length === 0) return { linhas: [], projetos: [] };

    const [projetos, veTodas] = await Promise.all([
      prisma.projeto.findMany({ where: escopoProjeto(user), select: { id: true, codigo: true, nome: true } }),
      podeVerTodasDisciplinas(user),
    ]);

    const r = await listarDocumentosAgrupados({
      projetoIds: projetos.map((p) => p.id),
      userId: user.id,
      veTodas,
      // Tela de consulta: nada de editar metadados nem status por aqui.
      ehGlobal: false,
      podeEnviarCap: false,
      podeEditarMetadados: false,
      podeAlterarStatus: false,
      filtros: { documentoIds: input.ids },
      skip: 0,
      take: input.ids.length,
      sort: null,
      dir: "desc",
    });

    // Só os projetos que aparecem nas linhas — o cliente monta o "código · nome" a partir disto.
    const usados = new Set(r.linhas.map((l) => l.projetoId));
    return {
      linhas: r.linhas,
      projetos: projetos.filter((p) => usados.has(p.id)),
    };
  },
);
