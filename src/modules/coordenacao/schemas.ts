import { z } from "zod";

export const converterModeloSchema = z.object({
  // modeloId: uploadId cru (disciplina) ou `d:<documentoVersaoId>` (recebido do cliente).
  modeloId: z.string().min(1),
});

// Realinhamento (offset) de um IFC por um vetor (dx,dy,dz) em METROS, espaço IFC (Z-up).
// O alcance é revalidado no núcleo puro (validarVetor); aqui só barra NaN/Infinity cedo.
const componenteVetor = z.number().finite();
export const realinharModeloSchema = z.object({
  uploadId: z.string().min(1),
  dx: componenteVetor,
  dy: componenteVetor,
  dz: componenteVetor,
});

const cameraSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
});

export const criarApontamentoSchema = z.object({
  projetoId: z.string().min(1),
  // Ausente/nulo quando o apontamento é sobre um IFC recebido do cliente (sem disciplina).
  disciplinaId: z.string().min(1).nullish(),
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

// Vistas salvas (câmera + modelos visíveis + corte) — espelha CameraApontamento/CorteConfig.
const corteSchema = z.object({
  eixo: z.enum(["x", "y", "z"]),
  posicao: z.number().min(0).max(1),
  invertido: z.boolean(),
});

export const criarVistaSchema = z.object({
  projetoId: z.string().min(1),
  nome: z.string().trim().min(1, "Dê um nome à vista.").max(120),
  camera: cameraSchema,
  modelosVisiveis: z.array(z.string().min(1)).max(50),
  corte: corteSchema.nullish(),
});

export const idVistaSchema = z.object({ id: z.string().min(1) });

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
