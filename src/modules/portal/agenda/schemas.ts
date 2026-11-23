import { z } from "zod";
import { NOTA_MAX } from "./marcos";

/**
 * Agenda do portal (spec 2026-11-23-portal-agenda-contrato-design.md). Os limites valem depois do trim e são conferidos de
 * novo no serviço; o teto aqui é o DOBRO, só para barrar corpo absurdo. Toda mensagem em pt-BR (`with-action` mostra
 * `issues[0].message` na tela).
 */

const ID = (rotulo: string) => z.string({ error: `${rotulo} não informado.` }).min(1, `${rotulo} não informado.`);

export const salvarNotaSchema = z.object({
  projetoId: ID("Projeto"),
  marcoId: ID("Marco"),
  nota: z.string({ error: "Escreva a nota." }).max(NOTA_MAX * 2, `A nota passa de ${NOTA_MAX} caracteres.`),
});

export const removerNotaSchema = z.object({
  projetoId: ID("Projeto"),
  marcoId: ID("Marco"),
});
