import { z } from "zod";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Conta de obra nova (Configurações → Usuários, tipo de acesso "Obra"). Empresa e data são validadas no serviço. */
export const criarContaObraSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  email: z.string().email("E-mail inválido."), // campo-ok: e-mail de login (better-auth)
  empresa: z.string().max(200),
  /** "É do cliente": vazio = empresa de fora. */
  clienteId: z.string().optional().or(z.literal("")),
  projetoIds: z.array(z.string().min(1)).max(200),
  /** "Acesso até" (dia de São Paulo); vazio = sem prazo. */
  acessoAte: z.string().regex(DIA, "Data inválida.").optional().or(z.literal("")),
});

/** Editar a conta de obra: tudo menos o e-mail, com a trava otimista pelo `updatedAt` lido (`versao`). */
export const salvarContaObraSchema = criarContaObraSchema.omit({ email: true }).extend({
  userId: z.string().min(1),
  versao: z.string().min(1),
});

export type CriarContaObraInput = z.infer<typeof criarContaObraSchema>;
export type SalvarContaObraInput = z.infer<typeof salvarContaObraSchema>;
