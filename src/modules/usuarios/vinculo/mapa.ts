/**
 * Mapa determinístico `Role` (legado) → eixos novos (`TipoUsuario` × `Setor` × `Contratacao`).
 *
 * PURO e sem I/O — mesma família de `lib/encargos.ts`, `modules/projetos/health.ts` e
 * `modules/documentos/tokens.ts`. É a peça que o backfill executa e que o teste cobre, e por
 * isso precisa ser exaustiva sobre `Role`: um valor novo no enum quebra o build em vez de
 * cair num `else` silencioso.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.1)
 */
import type { Contratacao, Setor, TipoUsuario } from "@/generated/prisma/client";
import type { Role } from "@/lib/roles";

/** Motivo pelo qual a linha precisa de conferência humana depois da virada. */
export type MotivoRevisao =
  | "setor_sem_origem"
  | "sem_vinculo_definir_a_mao"
  | "pj_ou_autonomo_rpa"
  | "socio_ativo";

export type EixosDerivados = {
  tipo: TipoUsuario;
  /** `null` quando não há vínculo de trabalho (usuário externo, ou admin a definir à mão). */
  setor: Setor | null;
  contratacao: Contratacao | null;
  /** Se `false`, o backfill grava só `tipo` e não cria linha em `Vinculo`. */
  criaVinculo: boolean;
  revisar: MotivoRevisao[];
};

/**
 * Decisão do dono (2026-07-27): "a princípio, considerar todos os CLT, estágio, PJ e
 * freelancer como Engenharia". Não existe dado de origem para o setor — `User.departamento`
 * é texto livre que nenhuma tela lê. O default é seguro porque **setor não concede permissão
 * nenhuma**: errar o setor de alguém não dá nem tira acesso, só polui headcount e carga.
 */
const SETOR_PADRAO_OPERACIONAL: Setor = "engenharia";

const MAPA: Record<Role, EixosDerivados> = {
  // Super-usuário do sistema. Não é setor nem contratação — o vínculo real de quem tem
  // `admin` é definido à mão, porque o papel diz o que a pessoa pode no sistema, não como
  // ela é contratada.
  admin: { tipo: "interno", setor: null, contratacao: null, criaVinculo: false, revisar: ["sem_vinculo_definir_a_mao"] },

  // "Supervisor" passou a se chamar Coordenador (rótulo em lib/roles.ts): Engenharia, CLT.
  supervisor: { tipo: "interno", setor: "engenharia", contratacao: "clt", criaVinculo: true, revisar: [] },

  administrativo: { tipo: "interno", setor: "administrativo", contratacao: "clt", criaVinculo: true, revisar: [] },
  ti: { tipo: "interno", setor: "ti", contratacao: "clt", criaVinculo: true, revisar: [] },

  clt: {
    tipo: "interno", setor: SETOR_PADRAO_OPERACIONAL, contratacao: "clt",
    criaVinculo: true, revisar: ["setor_sem_origem"],
  },
  estagiario: {
    tipo: "interno", setor: SETOR_PADRAO_OPERACIONAL, contratacao: "estagio",
    criaVinculo: true, revisar: ["setor_sem_origem"],
  },
  projetista_pj: {
    tipo: "interno", setor: SETOR_PADRAO_OPERACIONAL, contratacao: "pj",
    criaVinculo: true, revisar: ["setor_sem_origem"],
  },
  // `freelancer` some como valor: o dono confirmou que os DOIS casos existem (PJ com CNPJ que
  // emite NF, e pessoa física via RPA). Migra como `pj` — que preserva a conta contábil 2.02
  // atual — e a reclassificação para `autonomo_rpa` é pessoa a pessoa, na Onda B, junto com o
  // cálculo de retenção (INSS/IRRF/ISS) que hoje não existe em lugar nenhum.
  freelancer: {
    tipo: "interno", setor: SETOR_PADRAO_OPERACIONAL, contratacao: "pj",
    criaVinculo: true, revisar: ["setor_sem_origem", "pj_ou_autonomo_rpa"],
  },

  // Usuário externo do portal, escopado por `User.clienteId`. Não tem setor nem contratação —
  // é outro eixo, e é justamente o que `TipoUsuario` passa a dizer explicitamente.
  cliente: { tipo: "externo", setor: null, contratacao: null, criaVinculo: false, revisar: [] },
};

/** Eixos derivados do perfil legado. Determinístico e total sobre `Role`. */
export function derivarEixos(role: Role): EixosDerivados {
  const base = MAPA[role];
  return { ...base, revisar: [...base.revisar] };
}

/**
 * Ajuste societário. `model Socio` continua sendo a fonte de verdade de "é sócio" — o eixo
 * Contratação só diz COMO a pessoa trabalha, se trabalhar. Sócio que só aporta capital não
 * tem vínculo nenhum e nem precisa de cadastro de colaborador.
 *
 * **Dois casos remunerados, não um** (§9.1 do plano, tabela): o sócio administrador recebe
 * **pró-labore**; o sócio que **fatura pela própria PJ** tem `contratacao = pj` + `pjId` — duas
 * remunerações de natureza distinta, um único usuário. A primeira versão desta função
 * colapsava os dois em `pro_labore`, e o caso da PJ só apareceu no backfill de produção em
 * 2026-08-09: um `projetista_pj` sócio ativo, que fatura pela própria PJ (confirmado pelo dono),
 * estava sendo derivado como pró-labore. `pjId` preenchido é o sinal que separa os dois — é o
 * mesmo dado que a tabela de §9.1 usa.
 */
export function aplicarSocio(
  eixos: EixosDerivados,
  socioAtivo: boolean,
  temPj = false,
): EixosDerivados {
  if (!socioAtivo) return eixos;
  if (!eixos.criaVinculo) return { ...eixos, revisar: [...eixos.revisar, "socio_ativo"] };
  // Fatura pela própria PJ → mantém `pj`. Sem PJ vinculada → pró-labore (sócio administrador).
  return {
    ...eixos,
    contratacao: temPj ? "pj" : "pro_labore",
    revisar: [...eixos.revisar, "socio_ativo"],
  };
}

/**
 * Caminho INVERSO: dos eixos novos de volta ao `Role` legado.
 *
 * Existe porque telas que ainda falam `role` precisam de um valor enquanto o enum não cai na
 * Onda F — hoje só o pré-preenchimento do cadastro (`avaliarSolicitacaoCadastro` → formulário
 * de Usuários). É a "derivação em um único ponto" que o R3 do plano pede: sem isso, cada
 * chamador inventaria o próprio `if`, e metade do sistema derivaria diferente da outra metade.
 *
 * **Some junto com `User.role`.** Quando o formulário de Usuários passar a falar Setor ×
 * Contratação direto, esta função não tem mais chamador e vai embora com o enum.
 *
 * Não é bijeção: `pj` volta como `projetista_pj` (o papel mais comum), e `pro_labore` não tem
 * papel próprio — cai em `clt`, que é o mais próximo em jornada/folha. Nenhum dos dois importa
 * para o único uso atual, que é palpite de formulário revisado por um humano antes de gravar.
 */
export function roleLegadoDe(
  tipo: TipoUsuario,
  contratacao: Contratacao | null,
): Role {
  if (tipo === "externo") return "cliente";
  switch (contratacao) {
    case "clt":
      return "clt";
    case "estagio":
      return "estagiario";
    case "pj":
      return "projetista_pj";
    case "autonomo_rpa":
      return "freelancer";
    case "pro_labore":
      return "clt";
    case null:
      return "clt";
  }
}
