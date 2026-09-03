import type { Role } from "@/lib/roles";
import { CLT_ROLES, INTERNAL_ROLES, PJ_ROLES, PROJETO_MEMBRO_ROLES } from "@/lib/roles";
import { ROLES_GLOBAIS_CHAT } from "@/modules/chat/roles";

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

/** Fragmento de `where` de `User`. Tipado à mão para o arquivo seguir puro (sem importar Prisma). */
export type WhereAudiencia = { ativo: true } & Record<string, unknown>;

/**
 * Audiência resolvida por PAPEL — o formato original. Continua sendo o certo para os conjuntos
 * que **não são acesso**: vínculo trabalhista (`clt`, `pj`), interno × externo (`interno`),
 * elegibilidade a virar membro de projeto/recurso. Não existe `recurso:acao` que signifique
 * "é CLT" ou "é gente de dentro", e inventar pares falsos seria pior (ver a docstring de
 * `nav-config.ts`): eles seriam semeados em todo perfil e medidos pelo gate como se fossem
 * acesso a alguma coisa.
 */
export type AudienciaPorPapel = {
  /** pt-BR: o que este conjunto de pessoas significa no negócio. */
  descricao: string;
  modo: ModoAudiencia;
  roles: readonly Role[];
};

/**
 * Audiência resolvida por PERMISSÃO — para os conjuntos que **são** decisão de acesso e por
 * isso devem seguir a matriz configurável, não uma lista fixa em código.
 *
 * É a correção do risco R2 descrito no topo deste arquivo: enquanto a audiência resolvia por
 * `role` e o gate resolvia por `can()`, os dois podiam divergir sem que nada quebrasse — a
 * pessoa recebia a notificação e levava 403, ou deixava de receber sem que ninguém percebesse.
 */
export type AudienciaPorPermissao = {
  descricao: string;
  modo: "permissao";
  /** `"recurso:acao"` — precisa existir em `PERMISSOES_CATALOGO`. */
  permissao: string;
};

export type Audiencia = AudienciaPorPapel | AudienciaPorPermissao;

export const AUDIENCIAS = {
  /** admin + supervisor. */
  global: {
    descricao: "Gestão global — notificarAdmins, aprovadores do financeiro, suporte, digest semanal, aprovação de disciplina, validação de arquivo",
    modo: "permissao",
    permissao: "notificacoes:gestao",
  },
  /** admin + supervisor + administrativo, com intenção de RH. */
  rh_admin: {
    descricao: "Quem administra RH (ponto, escala, folha, banco de horas) — destinatário de NF, abono, conta bancária, pedido de cadastro",
    modo: "permissao",
    permissao: "notificacoes:rh",
  },
  /**
   * Mesmo conjunto de `rh_admin` HOJE, chave separada de propósito: a intenção é "gestão
   * operacional do escritório", não RH. Na Onda D as duas provavelmente viram permissões
   * diferentes — fundir agora perderia essa distinção de forma irreversível.
   */
  gestao_operacional: {
    descricao: "Gestão operacional do escritório — entrega de disciplina, pagamento, certidões, projeto ganho no comercial",
    modo: "permissao",
    permissao: "notificacoes:operacional",
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
    descricao: "Quem entra no canal #geral do chat — segue a permissão `chat:geral`, configurável por perfil",
    modo: "permissao",
    permissao: "chat:geral",
  },
  chat_global: {
    descricao: "Visíveis em todos os canais de projeto/disciplina do chat",
    modo: "in",
    roles: ROLES_GLOBAIS_CHAT,
  },
  chat_dm: {
    descricao: "Elegíveis a conversa direta no chat — segue a permissão `chat:dm`, configurável por perfil",
    modo: "permissao",
    permissao: "chat:dm",
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
export function whereAudiencia(chave: AudienciaKey, agora: Date = new Date()): WhereAudiencia {
  const a = AUDIENCIAS[chave];
  if (a.modo === "permissao") {
    const [recurso, acao] = a.permissao.split(":");
    return wherePermissao(recurso, acao, agora);
  }
  const roles = [...a.roles] as Role[];
  return { ativo: true, role: a.modo === "in" ? { in: roles } : { notIn: roles } };
}

/**
 * Fragmento de `where` que resolve **quem tem `recurso:acao`** — o espelho, em SQL, da ordem de
 * resolução de `permissaoEfetiva` (`lib/permissao-efetiva.ts`):
 *
 *   1. inativo             → fora (o `ativo: true` de fora do OR)
 *   2. `superUsuario`      → dentro, sem passar pela matriz
 *   3. override vigente    → vale o override, inclusive para NEGAR o que o perfil concede
 *   4. permissão do perfil → dentro, se não houver override negando
 *
 * As duas resoluções PRECISAM continuar iguais: é o ponto do R2. Se `permissaoEfetiva` mudar de
 * ordem, este `where` muda junto — senão a pessoa recebe notificação e leva 403, ou some do
 * seletor sem motivo. `perfil.ativo` NÃO é conferido aqui de propósito: `permissaoEfetiva`
 * também não confere (carrega por `perfilId`), e divergir "para melhorar" é como o R2 nasce.
 *
 * PURO e SÍNCRONO de propósito: é só a montagem do filtro, o banco resolve. Assim nenhum
 * call-site precisa virar `async` e o arnês continua fotografando sem I/O extra.
 *
 * COMPOSIÇÃO: usa `AND` no topo justamente para poder ser espalhado (`{ ...wherePermissao(...),
 * id: { not: x } }`) sem colidir com um `OR` do call-site. Só não espalhe junto de outro `AND`.
 */
export function wherePermissao(recurso: string, acao: string, agora: Date = new Date()): WhereAudiencia {
  // Override só conta enquanto vigente — expirado é como se não existisse (§5.2).
  const overrideVigente = {
    recurso,
    acao,
    OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }],
  };
  return {
    ativo: true,
    AND: [
      {
        OR: [
          { superUsuario: true },
          { overrides: { some: { ...overrideVigente, permitido: true } } },
          {
            perfil: { permissoes: { some: { recurso, acao, permitido: true } } },
            NOT: { overrides: { some: { ...overrideVigente, permitido: false } } },
          },
        ],
      },
    ],
  };
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
