import type { Role } from "@/lib/roles";
import { CLT_ROLES, GLOBAL_ROLES, HR_ADMIN_ROLES, INTERNAL_ROLES, PJ_ROLES, PROJETO_MEMBRO_ROLES } from "@/lib/roles";
import { CHAT_ROLES, DM_ROLES_EXCLUIDAS, ROLES_GLOBAIS_CHAT } from "@/modules/chat/roles";

/**
 * Registro das **audiências** do sistema: os conjuntos de usuários resolvidos por `role` para
 * decidir QUEM recebe uma notificação ou QUEM aparece num seletor de pessoas.
 *
 * Existe por causa do risco R2 do plano de Setor × Contratação × Perfil de acesso
 * (docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md, §6.2 passo 4 e §7-R2):
 * audiência **não passa por `can()`**. Quando a Onda D trocar a autorização de `role` para
 * Perfil de acesso, o arnês de permissão (`equivalencia-permissoes.ts`) continua verde mesmo
 * que uma audiência mude — e a falha é silenciosa: aprovação que deixa de notificar, alerta de
 * certidão que some, digest vazio. Ninguém percebe por semanas, porque não gera erro nem log.
 *
 * **A regra que dá valor a este arquivo:** o call-site e o arnês têm que usar a MESMA definição.
 * Um registro que apenas *repetisse* os filtros espalhados pelo código não provaria nada — ele
 * divergiria do código que deveria certificar. Por isso `whereAudiencia()` é o filtro de
 * verdade, consumido pelos call-sites, e `scripts/snapshot-audiencia.ts` importa daqui.
 * Ao mexer numa audiência, mexa AQUI — nunca reescrevendo o `where` no módulo.
 *
 * Chaves são estáveis: `logs/snapshot-audiencia-*.json` referencia por chave para comparar
 * antes×depois. Renomear uma chave invalida os snapshots antigos.
 *
 * Filtros que NÃO são de papel (`id: { not: ... }`, `email: { not: "" }`, `recurso: null`,
 * `vinculos: { none: {} }`) continuam no call-site: eles não mudam na migração e recortar
 * a audiência por eles esconderia justamente o que o arnês precisa enxergar.
 */

export type ModoAudiencia = "in" | "notIn";

export type Audiencia = {
  /** pt-BR: o que este conjunto de pessoas significa no negócio. */
  descricao: string;
  modo: ModoAudiencia;
  roles: readonly Role[];
};

export const AUDIENCIAS = {
  /** admin + supervisor. */
  global: {
    descricao: "Gestão global — vê tudo, aprova tudo (notificarAdmins, aprovadores do financeiro, suporte, digest semanal, aprovação de disciplina, validação de arquivo)",
    modo: "in",
    roles: GLOBAL_ROLES,
  },
  /** admin + supervisor + administrativo, com intenção de RH. */
  rh_admin: {
    descricao: "Quem administra RH (ponto, escala, folha, banco de horas) — destinatário de NF, abono, conta bancária, pedido de cadastro",
    modo: "in",
    roles: HR_ADMIN_ROLES,
  },
  /**
   * Mesmo conjunto de `rh_admin` HOJE, chave separada de propósito: a intenção é "gestão
   * operacional do escritório", não RH. Na Onda D as duas provavelmente viram permissões
   * diferentes — fundir agora perderia essa distinção de forma irreversível.
   */
  gestao_operacional: {
    descricao: "Gestão operacional do escritório — entrega de disciplina, pagamento, certidões, projeto ganho no comercial",
    modo: "in",
    roles: HR_ADMIN_ROLES,
  },
  /** clt + estagiario. */
  clt: {
    descricao: "Colaboradores CLT/estágio — holerite, banco de horas, lembrete e resumo de ponto, direito a férias",
    modo: "in",
    roles: CLT_ROLES,
  },
  /** Todos menos cliente. */
  interno: {
    descricao: "Usuários internos — elegíveis a escala de jornada e a membro/responsável de projeto",
    modo: "in",
    roles: INTERNAL_ROLES,
  },
  projeto_membro: {
    descricao: "Perfis que podem ser membro/responsável de projeto — matriz de produtividade e seletor do Estúdio",
    modo: "in",
    roles: PROJETO_MEMBRO_ROLES,
  },
  pj: {
    descricao: "Projetistas PJ/freelancer — candidatos a vincular a uma pessoa jurídica",
    modo: "in",
    roles: PJ_ROLES,
  },
  chat_participante: {
    descricao: "Participantes do chat — entram no canal #geral (cliente, freelancer e ti ficam de fora)",
    modo: "in",
    roles: CHAT_ROLES,
  },
  chat_global: {
    descricao: "Visíveis em todos os canais de projeto/disciplina do chat",
    modo: "in",
    roles: ROLES_GLOBAIS_CHAT,
  },
  chat_dm: {
    descricao: "Elegíveis a conversa direta no chat — exclui cliente e freelancer",
    modo: "notIn",
    roles: DM_ROLES_EXCLUIDAS,
  },
  planejamento_recurso: {
    descricao: "Usuários que podem virar Recurso no planejamento — exclui cliente e freelancer",
    modo: "notIn",
    roles: ["cliente", "freelancer"],
  },
} as const satisfies Record<string, Audiencia>;

export type AudienciaKey = keyof typeof AUDIENCIAS;

export const AUDIENCIA_KEYS = Object.keys(AUDIENCIAS) as AudienciaKey[];

/**
 * Fragmento de `where` do Prisma da audiência. É o filtro REAL — os call-sites espalham este
 * objeto (`where: { ...whereAudiencia("global"), id: { not: user.id } }`) para que exista uma
 * única definição, compartilhada com o arnês.
 */
export function whereAudiencia(chave: AudienciaKey): {
  ativo: true;
  role: { in: Role[] } | { notIn: Role[] };
} {
  const a = AUDIENCIAS[chave];
  const roles = [...a.roles] as Role[];
  return { ativo: true, role: a.modo === "in" ? { in: roles } : { notIn: roles } };
}

/**
 * Audiências cujo conjunto de papéis é ARGUMENTO, não constante — não cabem em `AUDIENCIAS`.
 * Ficam registradas aqui para que o arnês as fotografe no CALLER, com os argumentos concretos,
 * em vez de inventar um conjunto estático que não corresponderia a nenhuma chamada real.
 */
export const AUDIENCIAS_PARAMETRIZADAS = [
  {
    chave: "jobs:gestores",
    onde: "src/lib/jobs-handlers.ts",
    descricao: "gestores(roles) — default admin+supervisor+administrativo; o digest semanal chama com admin+supervisor",
    argumentosConhecidos: [
      ["admin", "supervisor", "administrativo"],
      ["admin", "supervisor"],
    ] as Role[][],
  },
  {
    chave: "financeiro:aprovadoresPorPapeis",
    onde: "src/modules/financeiro/aprovacao/queries.ts",
    descricao: "aprovadoresPorPapeis(papeis) — papéis vêm da configuração de aprovação gravada no banco, não do código",
    argumentosConhecidos: [] as Role[][],
  },
  {
    chave: "avisos:alvoRoles",
    onde: "src/modules/notificacoes/avisos/service.ts",
    descricao: "alvo do Aviso — papéis são DADO por linha (Aviso.alvoRoles), um dos 4 campos de 'Role como dado' do R6, não uma audiência de código",
    argumentosConhecidos: [] as Role[][],
  },
] as const;
