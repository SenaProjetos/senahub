import { whereControlaJornada } from "@/modules/ponto/jornada";

/**
 * Registro das **audiências** do sistema: os conjuntos de usuários que decidem QUEM recebe uma
 * notificação ou QUEM aparece num seletor de pessoas.
 *
 * Audiência **não passa por `can()`**, e é por isso que existe um registro: o call-site e o
 * teste usam a MESMA definição (`whereAudiencia()`), em vez de cada módulo reescrever seu
 * `where`. Ao mexer numa audiência, mexa AQUI — nunca reescrevendo o `where` no módulo.
 *
 * Desde a Onda F nenhuma audiência lê o papel legado (`User.role` saiu): cada uma é resolvida por
 * PERMISSÃO (segue o Perfil de acesso), por JORNADA (contratação), por TIPO (interno × externo)
 * ou por EIXO do vínculo (setor, contratação).
 *
 * Filtros que NÃO definem o conjunto (`id: { not: ... }`, `email: { not: "" }`, `recurso: null`)
 * continuam no call-site.
 */

/** Fragmento de `where` de `User`. Tipado à mão para o arquivo seguir puro (sem importar Prisma). */
export type WhereAudiencia = { ativo: true } & Record<string, unknown>;

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

/**
 * Audiência resolvida por JORNADA CONTROLADA — pela contratação do vínculo, com o papel só como
 * fallback de quem nunca teve vínculo. Existe porque "é CLT" não é papel nem permissão: um
 * Administrativo contratado CLT bate ponto, tem holerite e tem férias. A regra mora em
 * `modules/ponto/jornada.ts` (`whereControlaJornada`), a mesma que os gates de batida e férias usam
 * — audiência e gate não podem divergir (R2).
 */
export type AudienciaPorJornada = {
  descricao: string;
  modo: "jornada";
};

/**
 * Audiência resolvida pelo eixo INTERNO × EXTERNO (`User.tipo`, obrigatório desde a Onda F, bloco C).
 * Mesmo campo que `requireInterno()` e o `interno: true` do `defineAction` leem.
 */
export type AudienciaPorTipo = {
  descricao: string;
  modo: "tipo";
  tipo: "interno" | "externo";
};

/**
 * Audiência resolvida por um filtro fixo sobre os eixos do vínculo (`setor`, `contratacao`) —
 * conjuntos que não são acesso nem jornada. Onda F, bloco D.
 */
export type AudienciaPorEixo = {
  descricao: string;
  modo: "eixo";
  where: Record<string, unknown>;
};

export type Audiencia = AudienciaPorPermissao | AudienciaPorJornada | AudienciaPorTipo | AudienciaPorEixo;

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
  /**
   * Contratação CLT ou estágio (pelo vínculo), qualquer papel. Até 2026-09-15 era o papel
   * (`clt` + `estagiario`), o que tirava da folha e dos lembretes de ponto quem era contratado CLT
   * com papel Administrativo ou TI. Chave mantida: snapshots antigos a referenciam.
   */
  clt: {
    descricao: "Contratação CLT/estágio — holerite, banco de horas, lembrete e resumo de ponto, direito a férias",
    modo: "jornada",
  },
  /** Todos menos cliente — pelo eixo `tipo` desde a Onda F. */
  interno: {
    descricao: "Usuários internos — elegíveis a escala de jornada e a membro/responsável de projeto",
    modo: "tipo",
    tipo: "interno",
  },
  /** Setor Engenharia (Onda F, bloco D — era `PROJETO_MEMBRO_ROLES`). Setor não autoriza nada: é audiência. */
  projeto_membro: {
    descricao: "Equipe de Engenharia — membro/responsável de projeto, matriz de produtividade e seletor do Estúdio",
    modo: "eixo",
    where: { tipo: "interno", setor: "engenharia" },
  },
  /** Prestador PJ/RPA (Onda F, bloco D — era `PJ_ROLES`). */
  pj: {
    descricao: "Prestadores PJ/RPA — candidatos a vincular a uma pessoa jurídica",
    modo: "eixo",
    where: { contratacao: { in: ["pj", "autonomo_rpa"] } },
  },
  /** Gestão de RH — destinatários de avisos de RH (férias, abonos, documentos). Onda F, §16.4. */
  rh_gestao: {
    descricao: "Gestão de RH — segue a permissão `rh:gerir`, concedida pessoa a pessoa",
    modo: "permissao",
    permissao: "rh:gerir",
  },
  chat_participante: {
    descricao: "Quem entra no canal #geral do chat — segue a permissão `chat:geral`, configurável por perfil",
    modo: "permissao",
    permissao: "chat:geral",
  },
  /** Escopo de dados ("enxerga todos os projetos"): o mesmo eixo de `escopo:global`, não um gate de tela. */
  chat_global: {
    descricao: "Visíveis em todos os canais de projeto/disciplina do chat — segue `escopo:global`",
    modo: "permissao",
    permissao: "escopo:global",
  },
  chat_dm: {
    descricao: "Elegíveis a conversa direta no chat — segue a permissão `chat:dm`, configurável por perfil",
    modo: "permissao",
    permissao: "chat:dm",
  },
  /**
   * Quem pode virar Recurso no planejamento: interno, exceto o prestador SEM CNPJ (o "freelancer" —
   * regra do dono, 2026-10-10: prestador com pessoa jurídica é PJ, sem ela é freelancer).
   */
  planejamento_recurso: {
    descricao: "Usuários que podem virar Recurso no planejamento — internos, exceto prestador sem CNPJ (freelancer)",
    modo: "eixo",
    where: { tipo: "interno", NOT: { contratacao: { in: ["pj", "autonomo_rpa"] }, pjId: null } },
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
  if (a.modo === "jornada") return whereControlaJornada();
  if (a.modo === "tipo") return { ativo: true, tipo: a.tipo };
  if (a.modo === "eixo") return { ativo: true, ...a.where };
  const nunca: never = a;
  throw new Error(`audiência desconhecida: ${JSON.stringify(nunca)}`);
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
