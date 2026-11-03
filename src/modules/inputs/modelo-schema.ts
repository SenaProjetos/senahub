/**
 * Modelo de formulário do briefing (`ModeloBriefing.esquema`) — regras puras, sem Prisma/React.
 * O esquema é a lista de seções → campos de `briefing-schema.ts`; aqui ficam a validação (Zod), os
 * grupos de tipo (o que pode mudar de tipo sem quebrar respostas já gravadas) e a regra de evolução.
 */
import { z } from "zod";
import { OPCOES_SIM_NAO, TIPOS_CONTROLADORES, type CampoBriefing, type CampoTipo, type SecaoBriefing } from "./briefing-schema";

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
    condicao: z
      .object({
        campo: z.string("Pergunta de condição inválida.").regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/, "Pergunta de condição inválida."),
        igual: z
          .array(z.string("Resposta de condição inválida.").trim().min(1, "Resposta de condição em branco.").max(300, "Resposta de condição muito longa."))
          .min(1, "Escolha pelo menos uma resposta que mostra a pergunta.")
          .max(40, "No máximo 40 respostas na condição."),
      }, "Condição inválida.")
      .optional(),
  }, "Pergunta inválida.")
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
}, "Seção inválida.");

export const esquemaBriefingSchema = z
  .array(secaoSchema, "Formulário inválido.")
  .min(1, "O formulário precisa de pelo menos uma seção.")
  .max(30, "No máximo 30 seções.")
  .superRefine((secoes, ctx) => {
    const ids = new Set<string>();
    const chaves = new Set<string>();
    const anteriores = new Map<string, { label: string; tipo: CampoTipo; opcoes: readonly string[] }>();
    let total = 0;
    for (const s of secoes) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: "Há seções repetidas." });
      ids.add(s.id);
      for (const c of s.campos) {
        total += 1;
        if (chaves.has(c.chave)) ctx.addIssue({ code: "custom", message: `Pergunta repetida: “${c.label}”.` });
        chaves.add(c.chave);
        const problema = c.condicao ? problemaDaCondicao(c.label, c.condicao, anteriores) : null;
        if (problema) ctx.addIssue({ code: "custom", message: problema });
        anteriores.set(c.chave, { label: c.label, tipo: c.tipo, opcoes: c.tipo === "sim-nao" ? OPCOES_SIM_NAO : (c.opcoes ?? []) });
      }
    }
    if (total > 300) ctx.addIssue({ code: "custom", message: "No máximo 300 perguntas no formulário." });
  });

/**
 * A condição vale? A controladora tem de vir ANTES (já vista), ser de escolha e as respostas da condição
 * têm de ser opções dela. Devolve a frase do problema, ou `null`.
 */
function problemaDaCondicao(
  label: string,
  condicao: NonNullable<CampoBriefing["condicao"]>,
  anteriores: ReadonlyMap<string, { label: string; tipo: CampoTipo; opcoes: readonly string[] }>,
): string | null {
  const ctrl = anteriores.get(condicao.campo);
  if (!ctrl) return `“${label}”: a pergunta que a controla precisa existir e vir antes dela no formulário.`;
  if (!TIPOS_CONTROLADORES.includes(ctrl.tipo)) return `“${label}”: só pergunta de escolha pode controlar outra (“${ctrl.label}” é ${ROTULO_TIPO[ctrl.tipo].toLowerCase()}).`;
  const fora = condicao.igual.find((r) => !ctrl.opcoes.includes(r));
  if (fora !== undefined) return `“${label}”: a resposta “${fora}” não é uma opção de “${ctrl.label}”.`;
  if (new Set(condicao.igual).size !== condicao.igual.length) return `“${label}”: há respostas repetidas na condição.`;
  return null;
}

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

// ── Renomear opção: migração das respostas já gravadas (Lote 4b) ─────────────────────────────

export type Renomeio = { chave: string; de: string; para: string };

export const renomeioSchema = z.object({
  chave: z.string("Pergunta inválida.").regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/, "Pergunta inválida."),
  de: z.string("Opção inválida.").min(1, "Opção inválida.").max(300, "Opção inválida."),
  para: z.string("Opção inválida.").min(1, "Opção inválida.").max(300, "Opção inválida."),
}, "Alteração de opção inválida.");

/**
 * Os renomeios que o editor mandou conferem com o esquema novo? Só pergunta de escolha com lista de
 * opções (escolha única, lista, caixas) migra; `para` tem de ser opção da pergunta; sem `de` repetido.
 * Devolve a frase do problema ou `null`.
 */
export function problemaDosRenomeios(
  renomeios: readonly Renomeio[],
  depois: readonly SecaoBriefing[],
  /** Esquema que estava salvo (`null` = ilegível: nada é conhecido, nenhum renomeio vale); omitido = não confere o antigo. */
  antes?: readonly SecaoBriefing[] | null,
): string | null {
  const campos = new Map(depois.flatMap((s) => s.campos).map((c) => [c.chave, c]));
  const antigos = antes === undefined ? null : new Map((antes ?? []).flatMap((s) => s.campos).map((c) => [c.chave, c]));
  const vistos = new Set<string>();
  for (const r of renomeios) {
    const c = campos.get(r.chave);
    if (!c || !["radio", "select", "checkbox"].includes(c.tipo)) return "Uma opção alterada não existe mais neste formulário. Recarregue a página e tente de novo.";
    if (r.de === r.para || !(c.opcoes ?? []).includes(r.para)) return `“${c.label}”: a mudança de nome da opção “${r.de}” não confere com o formulário.`;
    // `de` tem de ser uma opção que ESTAVA salva e que saiu (ou que só continua existindo porque outra opção foi
    // renomeada para o texto dela, como na troca A↔B): senão um pedido forjado reescreveria resposta de opção viva.
    const ocupadaPorOutra = renomeios.some((o) => o.chave === r.chave && o.para === r.de);
    if (antigos && (!(antigos.get(r.chave)?.opcoes ?? []).includes(r.de) || ((c.opcoes ?? []).includes(r.de) && !ocupadaPorOutra))) {
      return `“${c.label}”: a mudança de nome da opção “${r.de}” não confere com o formulário salvo. Recarregue a página e tente de novo.`;
    }
    const k = `${r.chave} ${r.de}`;
    if (vistos.has(k)) return `“${c.label}”: a opção “${r.de}” aparece renomeada duas vezes.`;
    vistos.add(k);
  }
  return null;
}

/**
 * Aplica os renomeios às respostas de UM briefing: escolha única troca o valor, caixas trocam na lista (sem
 * repetir). A troca é simultânea (A↔B funciona). `alteradas` = quantas respostas mudaram.
 */
export function migrarRespostas(
  respostas: Record<string, unknown>,
  renomeios: readonly Renomeio[],
): { respostas: Record<string, unknown>; alteradas: number } {
  const porChave = new Map<string, Map<string, string>>();
  for (const r of renomeios) {
    const m = porChave.get(r.chave) ?? new Map<string, string>();
    m.set(r.de, r.para);
    porChave.set(r.chave, m);
  }
  const saida = { ...respostas };
  let alteradas = 0;
  for (const [chave, mapa] of porChave) {
    const v = saida[chave];
    if (typeof v === "string" && mapa.has(v)) {
      saida[chave] = mapa.get(v);
      alteradas += 1;
    } else if (Array.isArray(v) && v.some((x) => typeof x === "string" && mapa.has(x))) {
      saida[chave] = [...new Set(v.map((x) => (typeof x === "string" && mapa.has(x) ? mapa.get(x)! : x)))];
      alteradas += 1;
    }
  }
  return { respostas: saida, alteradas };
}
