import { z } from "zod";

export const converterModeloSchema = z.object({
  uploadId: z.string().min(1),
});

const cameraSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
});

export const criarApontamentoSchema = z.object({
  projetoId: z.string().min(1),
  disciplinaId: z.string().min(1),
  uploadId: z.string().min(1),
  titulo: z.string().trim().min(1, "Dê um título ao apontamento.").max(200),
  texto: z.string().trim().min(1, "Descreva o apontamento.").max(1000),
  guids: z.array(z.string()).max(200),
  camera: cameraSchema,
});

export const editarApontamentoSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().trim().min(1, "Dê um título ao apontamento.").max(200),
  texto: z.string().trim().min(1, "Descreva o apontamento.").max(1000),
});

export const idApontamentoSchema = z.object({ id: z.string().min(1) });

// Envio dos apontamentos = criação da tarefa (espelha pendencias). Campos opcionais
// vêm da janela de confirmação (TarefaDialog); ausentes caem nos defaults do servidor.
export const enviarApontamentosSchema = z.object({
  projetoId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  statusId: z.string().optional(),
  prazo: z.string().optional(),
  prioridade: z.string().optional(),
  responsaveisIds: z.array(z.string()).optional(),
  dependeDeIds: z.array(z.string()).optional(),
});
