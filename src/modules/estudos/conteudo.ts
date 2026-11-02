import { z } from "zod";

import { cargaSchema, condicoesSchema, validarTemperatura } from "@/modules/ferramentas/calc/electrical-demand";

/**
 * Conteúdo de um estudo de cargas elétricas (Lote 5d) — **puro**. É o documento JSON gravado em
 * `EstudoProjeto.conteudo`: ambientes → cargas + condições de instalação. Os campos de carga e de
 * condições são exatamente os do motor `calc/electrical-demand.ts` (chaves em português persistidas:
 * nunca renomear). Nenhuma potência, fator de potência ou de demanda vem preenchido por padrão.
 */

export const TIPO_ESTUDO_CARGAS = "cargas_eletricas";

export const MAX_CARGAS_ESTUDO = 200; // limite do motor
export const MAX_AMBIENTES = 30;
export const MAX_ESTUDOS_POR_PROJETO = 20;

/** Rótulo do ponto: só agrupa o subtotal, não altera a conta. */
export const TIPOS_PONTO = ["iluminacao", "tomada_uso_geral", "tomada_uso_especifico", "outro"] as const;
export type TipoPonto = (typeof TIPOS_PONTO)[number];

export const TIPO_PONTO_ROTULO: Record<TipoPonto, string> = {
  iluminacao: "Iluminação",
  tomada_uso_geral: "Tomada de uso geral",
  tomada_uso_especifico: "Tomada de uso específico",
  outro: "Outro",
};

const idSchema = z.string().min(1).max(40);

export const cargaEstudoSchema = cargaSchema.extend({
  id: idSchema,
  tipoPonto: z.enum(TIPOS_PONTO).optional(),
});

export const ambienteSchema = z.object({
  id: idSchema,
  nome: z.string().trim().min(1, "Dê um nome ao ambiente.").max(80, "O nome do ambiente aceita até 80 caracteres."),
  cargas: z.array(cargaEstudoSchema).max(MAX_CARGAS_ESTUDO),
});

export const conteudoSchema = z
  .object({
    ambientes: z.array(ambienteSchema).max(MAX_AMBIENTES),
    condicoes: condicoesSchema,
    /** De onde vêm os fatores de demanda (tabela da concessionária, norma…): consta na memória. */
    fonteFatorDemanda: z.string().trim().max(300, "A fonte dos fatores aceita até 300 caracteres.").optional(),
    observacoes: z.string().trim().max(2000, "As observações aceitam até 2000 caracteres.").optional(),
  })
  .superRefine((c, ctx) => {
    validarTemperatura(c.condicoes, ctx);
    const total = c.ambientes.reduce((s, a) => s + a.cargas.length, 0);
    if (total > MAX_CARGAS_ESTUDO) {
      ctx.addIssue({ code: "custom", path: ["ambientes"], message: `O estudo comporta no máximo ${MAX_CARGAS_ESTUDO} cargas.` });
    }
    const ids = new Set<string>();
    for (const a of c.ambientes) {
      for (const id of [a.id, ...a.cargas.map((x) => x.id)]) {
        if (ids.has(id)) ctx.addIssue({ code: "custom", path: ["ambientes"], message: "Há identificadores repetidos no estudo." });
        ids.add(id);
      }
    }
  });

export type ConteudoEstudo = z.infer<typeof conteudoSchema>;
export type AmbienteEstudo = ConteudoEstudo["ambientes"][number];
export type CargaEstudo = AmbienteEstudo["cargas"][number];

export const nomeEstudoSchema = z.string().trim().min(1, "Dê um nome ao estudo.").max(120, "O nome do estudo aceita até 120 caracteres.");

/** Estudo recém-criado: sem ambientes e com as condições padrão do motor. */
export function conteudoVazio(): ConteudoEstudo {
  return { ambientes: [], condicoes: condicoesSchema.parse({}) };
}

export function totalDeCargas(c: Pick<ConteudoEstudo, "ambientes">): number {
  return c.ambientes.reduce((s, a) => s + a.cargas.length, 0);
}

/**
 * Lê o JSON gravado. `null` quando o documento não passa no esquema (linha corrompida ou de uma
 * versão futura): a tela mostra o aviso em vez de quebrar.
 */
export function lerConteudo(json: unknown): ConteudoEstudo | null {
  const r = conteudoSchema.safeParse(json);
  return r.success ? r.data : null;
}
