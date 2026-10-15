import { z } from "zod";

// A tela sempre manda dados válidos; as mensagens só aparecem numa chamada forjada, mas em pt-BR.
const id = z.string().min(1, "Registro não informado.");
const simNao = z.boolean({ error: "Valor inválido." });

export const candidatosSchema = z.object({
  modo: z.enum(["ficha", "projeto"], { error: "Origem do link inválida." }),
  id,
});

export const previaSchema = z.object({ projetoId: id, negociacaoId: id });

export const linkarSchema = z.object({
  projetoId: id,
  negociacaoId: id,
  arquivos: z
    .array(z.object({ chave: id, exibirEmRecebidos: simNao }))
    .max(100, "Escolha no máximo 100 arquivos por vez."),
  incluirResumo: simNao,
});

export const desfazerSchema = z.object({ projetoId: id });
