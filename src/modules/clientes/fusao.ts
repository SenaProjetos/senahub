import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { Prisma } from "@/generated/prisma/client";
import { formulariosEfetivos, recalcularBriefingsDosProjetos } from "@/modules/inputs/briefing-status";

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
 * (foi ele que achou `negociacao`, `atividade` e `regra_categorizacao`, que entraram depois).
 *
 * Ficam FORA desta lista as âncoras polimórficas, que nenhuma enumeração de FK enxerga e a fusão trata à parte:
 * `compromisso` (`entidadeTipo = CLIENTE`, `entidadeId`) e `de_para_contabil` (`alvo = cliente`, `alvoId`).
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
  // CRM (fases 2 e 3) e regras de preenchimento do Financeiro (M2): entraram depois da F1.14 e ficavam no absorvido.
  { tabela: "negociacao", coluna: "clienteId", descobrivel: true },
  { tabela: "atividade", coluna: "clienteId", descobrivel: true },
  { tabela: "regra_categorizacao", coluna: "clienteId", descobrivel: true },
  // Sem constraint no banco — invisíveis para a enumeração de FK do smoke.
  { tabela: "documento_financeiro", coluna: "clienteId", descobrivel: false },
  { tabela: "oportunidade", coluna: "clienteId", descobrivel: false },
] as const;

