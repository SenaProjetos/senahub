import { z } from "zod";
import { ITENS_MAX, MENSAGEM_MAX, MOTIVO_ANULACAO_MAX, MOTIVO_SEM_ITENS, NOME_POR_FORA_MAX, TEXTO_MAX, TITULO_MAX } from "./regras";

/**
 * Aprovação formal da entrega (spec 2026-11-22-portal-aprovacao-entrega-design.md). Os limites valem depois do trim e
 * são conferidos de novo no serviço; o teto aqui é o DOBRO, só para barrar corpo absurdo. Toda mensagem em pt-BR: a
 * padrão do Zod 4 é em inglês, e `with-action` mostra `issues[0].message` na tela.
 */

const PROJETO = "Projeto não informado.";
const PEDIDO = "Pedido não informado.";
const RESPOSTA_ID = "Resposta não informada.";
const OPCAO = "Escolha uma resposta.";

const projetoId = z.string({ error: PROJETO }).min(1, PROJETO);
const aprovacaoId = z.string({ error: PEDIDO }).min(1, PEDIDO);
const resposta = z.enum(["aprovado", "aprovado_com_ressalvas", "nao_aprovado"], { error: OPCAO });
const textoOpcional = z
  .string({ error: "Texto inválido." })
  .max(TEXTO_MAX * 2, "O texto passa de 2.000 caracteres.")
  .nullable()
  .optional();

export const enviarAprovacaoSchema = z.object({
  projetoId,
  titulo: z.string({ error: "Dê um título ao pedido." }).max(TITULO_MAX * 2, `O título passa de ${TITULO_MAX} caracteres.`),
  mensagem: z.string({ error: "Mensagem inválida." }).max(MENSAGEM_MAX * 2, "A mensagem passa de 1.000 caracteres.").nullable().optional(),
  uploadIds: z
    .array(z.string({ error: MOTIVO_SEM_ITENS }).min(1, MOTIVO_SEM_ITENS), { error: MOTIVO_SEM_ITENS })
    .min(1, MOTIVO_SEM_ITENS)
    .max(ITENS_MAX, `Um pedido aceita até ${ITENS_MAX} arquivos.`),
  parcelaId: z.string({ error: "Parcela inválida." }).min(1, "Parcela inválida.").nullable().optional(),
});

export const cancelarAprovacaoSchema = z.object({ aprovacaoId });

export const responderAprovacaoSchema = z.object({
  aprovacaoId,
  resposta,
  texto: textoOpcional,
  impressaoDigital: z.string({ error: "Recarregue a página." }).min(1, "Recarregue a página."),
});

export const registrarPorForaSchema = z.object({
  aprovacaoId,
  resposta,
  texto: textoOpcional,
  dia: z.string({ error: "Informe a data da resposta." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da resposta."),
  respondidoPorNome: z
    .string({ error: "Informe quem respondeu." })
    .max(NOME_POR_FORA_MAX * 2, `O nome passa de ${NOME_POR_FORA_MAX} caracteres.`),
  comprovanteId: z.string({ error: "Anexe o comprovante da resposta antes de registrar." }).min(1, "Anexe o comprovante da resposta antes de registrar."),
});

export const anularRespostaSchema = z.object({
  respostaId: z.string({ error: RESPOSTA_ID }).min(1, RESPOSTA_ID),
  motivo: z.string({ error: "Explique por que a resposta está sendo anulada." }).max(MOTIVO_ANULACAO_MAX * 2, `O motivo passa de ${MOTIVO_ANULACAO_MAX} caracteres.`),
});

export const carregarFormularioSchema = z.object({ projetoId });
