import { z } from "zod";
import { NOTA_MAX } from "./marcos";
import { LINK_MAX, LOCAL_MAX, MOTIVO_CANCELAR_MAX, PAUTA_MAX, TITULO_MAX } from "./reunioes";

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

const dia = z.string({ error: "Data inválida." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const textoOpcional = (max: number, mensagem: string) => z.string({ error: mensagem }).max(max * 2, mensagem).nullable().optional();

/** Campos da reunião agendada; as regras finas (limites, link, hora) são de `validarReuniao`, no serviço. */
const camposDaReuniao = {
  titulo: z.string({ error: "Dê um título à reunião." }).max(TITULO_MAX * 2, `O título passa de ${TITULO_MAX} caracteres.`),
  dia,
  horaInicio: z.string({ error: "Hora inválida. Use o formato 14:30." }).max(10, "Hora inválida. Use o formato 14:30."),
  duracaoMinutos: z.number({ error: "Duração inválida." }).nullable().optional(),
  link: textoOpcional(LINK_MAX, "O link deve começar com https:// e ter até 500 caracteres."),
  local: textoOpcional(LOCAL_MAX, `O local passa de ${LOCAL_MAX} caracteres.`),
  pauta: textoOpcional(PAUTA_MAX, "A pauta passa de 1.000 caracteres."),
};

export const agendarReuniaoSchema = z.object({ projetoId: ID("Projeto"), ...camposDaReuniao });
export const editarReuniaoSchema = z.object({ reuniaoAgendadaId: ID("Reunião"), ...camposDaReuniao });
export const cancelarReuniaoSchema = z.object({
  reuniaoAgendadaId: ID("Reunião"),
  motivo: textoOpcional(MOTIVO_CANCELAR_MAX, `O motivo passa de ${MOTIVO_CANCELAR_MAX} caracteres.`),
});