export const MOTIVO_DOIS_LOGINS = "Os dois clientes têm login de portal. Remova o login de um deles antes de fundir.";
export const MOTIVO_FUSAO_CONCORRENTE = "Outra gravação mexeu nestes clientes ao mesmo tempo. Tente unificar de novo.";

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
  if (absorvido.usuarioId && sobrevivente.usuarioId) throw new ActionError(MOTIVO_DOIS_LOGINS);

  const movidos: Record<string, number> = {};

  try {
    await prisma.$transaction(async (tx) => {
      const repontar = async (
        chave: string,
        fn: () => Promise<{ count: number }>,
      ): Promise<void> => {
        const { count } = await fn();
        if (count > 0) movidos[chave] = count;
      };

      // Trava os dois (ordem fixa, por id): quem cria projeto ou troca o cliente de um projeto para um deles toma a trava da
      // FK e espera o fim da fusão — a lista abaixo não perde projeto que entra no meio —, e duas fusões do mesmo cliente
      // ao mesmo tempo viram uma fila: a segunda relê o estado depois da trava e é recusada.
      const travar = [sobreviventeId, absorvidoId].sort();
      await tx.$queryRaw`SELECT 1 FROM "cliente" WHERE "id" = ANY(${travar}) ORDER BY "id" FOR UPDATE`;
      // Relê os dois DEPOIS da trava: o que se leu antes (fusão, login do portal) pode ter mudado no meio — o login dado ao
      // sobrevivente agora, por exemplo, faria o `update` do login de baixo bater no @unique ou sobrescrevê-lo.
      // `excluidoEm: { not: undefined }`: a leitura em lista passa pelo filtro de soft delete, e a checagem de antes (por id) não.
      const atuais = await tx.cliente.findMany({
        where: { id: { in: travar }, excluidoEm: { not: undefined } },
        select: { id: true, usuarioId: true, fundidoEmId: true },
      });
      const sobreviventeAgora = atuais.find((c) => c.id === sobreviventeId);
      const absorvidoAgora = atuais.find((c) => c.id === absorvidoId);
      if (!sobreviventeAgora || !absorvidoAgora) throw new ActionError("Um dos clientes não existe mais. Recarregue a página.");
      if (sobreviventeAgora.fundidoEmId || absorvidoAgora.fundidoEmId) {
        throw new ActionError("Um dos clientes acabou de ser unificado por outra pessoa. Recarregue a página.");
      }
      if (absorvidoAgora.usuarioId && sobreviventeAgora.usuarioId) throw new ActionError(MOTIVO_DOIS_LOGINS);

      // Briefing dos projetos cujo formulário pode mudar: foto do formulário efetivo ANTES de repontar (o modelo padrão do
      // cliente vem do cliente), para recalcular o status e zerar as ocultações de quem trocar de formulário. Entram os do
      // absorvido (mudam de cliente) e os do sobrevivente (podem herdar o modelo padrão do absorvido, abaixo).
      const projetosAbsorvidos = (await tx.projeto.findMany({ where: { clienteId: absorvidoId }, select: { id: true } })).map((p) => p.id);
      const projetosDoSobrevivente = (await tx.projeto.findMany({ where: { clienteId: sobreviventeId }, select: { id: true } })).map((p) => p.id);
      const projetosAfetados = [...projetosAbsorvidos, ...projetosDoSobrevivente];
      const formularioAntes = await formulariosEfetivos(tx, projetosAfetados);

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
      await repontar("negociacoes", () =>
        tx.negociacao.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
      );
      await repontar("atividades", () =>
        tx.atividade.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
      );
      await repontar("regrasDePreenchimento", () =>
        tx.regraCategorizacao.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
      );
      // Âncora polimórfica (sem FK): as próximas ações comerciais penduradas no cliente.
      await repontar("compromissos", () =>
        tx.compromisso.updateMany({ where: { entidadeTipo: "CLIENTE", entidadeId: absorvidoId }, data: { entidadeId: sobreviventeId } }),
      );
      // De-para contábil do cliente (M5): os lançamentos foram para o sobrevivente; sem isto a conta do absorvido ficava para
      // trás e a exportação caía em "Clientes Diversos" sem aviso. `@@unique([alvo, alvoId])`: se o sobrevivente já tem o
      // dele, vale o dele (o do absorvido fica, apontando para o arquivado).
      const deParaSobrevivente = await tx.deParaContabil.findUnique({ where: { alvo_alvoId: { alvo: "cliente", alvoId: sobreviventeId } }, select: { id: true } });
      if (!deParaSobrevivente) {
        await repontar("deParaContabil", () =>
          tx.deParaContabil.updateMany({ where: { alvo: "cliente", alvoId: absorvidoId }, data: { alvoId: sobreviventeId } }),
        );
      }
      // FKs escalares (sem relation): não têm constraint, mas apontam para cliente do mesmo jeito.
      await repontar("documentosFinanceiros", () =>
        tx.documentoFinanceiro.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
      );
      await repontar("oportunidades", () =>
        tx.oportunidade.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }),
      );

      // Login de portal: só há o que mover quando o sobrevivente não tem (o caso dos dois terem
      // foi recusado acima).
      if (absorvidoAgora.usuarioId && !sobreviventeAgora.usuarioId) {
        await tx.cliente.update({ where: { id: absorvidoId }, data: { usuarioId: null } });
        await tx.cliente.update({ where: { id: sobreviventeId }, data: { usuarioId: absorvidoAgora.usuarioId } });
        movidos["loginPortal"] = 1;
      }

      // Formulário de briefing padrão (Lote 4b): se só o absorvido tinha, o sobrevivente herda (os projetos já foram
      // para ele); se os dois têm, vale o do sobrevivente.
      const absorvidoModelo = await tx.cliente.findUnique({ where: { id: absorvidoId }, select: { modeloBriefingId: true } });
      const sobreviventeModelo = await tx.cliente.findUnique({ where: { id: sobreviventeId }, select: { modeloBriefingId: true } });
      if (absorvidoModelo?.modeloBriefingId && !sobreviventeModelo?.modeloBriefingId) {
        await tx.cliente.update({ where: { id: sobreviventeId }, data: { modeloBriefingId: absorvidoModelo.modeloBriefingId } });
        movidos["modeloBriefing"] = 1;
      }

      await recalcularBriefingsDosProjetos(tx, projetosAfetados, formularioAntes);

      // Arquiva o absorvido com a referência. NÃO deleta.
      await tx.cliente.update({
        where: { id: absorvidoId },
        data: { ativo: false, fundidoEmId: sobreviventeId, fusaoEm: new Date() },
      });
    }, { timeout: 30_000 });
  } catch (e) {
    // Deadlock com outra gravação do mesmo cliente (ordem de trava diferente, ex.: aceite de proposta): o Postgres aborta
    // uma das duas e nada desta fusão fica gravado. Repetir resolve.
    if ((e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") || (e instanceof Error && /deadlock/i.test(e.message))) throw new ActionError(MOTIVO_FUSAO_CONCORRENTE);
    throw e;
  }

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
