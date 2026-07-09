/**
 * Fase 4 — campos que o PRÓPRIO colaborador pode propor alteração (com validação do RH).
 * Fora daqui (salário, cargo, role, CPF, RG, nome, nomeCompleto, admissão) NÃO é auto-editável.
 * Pura e client-safe: usada pela UI (labels) e pelas actions (whitelist server-side).
 */
export const CAMPOS_AUTOEDITAVEIS = [
  { campo: "telefone", label: "Telefone", grupo: "Contato", sensivel: false },
  { campo: "emailPessoal", label: "E-mail pessoal", grupo: "Contato", sensivel: false },
  { campo: "contatoEmergenciaNome", label: "Contato de emergência", grupo: "Emergência", sensivel: false },
  { campo: "telefoneEmergencia", label: "Telefone de emergência", grupo: "Emergência", sensivel: false },
  { campo: "enderecoCep", label: "CEP", grupo: "Endereço", sensivel: false },
  { campo: "enderecoLogradouro", label: "Logradouro", grupo: "Endereço", sensivel: false },
  { campo: "enderecoNumero", label: "Número", grupo: "Endereço", sensivel: false },
  { campo: "enderecoComplemento", label: "Complemento", grupo: "Endereço", sensivel: false },
  { campo: "enderecoBairro", label: "Bairro", grupo: "Endereço", sensivel: false },
  { campo: "enderecoCidade", label: "Cidade", grupo: "Endereço", sensivel: false },
  { campo: "enderecoUf", label: "UF", grupo: "Endereço", sensivel: false },
  // Dados bancários = vetor de fraude → validação reforçada (marcados como sensíveis na fila do RH).
  { campo: "banco", label: "Banco", grupo: "Dados bancários", sensivel: true },
  { campo: "agencia", label: "Agência", grupo: "Dados bancários", sensivel: true },
  { campo: "conta", label: "Conta", grupo: "Dados bancários", sensivel: true },
  { campo: "tipoContaBancaria", label: "Tipo de conta", grupo: "Dados bancários", sensivel: true },
] as const;

export type CampoAutoeditavel = (typeof CAMPOS_AUTOEDITAVEIS)[number]["campo"];

export const CAMPOS_AUTOEDITAVEIS_SET: ReadonlySet<string> = new Set(
  CAMPOS_AUTOEDITAVEIS.map((c) => c.campo),
);

export const LABEL_CAMPO: Record<string, string> = Object.fromEntries(
  CAMPOS_AUTOEDITAVEIS.map((c) => [c.campo, c.label]),
);

export const CAMPO_SENSIVEL: ReadonlySet<string> = new Set(
  CAMPOS_AUTOEDITAVEIS.filter((c) => c.sensivel).map((c) => c.campo),
);
