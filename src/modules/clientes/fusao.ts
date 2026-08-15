import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Fusão de clientes duplicados (F1.14).
 *
 * Move TUDO que aponta para o absorvido, marca o absorvido como fundido, e **não apaga nada** —
 * o registro continua existindo, arquivado, com `fundidoEmId` apontando para o sobrevivente.
 * É o que permite auditar depois e, se preciso, desfazer à mão.
 *
 * ⚠️ Move projeto entre empresas. Em produção há 31 projetos para 46 clientes — quase todo
 * cliente tem obra vinculada, então fundir errado leva projeto para a empresa errada. A
 * conferência de qual é o sobrevivente é HUMANA (F1.15); esta função só executa.
 */

/**
 * Toda referência a `cliente` no schema. Mantida explícita porque **três não são óbvias**:
 *
 *  - `documento_financeiro.clienteId` e `oportunidade.clienteId` são FK ESCALAR, sem `@relation`
 *    no Prisma ("p/ não inflar Cliente", diz o schema). Não aparecem em `Cliente.xxx[]`, não têm
 *    constraint no banco, e por isso **não são descobríveis** por introspecção de FK.
 *  - `custo_orcamento` aponta por `contratanteId`, não `clienteId` — um grep por "clienteId"
 *    passa direto.
 *
 * O smoke (`scripts/smoke-crm-dedupe.ts`) enumera as FKs reais do banco e falha se aparecer
 * alguma constraint que não esteja aqui — é o que impede esta lista de virar um retrato de hoje
 * quando a Fase 2 adicionar `Negociacao.clienteId` e a Fase 3 `Atividade.clienteId`.
 */
export const REFERENCIAS_CLIENTE = [
  { tabela: "contato_cliente", coluna: "clienteId", descobrivel: true },
  { tabela: "projeto", coluna: "clienteId", descobrivel: true },
  { tabela: "lancamento", coluna: "clienteId", descobrivel: true },
  { tabela: "documento_juridico", coluna: "clienteId", descobrivel: true },
  { tabela: "documento", coluna: "clienteId", descobrivel: true },
  { tabela: "lead", coluna: "clienteId", descobrivel: true },
  { tabela: "proposta", coluna: "clienteId", descobrivel: true },
  { tabela: "custo_orcamento", coluna: "contratanteId", descobrivel: true },
  { tabela: "user", coluna: "clienteId", descobrivel: true },
  // Sem constraint no banco — invisíveis para a enumeração de FK do smoke.
  { tabela: "documento_financeiro", coluna: "clienteId", descobrivel: false },
  { tabela: "oportunidade", coluna: "clienteId", descobrivel: false },
] as const;

export type ResultadoFusao = {
  sobreviventeId: string;
  absorvidoId: string;
  /** Quantas linhas cada tabela teve repontadas — vai para o `detalhe` do AuditLog. */
  movidos: Record<string, number>;
};

/**
 * Funde `absorvidoId` em `sobreviventeId`. Idempotente por recusa: refundir um cliente já
 * fundido é rejeitado, não silenciosamente repetido.
 */
export async function mesclarClientes(
  sobreviventeId: string,
  absorvidoId: string,
): Promise<ResultadoFusao> {
  if (sobreviventeId === absorvidoId) {
    throw new ActionError("Não é possível fundir um cliente com ele mesmo.");
  }

  const [sobrevivente, absorvido] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: sobreviventeId },
      select: { id: true, nome: true, usuarioId: true, fundidoEmId: true },
    }),
    prisma.cliente.findUnique({
      where: { id: absorvidoId },
      select: { id: true, nome: true, usuarioId: true, fundidoEmId: true },
    }),
  ]);

  if (!sobrevivente) throw new ActionError("Cliente sobrevivente não encontrado.");
  if (!absorvido) throw new ActionError("Cliente a ser absorvido não encontrado.");
  if (absorvido.fundidoEmId) {
    throw new ActionError(`"${absorvido.nome}" já foi fundido em outro cliente.`);
  }
  if (sobrevivente.fundidoEmId) {
    throw new ActionError(
      `"${sobrevivente.nome}" já foi absorvido por outro cliente e não pode receber uma fusão.`,
    );
  }

  // `Cliente.usuarioId` é @unique — não dá para os dois terem login de portal e mover.
  // Recusar é melhor que descartar em silêncio: o cliente absorvido perderia acesso ao portal
  // sem ninguém saber por quê.
  if (absorvido.usuarioId && sobrevivente.usuarioId) {
    throw new ActionError(
      "Os dois clientes têm login de portal. Remova o login de um deles antes de fundir.",
    );
  }

  const movidos: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    const repontar = async (
      chave: string,
      fn: () => Promise<{ count: number }>,
    ): Promise<void> => {
      const { count } = await fn();
      if (count > 0) movidos[chave] = count;
    };

    await repontar("contatos", () =>
      tx.contatoCliente.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("projetos", () =>
      tx.projeto.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("lancamentos", () =>
      tx.lancamento.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("documentosJuridicos", () =>
      tx.documentoJuridico.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("documentos", () =>
      tx.documento.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("leads", () =>
      tx.lead.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("propostas", () =>
      tx.proposta.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("orcamentosCusto", () =>
      tx.custoOrcamento.updateMany({ where: { contratanteId: absorvidoId }, data: { contratanteId: sobreviventeId } }),
    );
    await repontar("usuariosPortal", () =>
      tx.user.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    // FKs escalares (sem relation): não têm constraint, mas apontam para cliente do mesmo jeito.
    await repontar("documentosFinanceiros", () =>
      tx.documentoFinanceiro.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );
    await repontar("oportunidades", () =>
      tx.oportunidade.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
    );

    // Login de portal: só há o que mover quando o sobrevivente não tem (o caso dos dois terem
    // foi recusado acima).
    if (absorvido.usuarioId && !sobrevivente.usuarioId) {
      await tx.cliente.update({ where: { id: absorvidoId }, data: { usuarioId: null } });
      await tx.cliente.update({ where: { id: sobreviventeId }, data: { usuarioId: absorvido.usuarioId } });
      movidos["loginPortal"] = 1;
    }

    // Arquiva o absorvido com a referência. NÃO deleta.
    await tx.cliente.update({
      where: { id: absorvidoId },
      data: { ativo: false, fundidoEmId: sobreviventeId, fusaoEm: new Date() },
    });
  });

  return { sobreviventeId, absorvidoId, movidos };
}

/** Snapshot dos dois clientes para o `capturarAntes` da action — o audit registra quem virou quem. */
export async function capturarClientesDaFusao(input: {
  sobreviventeId: string;
  absorvidoId: string;
}): Promise<Prisma.JsonObject> {
  const [sobrevivente, absorvido] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: input.sobreviventeId },
      select: { id: true, nome: true, documento: true },
    }),
    prisma.cliente.findUnique({
      where: { id: input.absorvidoId },
      select: { id: true, nome: true, documento: true },
    }),
  ]);
  return {
    sobrevivente: sobrevivente ?? null,
    absorvido: absorvido ?? null,
  } as Prisma.JsonObject;
}
