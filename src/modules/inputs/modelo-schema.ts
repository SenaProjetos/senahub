/**
 * Modelo de formulário do briefing (`ModeloBriefing.esquema`) — regras puras, sem Prisma/React.
 * O esquema é a lista de seções → campos de `briefing-schema.ts`; aqui ficam a validação (Zod), os
 * grupos de tipo (o que pode mudar de tipo sem quebrar respostas já gravadas) e a regra de evolução.
 */
import { z } from "zod";
import { OPCOES_SIM_NAO, type CampoTipo, type SecaoBriefing } from "./briefing-schema";

export const TIPOS_DE_CAMPO = ["text", "textarea", "sim-nao", "radio", "select", "checkbox", "checkbox-single"] as const;

export const ROTULO_TIPO: Record<CampoTipo, string> = {
  text: "Texto curto",
  textarea: "Parágrafo",
  "sim-nao": "Sim ou não",
  radio: "Escolha única",
  select: "Lista suspensa",
  checkbox: "Caixas de marcação",
  "checkbox-single": "Caixa de ciência",
};

/** Formatos do catálogo `lib/campos/` que o texto curto aceita (máscara na tela, validação ao gravar). */
export const FORMATOS_PERMITIDOS = ["email", "telefone", "cpf", "cnpj", "cpfCnpj", "cep"] as const;

export const ROTULO_FORMATO: Record<(typeof FORMATOS_PERMITIDOS)[number], string> = {
  email: "E-mail",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  cpfCnpj: "CPF ou CNPJ",
  cep: "CEP",
};

/** O tipo guarda uma lista de opções escolhidas pelo editor? (sim/não tem as suas fixas.) */
export function tipoUsaOpcoes(tipo: CampoTipo): boolean {
  return tipo === "radio" || tipo === "select" || tipo === "checkbox" || tipo === "checkbox-single";
}

/**
 * Grupo de formato da resposta gravada. Trocar de tipo DENTRO do grupo mantém a resposta válida;
 * fora dele a resposta mudaria de forma (texto ↔ lista), então o servidor recusa.
 */
export type GrupoDeTipo = "texto" | "unica" | "multipla" | "ciencia";

export function grupoDoTipo(tipo: CampoTipo): GrupoDeTipo {
  if (tipo === "text" || tipo === "textarea") return "texto";
  if (tipo === "radio" || tipo === "select" || tipo === "sim-nao") return "unica";
  if (tipo === "checkbox") return "multipla";
  return "ciencia";
}

const texto = (max: number, msg: string) => z.string("Texto inválido.").trim().min(1, msg).max(max, `Use até ${max} caracteres.`);
const textoOpc = (max: number) => z.string("Texto inválido.").trim().max(max, `Use até ${max} caracteres.`).optional();

const campoSchema = z
  .object({
    chave: z.string("Chave de pergunta inválida.").regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/, "Chave de pergunta inválida."),
    label: texto(300, "Escreva a pergunta."),
    tipo: z.enum(TIPOS_DE_CAMPO, "Tipo de pergunta inválido."),
    obrigatorio: z.boolean("Indique se a resposta é obrigatória."),
    opcoes: z.array(z.string("Opção inválida.").trim().min(1, "Opção em branco.").max(300, "Opção muito longa.")).max(40, "No máximo 40 opções.").optional(),
    placeholder: textoOpc(160),
    hint: textoOpc(500),
    importarDoCadastro: z.enum(["email", "nome", "telefone", "endereco"], "Origem de cadastro inválida.").optional(),
    formato: z.enum(FORMATOS_PERMITIDOS, "Formato de campo inválido.").optional(),
  })
  .transform((c, ctx) => {
    const base = { ...c, opcoes: c.opcoes?.filter((o) => o !== "") };
    if (c.tipo === "sim-nao") return { ...base, opcoes: [...OPCOES_SIM_NAO], formato: undefined };
    if (!tipoUsaOpcoes(c.tipo)) return { ...base, opcoes: undefined, formato: c.tipo === "text" ? c.formato : undefined };
    const opcoes = base.opcoes ?? [];
    if (c.tipo === "checkbox-single") {
      if (opcoes.length !== 1) ctx.addIssue({ code: "custom", message: `“${c.label}”: a caixa de ciência tem um texto só.` });
    } else if (opcoes.length < 2) {
      ctx.addIssue({ code: "custom", message: `“${c.label}”: informe pelo menos duas opções.` });
    }
    if (new Set(opcoes).size !== opcoes.length) ctx.addIssue({ code: "custom", message: `“${c.label}”: há opções repetidas.` });
    return { ...base, opcoes, formato: undefined };
  });

