import { z } from "zod";
import { marcacaoSchema } from "@/modules/projetos/pendencias/marcacao-schema";
import { LIMITE_COMENTARIO, LIMITE_RESPOSTA, LIMITE_TEXTO_MARCACAO, MAX_MARCACOES } from "./regras";
import { MAX_GUIDS_MARCACAO } from "./modelo-regras";

/**
 * Schemas das ações do pedido de revisão (fora do arquivo "use server": `.superRefine` dentro de uma config de
 * `defineAction` quebra o build, e aqui eles são testáveis). Toda mensagem é pt-BR — também a de TIPO errado
 * (`{ error }` em cada `z.string`/`z.array`/`z.object`; o padrão do Zod é em inglês): a primeira vai direto ao toast.
 */

const pedidoInvalido = "Pedido inválido.";
const id = z.string({ error: pedidoInvalido }).min(1, pedidoInvalido).max(64, pedidoInvalido);
const foraDaPrancha = "Marcação fora da prancha.";
const textoInvalido = "Texto inválido.";
const marcacoesInvalidas = "Marcações inválidas.";
/** Um texto livre: tipo errado = "Texto inválido."; longo demais = a mensagem do limite. */
const texto = (limite: number, longo: string) => z.string({ error: textoInvalido }).max(limite, longo);

/** Marcação do cliente: mesmo formato da `Pendencia` (x/y normalizados + forma) e as dimensões da página (cota). */
const numeroDaPrancha = z.number({ error: foraDaPrancha });
const marcacaoDoPedidoSchema = z.object(
  {
    pagina: numeroDaPrancha.int(foraDaPrancha).min(1, foraDaPrancha).max(10000, foraDaPrancha),
    x: numeroDaPrancha.min(0, foraDaPrancha).max(1, foraDaPrancha),
    y: numeroDaPrancha.min(0, foraDaPrancha).max(1, foraDaPrancha),
    texto: texto(LIMITE_TEXTO_MARCACAO, `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`),
    marcacao: marcacaoSchema.nullable(),
    paginaPt: z
      .object(
        { w: numeroDaPrancha.positive(foraDaPrancha).max(100000, foraDaPrancha), h: numeroDaPrancha.positive(foraDaPrancha).max(100000, foraDaPrancha) },
        { error: foraDaPrancha },
      )
      .nullish(),
  },
  { error: foraDaPrancha },
);

const maxMarcacoes = `O pedido aceita no máximo ${MAX_MARCACOES} marcações.`;
const comentario = texto(LIMITE_COMENTARIO, `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`);

export const criarPedidoSchema = z.object(
  {
    projetoId: id,
    uploadId: id,
    comentario,
    marcacoes: z.array(marcacaoDoPedidoSchema, { error: marcacoesInvalidas }).max(MAX_MARCACOES, maxMarcacoes).optional(),
  },
  { error: pedidoInvalido },
);

const foraDoModelo = "Marcação fora do modelo.";
// Zod 4: `z.number()` já recusa NaN e Infinity.
const numero = z.number({ error: foraDoModelo });
const ponto3d = z.tuple([numero, numero, numero], { error: foraDoModelo });

/** Marcação 3D do cliente: o modelo que ele viu, os elementos (IfcGuids), o ponto e a vista — eixos IFC, no referencial do próprio modelo. */
const textoDoModelo = z.string({ error: foraDoModelo });
const marcacaoModeloSchema = z.object(
  {
    modeloId: textoDoModelo.min(1, foraDoModelo).max(80, foraDoModelo),
    guids: z
      .array(textoDoModelo.min(1, foraDoModelo).max(64, foraDoModelo), { error: foraDoModelo })
      .max(MAX_GUIDS_MARCACAO, `Uma marcação aceita no máximo ${MAX_GUIDS_MARCACAO} elementos.`),
    ponto: ponto3d,
    camera: z.object({ position: ponto3d, target: ponto3d }, { error: foraDoModelo }),
    texto: texto(LIMITE_TEXTO_MARCACAO, `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`),
  },
  { error: foraDoModelo },
);

export const criarPedidoModeloSchema = z.object(
  {
    projetoId: id,
    comentario,
    marcacoes: z.array(marcacaoModeloSchema, { error: marcacoesInvalidas }).max(MAX_MARCACOES, maxMarcacoes),
  },
  { error: pedidoInvalido },
);

export const cancelarPedidoSchema = z.object({ id }, { error: pedidoInvalido });

const resposta = texto(LIMITE_RESPOSTA, `A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
export const aceitarPedidoSchema = z.object({ id, resposta: resposta.optional() }, { error: pedidoInvalido });
export const recusarPedidoSchema = z.object({ id, resposta }, { error: pedidoInvalido });
