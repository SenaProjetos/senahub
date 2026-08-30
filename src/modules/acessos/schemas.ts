import { z } from "zod";
import { TIPOS_ALVO, STATUS_CREDENCIAL } from "./service";

/** UFs + os dois valores não-geográficos que a spec §10 exige no filtro de Estado. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** `NA` = não aplicável (software nacional, §15 mostra "—"). Guardado como valor, não como null,
 *  para distinguir "não se aplica" de "ninguém preencheu ainda". */
export const ESTADOS = [...UFS, "NACIONAL", "NA"] as const;

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === "" ? undefined : v));

/**
 * URL do portal. Só http/https: `javascript:` e `data:` viram XSS no "Abrir plataforma" (§55),
 * e o link é renderizado com o href vindo do banco.
 */
const urlPortal = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "A URL deve começar com http:// ou https://")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const compartilhamentoSchema = z.object({
  tipoAlvo: z.enum(TIPOS_ALVO),
  alvoId: z.string().min(1, "Selecione o alvo do compartilhamento."),
  podeVerCadastro: z.boolean().default(false),
  podeVerCredencial: z.boolean().default(false),
  podeEditar: z.boolean().default(false),
  podeGerenciarPermissoes: z.boolean().default(false),
});

const camposCredencial = {
  nome: z.string().trim().min(1, "Informe o nome.").max(150),
  nomeCompleto: textoOpcional(255),
  categoriaId: z.string().min(1, "Selecione a categoria."),
  estado: z.enum(ESTADOS).optional(),
  descricao: textoOpcional(5000),
  url: urlPortal,
  responsavelId: z.string().min(1).optional(),
  status: z.enum(STATUS_CREDENCIAL).default("ativo"),
  vencimentoEm: z.coerce.date().optional(),
  proximaRevisaoEm: z.coerce.date().optional(),
  renovacaoAutomatica: z.boolean().default(false),
  // Licença (§36) — só fazem sentido quando a categoria é software/licença; a UI decide
  // quando mostrar, o schema apenas aceita.
  fornecedor: textoOpcional(255),
  tipoLicenca: textoOpcional(100),
  numeroLicenca: textoOpcional(255),
  assentos: z.coerce.number().int().min(0).max(100_000).optional(),
  dataContratacao: z.coerce.date().optional(),
  dataRenovacao: z.coerce.date().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  projetoIds: z.array(z.string().min(1)).max(200).default([]),
  compartilhamentos: z.array(compartilhamentoSchema).max(200).default([]),
};

/**
 * `usuario`/`senha` são o texto EM CLARO vindo do formulário — só existem no input, nunca no
 * retorno de leitura. Toda action que os aceita passa `redact: ["usuario", "senha"]` para não
 * gravá-los no AuditLog (§26/§33: "JAMAIS registrar a senha").
 */
export const criarCredencialSchema = z.object({
  ...camposCredencial,
  usuario: textoOpcional(200),
  senha: textoOpcional(500),
});

export const atualizarCredencialSchema = z.object({
  id: z.string().min(1),
  ...camposCredencial,
  /** Ausente = mantém o que está gravado. String vazia é tratada como "não mexer", não como
   *  "apagar" — apagar credencial é ação própria, não efeito colateral de salvar o cadastro. */
  usuario: textoOpcional(200),
  senha: textoOpcional(500),
});

export const idSchema = z.object({ id: z.string().min(1) });

export const gerenciarCompartilhamentoSchema = z.object({
  id: z.string().min(1),
  compartilhamentos: z.array(compartilhamentoSchema).max(200),
});

export const alternarFavoritoSchema = z.object({
  id: z.string().min(1),
  favorito: z.boolean(),
});

export type CriarCredencialInput = z.infer<typeof criarCredencialSchema>;
export type AtualizarCredencialInput = z.infer<typeof atualizarCredencialSchema>;
export type CompartilhamentoInput = z.infer<typeof compartilhamentoSchema>;