const secaoSchema = z.object({
  id: z.string("Identificador de seção inválido.").regex(/^[A-Za-z][A-Za-z0-9_-]{0,59}$/, "Identificador de seção inválido."),
  titulo: texto(120, "Dê um título à seção."),
  descricao: textoOpc(800),
  disciplinas: z
    .array(z.string("Termo inválido.").trim().min(1, "Termo de disciplina em branco.").max(60, "Use até 60 caracteres em cada termo de disciplina."))
    .max(10, "No máximo 10 termos de disciplina.")
    .optional()
    .transform((d) => (d && d.length > 0 ? [...new Set(d)] : undefined)),
  campos: z.array(campoSchema, "Perguntas inválidas.").max(60, "No máximo 60 perguntas por seção."),
});

export const esquemaBriefingSchema = z
  .array(secaoSchema, "Formulário inválido.")
  .min(1, "O formulário precisa de pelo menos uma seção.")
  .max(30, "No máximo 30 seções.")
  .superRefine((secoes, ctx) => {
    const ids = new Set<string>();
    const chaves = new Set<string>();
    let total = 0;
    for (const s of secoes) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: "Há seções repetidas." });
      ids.add(s.id);
      for (const c of s.campos) {
        total += 1;
        if (chaves.has(c.chave)) ctx.addIssue({ code: "custom", message: `Pergunta repetida: “${c.label}”.` });
        chaves.add(c.chave);
      }
    }
    if (total > 300) ctx.addIssue({ code: "custom", message: "No máximo 300 perguntas no formulário." });
  });

/** O esquema como o servidor grava: validado, com as opções do sim/não e sem lixo por tipo. */
export type EsquemaBriefing = SecaoBriefing[];

export function validarEsquema(
  bruto: unknown,
): { ok: true; esquema: EsquemaBriefing } | { ok: false; erro: string } {
  const r = esquemaBriefingSchema.safeParse(bruto);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Formulário inválido." };
  // `undefined` some do JSON; o tipo de saída do Zod já é compatível com SecaoBriefing.
  return { ok: true, esquema: r.data as EsquemaBriefing };
}

/**
 * Regra de evolução: o que já estava salvo não pode mudar de grupo de tipo (a resposta gravada
 * mudaria de forma). Devolve uma frase por problema; vazio = pode gravar.
 */
export function problemasDeEvolucao(antes: readonly SecaoBriefing[] | null, depois: readonly SecaoBriefing[]): string[] {
  if (!antes) return [];
  const antigos = new Map(antes.flatMap((s) => s.campos).map((c) => [c.chave, c]));
  const problemas: string[] = [];
  for (const c of depois.flatMap((s) => s.campos)) {
    const velho = antigos.get(c.chave);
    if (!velho || velho.tipo === c.tipo) continue;
    if (grupoDoTipo(velho.tipo) !== grupoDoTipo(c.tipo)) {
      problemas.push(
        `“${c.label}”: não dá para trocar “${ROTULO_TIPO[velho.tipo]}” por “${ROTULO_TIPO[c.tipo]}” numa pergunta que já existe — crie outra pergunta e remova esta.`,
      );
    }
  }
  return problemas;
}

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";

function sufixo(sorteio: () => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[Math.floor(sorteio() * ALFABETO.length)];
  return s;
}

/** Chave nova de pergunta — nunca muda depois (a resposta é gravada por ela). */
export function novaChave(sorteio: () => number = Math.random): string {
  return `c${sufixo(sorteio)}`;
}

/** Identificador novo de seção. */
export function novoIdSecao(sorteio: () => number = Math.random): string {
  return `s${sufixo(sorteio)}`;
}
