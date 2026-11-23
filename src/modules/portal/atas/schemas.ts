import { z } from "zod";
import {
  COMENTARIO_FEITO_MAX,
  DESCRICAO_ITEM_MAX,
  ITENS_MAX,
  MOTIVO_REABRIR_MAX,
  MOTIVO_RETIRAR_MAX,
  OBSERVACAO_MAX,
  TEXTO_MAX,
  TITULO_ITEM_MAX,
  TITULO_MAX,
} from "./regras";

/**
 * Atas de reunião (spec 2026-11-22-portal-atas-reuniao-design.md). Os limites valem depois do trim e são conferidos de
 * novo no serviço; o teto aqui é o DOBRO, só para barrar corpo absurdo. Toda mensagem em pt-BR (`with-action` mostra
 * `issues[0].message` na tela).
 */

const ID = (rotulo: string) => z.string({ error: `${rotulo} não informado.` }).min(1, `${rotulo} não informado.`);
const dia = z.string({ error: "Data inválida." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const criarAtaDeTextoSchema = z.object({
  projetoId: ID("Projeto"),
  texto: z.string({ error: "Cole as anotações da reunião." }).min(1, "Cole as anotações da reunião.").max(200_000, "O texto colado é grande demais. Cole só as anotações do Gemini."),
  titulo: z.string({ error: "Título inválido." }).max(TITULO_MAX * 2, `O título passa de ${TITULO_MAX} caracteres.`).nullable().optional(),
  data: dia.nullable().optional(),
  /** Reunião da agenda de onde a ata nasce (opcional). */
  agendadaId: z.string({ error: "Reunião inválida." }).min(1, "Reunião inválida.").nullable().optional(),
});

const itemSchema = z.object({
  chave: z.string({ error: "Item inválido." }).max(100, "Item inválido."),
  tipo: z.enum(["decisao", "tarefa_equipe", "pendencia_cliente"], { error: "Escolha o tipo do item." }),
  titulo: z.string({ error: "Dê um título ao item." }).max(TITULO_ITEM_MAX * 2, `O título de um item passa de ${TITULO_ITEM_MAX} caracteres.`),
  descricao: z.string({ error: "Descrição inválida." }).max(DESCRICAO_ITEM_MAX * 2, "A descrição de um item passa de 2.000 caracteres.").nullable(),
  responsavelId: z.string({ error: "Responsável inválido." }).nullable(),
  prazo: dia.nullable(),
});

export const salvarRascunhoSchema = z.object({
  versaoId: ID("Versão"),
  titulo: z.string({ error: "Dê um título à reunião." }).max(TITULO_MAX * 2, `O título passa de ${TITULO_MAX} caracteres.`),
  data: dia,
  texto: z.string({ error: "Texto inválido." }).max(TEXTO_MAX * 2, "O texto da ata passa de 20.000 caracteres."),
  itens: z.array(itemSchema, { error: "Itens inválidos." }).max(ITENS_MAX, `A ata aceita até ${ITENS_MAX} itens.`),
});

export const versaoSchema = z.object({ versaoId: ID("Versão") });
export const reuniaoSchema = z.object({ reuniaoId: ID("Reunião") });

export const retirarAtaSchema = z.object({
  reuniaoId: ID("Reunião"),
  motivo: z.string({ error: "Explique por que a ata está sendo retirada." }).max(MOTIVO_RETIRAR_MAX * 2, `O motivo passa de ${MOTIVO_RETIRAR_MAX} caracteres.`),
});

export const responderAtaSchema = z.object({
  versaoId: ID("Versão"),
  resposta: z.enum(["concorda", "observacoes"], { error: "Escolha uma resposta." }),
  observacao: z.string({ error: "Observação inválida." }).max(OBSERVACAO_MAX * 2, "A observação passa de 2.000 caracteres.").nullable().optional(),
});

export const pendenciaSchema = z.object({ pendenciaId: ID("Pendência") });

export const marcarFeitaSchema = z.object({
  pendenciaId: ID("Pendência"),
  comentario: z.string({ error: "Comentário inválido." }).max(COMENTARIO_FEITO_MAX * 2, "O comentário passa de 1.000 caracteres.").nullable().optional(),
});

export const reabrirPendenciaSchema = z.object({
  pendenciaId: ID("Pendência"),
  motivo: z.string({ error: "Explique por que a pendência foi reaberta." }).max(MOTIVO_REABRIR_MAX * 2, `O motivo passa de ${MOTIVO_REABRIR_MAX} caracteres.`),
});
