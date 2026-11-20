import { z } from "zod";
import { marcacaoSchema } from "@/modules/projetos/pendencias/marcacao-schema";
import { LIMITE_COMENTARIO, LIMITE_RESPOSTA, LIMITE_TEXTO_MARCACAO, MAX_MARCACOES } from "./regras";
import { MAX_GUIDS_MARCACAO } from "./modelo-regras";

/**
 * Schemas das ações do pedido de revisão (fora do arquivo "use server": `.superRefine` dentro de uma config de
 * `defineAction` quebra o build, e aqui eles são testáveis). Toda mensagem é pt-BR: a primeira vai direto ao toast.
 */

const id = z.string().min(1, "Pedido inválido.").max(64, "Pedido inválido.");
const foraDaPrancha = "Marcação fora da prancha.";

/** Marcação do cliente: mesmo formato da `Pendencia` (x/y normalizados + forma) e as dimensões da página (cota). */
const marcacaoDoPedidoSchema = z.object({
  pagina: z.number().int(foraDaPrancha).min(1, foraDaPrancha).max(10000, foraDaPrancha),
  x: z.number().min(0, foraDaPrancha).max(1, foraDaPrancha),
  y: z.number().min(0, foraDaPrancha).max(1, foraDaPrancha),
  texto: z.string().max(LIMITE_TEXTO_MARCACAO, `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`),
  marcacao: marcacaoSchema.nullable(),
  paginaPt: z
    .object({ w: z.number().positive(foraDaPrancha).max(100000, foraDaPrancha), h: z.number().positive(foraDaPrancha).max(100000, foraDaPrancha) })
    .nullish(),
});

export const criarPedidoSchema = z.object({
  projetoId: id,
  uploadId: id,
  comentario: z.string().max(LIMITE_COMENTARIO, `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`),
  marcacoes: z.array(marcacaoDoPedidoSchema).max(MAX_MARCACOES, `O pedido aceita no máximo ${MAX_MARCACOES} marcações.`).optional(),
});

const foraDoModelo = "Marcação fora do modelo.";
// Zod 4: `z.number()` já recusa NaN e Infinity.
const numero = z.number({ error: foraDoModelo });
const ponto3d = z.tuple([numero, numero, numero], { error: foraDoModelo });

/** Marcação 3D do cliente: o modelo que ele viu, os elementos (IfcGuids), o ponto e a vista — eixos IFC, no referencial do próprio modelo. */
const marcacaoModeloSchema = z.object({
  modeloId: z.string().min(1, foraDoModelo).max(80, foraDoModelo),
  guids: z
    .array(z.string().min(1, foraDoModelo).max(64, foraDoModelo))
    .max(MAX_GUIDS_MARCACAO, `Uma marcação aceita no máximo ${MAX_GUIDS_MARCACAO} elementos.`),
  ponto: ponto3d,
  camera: z.object({ position: ponto3d, target: ponto3d }, { error: foraDoModelo }),
  texto: z.string().max(LIMITE_TEXTO_MARCACAO, `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`),
});

export const criarPedidoModeloSchema = z.object({
  projetoId: id,
  comentario: z.string().max(LIMITE_COMENTARIO, `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`),
  marcacoes: z.array(marcacaoModeloSchema).max(MAX_MARCACOES, `O pedido aceita no máximo ${MAX_MARCACOES} marcações.`),
});

export const cancelarPedidoSchema = z.object({ id });

const resposta = z.string().max(LIMITE_RESPOSTA, `A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
export const aceitarPedidoSchema = z.object({ id, resposta: resposta.optional() });
export const recusarPedidoSchema = z.object({ id, resposta });
