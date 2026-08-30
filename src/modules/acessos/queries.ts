import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  permissoesNaCredencial,
  statusCredencial,
  type ViewerCofre,
  type PermissoesNaCredencial,
  type StatusCredencial,
} from "./service";
import type { SessionUser } from "@/lib/session";

/**
 * Leituras do cofre de Acessos.
 *
 * REGRA DO MÓDULO: a SENHA nunca sai daqui, em nenhuma função, sob nenhuma permissão — revelar
 * é caminho próprio e auditado, em `actions.ts` (§45).
 *
 * O USUÁRIO tem UMA exceção, explícita: `listarCredenciaisPaginado` o devolve decifrado nas
 * linhas em que o viewer tem `podeVerCredencial`, porque §16 o permite a quem tem a permissão e
 * a referência visual do dono o mostra na coluna "Usuário / Conta". Nas demais linhas vem
 * `null` — nunca mascarado, para não anunciar o que existe. Fora dessa função, campo cifrado
 * nenhum é devolvido.
 *
 * Os `select` são explícitos justamente para que incluir uma coluna cifrada por descuido seja
 * uma edição visível no diff, e não o efeito silencioso de um `include`.
 */

/**
 * `SessionUser` → `ViewerCofre`. Um lugar só, para o `setor` não ser esquecido num gate e o
 * compartilhamento por setor falhar em silêncio.
 *
 * Mora aqui, e não em `actions.ts`, porque naquele arquivo vale `"use server"`: todo export
 * de um módulo `"use server"` vira endpoint RPC chamável pelo cliente, e uma função que
 * RECEBE o usuário como argumento seria um convite a passar um usuário forjado.
 */
export function viewerDe(user: SessionUser): ViewerCofre {
  return {
    id: user.id,
    ativo: user.ativo,
    perfilId: user.perfilId,
    setor: user.setor,
    superUsuario: user.superUsuario,
  };
}

/** Campos seguros de uma credencial — o que uma listagem pode devolver. */
const SELECT_LISTA = {
  id: true,
  nome: true,
  nomeCompleto: true,
  estado: true,
  status: true,
  url: true,
  vencimentoEm: true,
  ultimaRevisaoEm: true,
  proximaRevisaoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  responsavelId: true,
  categoria: { select: { id: true, nome: true, icone: true } },
  responsavel: { select: { id: true, name: true, image: true, cargo: true } },
  tags: { select: { tag: true } },
  // Necessários para resolver, POR LINHA, se este viewer alcança a credencial. Nenhum dos dois
  // chega ao cliente: `montarLinha` os consome e devolve só `usuario` (ou null) e `nivelAcesso`.
  usuarioEncriptado: true,
  compartilhamentos: {
    select: {
      tipoAlvo: true,
      alvoId: true,
      podeVerCadastro: true,
      podeVerCredencial: true,
      podeEditar: true,
      podeGerenciarPermissoes: true,
    },
  },
} satisfies Prisma.CredencialSelect;

/** Detalhe = lista + o resto dos campos não sensíveis. */
const SELECT_DETALHE = {
  ...SELECT_LISTA,
  descricao: true,
  departamento: true,
  renovacaoAutomatica: true,
  fornecedor: true,
  tipoLicenca: true,
  numeroLicenca: true,
  assentos: true,
  dataContratacao: true,
  dataRenovacao: true,
  criadoPor: { select: { id: true, name: true } },
  atualizadoPor: { select: { id: true, name: true } },
  compartilhamentos: {
    select: {
      id: true,
      tipoAlvo: true,
      alvoId: true,
      podeVerCadastro: true,
      podeVerCredencial: true,
      podeEditar: true,
      podeGerenciarPermissoes: true,
    },
  },
  projetos: { select: { projeto: { select: { id: true, codigo: true, nome: true } } } },
} satisfies Prisma.CredencialSelect;

export type CredencialLista = Prisma.CredencialGetPayload<{ select: typeof SELECT_LISTA }>;

/**
 * Uma linha pronta para a tabela: sem campo cifrado, com `usuario` já resolvido pela permissão
 * daquela linha e com o nível de acesso derivado.
 */
export type LinhaListagem = Omit<
  CredencialLista,
  "usuarioEncriptado" | "compartilhamentos" | "responsavelId"
> & {
  favorita: boolean;
  statusExibido: StatusCredencial;
  usuario: string | null;
  nivelAcesso: NivelAcesso;
};

export type NivelAcesso = "setor" | "perfil" | "usuario" | "restrito";

/**
 * §18 — como a credencial é ALCANÇADA, resumido numa palavra para a coluna "Acesso".
 *
 * Prioriza o alcance mais largo: quem é partilhado com um setor inteiro é "Setor", ainda que
 * também tenha pessoas nominais. `restrito` é o caso sem alcance coletivo nenhum — é a mesma
 * definição que o card "Acessos restritos" (§7-04) conta, e as duas leituras precisam bater.
 */
export function nivelDeAcesso(
  compartilhamentos: Array<{ tipoAlvo: string; podeVerCredencial: boolean }>,
): NivelAcesso {
  const comCredencial = compartilhamentos.filter((c) => c.podeVerCredencial);
  if (comCredencial.some((c) => c.tipoAlvo === "setor")) return "setor";
  if (comCredencial.some((c) => c.tipoAlvo === "perfil")) return "perfil";
  return "restrito";
}

/**
 * Status EXIBIDO, resolvido no servidor.
 *
 * O campo `status` da tabela é o que alguém DECLAROU; o exibido também considera vencimento e
 * revisão (§19). Calcular no cliente com `new Date()` daria divergência entre o HTML do servidor
 * e o da hidratação na virada do dia — e, pior, mostraria "Ativo" numa licença vencida enquanto
 * a área de Atenção grita que ela vence, que foi exatamente o que apareceu na revisão visual.
 */
function comStatusExibido<T extends { status: string; vencimentoEm: Date | null; ultimaRevisaoEm: Date | null }>(
  c: T,
  hoje: Date,
): T & { statusExibido: StatusCredencial } {
  return { ...c, statusExibido: statusCredencial(c, hoje) };
}
export type CredencialDetalhe = Prisma.CredencialGetPayload<{ select: typeof SELECT_DETALHE }>;

/** O que o drawer recebe: cadastro + o que ESTE viewer pode fazer nele + se é favorito dele. */
export type DetalheCredencial = {
  /** `usuarioEncriptado` é removido em `buscarCredencial` — o detalhe nunca leva cifra. */
  credencial: Omit<CredencialDetalhe, "usuarioEncriptado"> & { statusExibido: StatusCredencial };
  permissoes: PermissoesNaCredencial;
  favorita: boolean;
};

/**
 * Filtro de QUAIS credenciais este viewer enxerga. É a defesa de IDOR do módulo: entra no `where`
 * de toda leitura, nunca como filtro pós-consulta (§83 — "usuário não autorizado não consegue
 * acessar credencial alterando ID manualmente").
 *
 * **NÃO usa `acessoGlobal()`**, e a diferença para `escopoProjeto` é deliberada: escopo global de
 * dados quer dizer "vê todos os PROJETOS da empresa", e estendê-lo ao cofre transformaria uma
 * permissão de leitura de carteira em acesso a todas as senhas da empresa. Aqui só `superUsuario`
 * enxerga tudo; o resto entra por compartilhamento explícito ou por ser o responsável.
 * §97: "restrição rigorosa para quem não possui autorização".
 *
 * `deletadoEm: null` é aplicado aqui: `Credencial` **não** tem extension de soft delete no
 * `lib/prisma.ts` (ao contrário de `Lancamento`), então filtrar é responsabilidade desta função.
 */
export function escopoCredencial(
  viewer: ViewerCofre,
  opts?: { incluirDeletadas?: boolean },
): Prisma.CredencialWhereInput {
  const naoDeletada: Prisma.CredencialWhereInput = opts?.incluirDeletadas ? {} : { deletadoEm: null };
  if (viewer.superUsuario) return naoDeletada;

  const alvos: Prisma.CredencialCompartilhamentoWhereInput[] = [
    { tipoAlvo: "usuario", alvoId: viewer.id },
  ];
  if (viewer.perfilId) alvos.push({ tipoAlvo: "perfil", alvoId: viewer.perfilId });
  if (viewer.setor) alvos.push({ tipoAlvo: "setor", alvoId: viewer.setor });

  return {
    AND: [
      naoDeletada,
      {
        OR: [
          // Responsável alcança o próprio cadastro — mas isso NÃO lhe dá a credencial;
          // quem decide isso é `permissoesNaCredencial`, não este filtro.
          { responsavelId: viewer.id },
          {
            compartilhamentos: {
              some: {
                AND: [
                  { OR: alvos },
                  // `podeVerCredencial` entra no OR porque ver a senha implica alcançar o
                  // cadastro onde ela é exibida.
                  { OR: [{ podeVerCadastro: true }, { podeVerCredencial: true }] },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

/**
 * Uma credencial, já com as permissões do viewer sobre ela resolvidas.
 *
 * Devolve `null` tanto para "não existe" quanto para "existe mas você não alcança" — distinguir
 * os dois vazaria a existência do registro (§84 cenário D: "usuário sem acesso não encontra
 * registro"). Nunca inclui campo cifrado.
 */
export async function buscarCredencial(
  viewer: ViewerCofre,
  id: string,
): Promise<DetalheCredencial | null> {
  const credencial = await prisma.credencial.findFirst({
    where: { AND: [{ id }, escopoCredencial(viewer)] },
    select: SELECT_DETALHE,
  });
  if (!credencial) return null;

  // Favorito é preferência individual (§41) e atividade individual (§42): só se pergunta pelo
  // próprio viewer, nunca por terceiros.
  const favorita =
    (await prisma.credencialFavorito.count({
      where: { userId: viewer.id, credencialId: id },
    })) > 0;

  const permissoes = permissoesNaCredencial(viewer, credencial.compartilhamentos, {
    ehResponsavel: credencial.responsavelId === viewer.id,
  });

  // `SELECT_DETALHE` herda `SELECT_LISTA`, que carrega o login cifrado para a listagem resolver
  // a permissão por linha. O drawer não precisa dele: revelar é ação própria e auditada, e
  // mandar a cifra junto do cadastro devolveria material sensível a quem só abriu a ficha.
  const { usuarioEncriptado, ...semCifra } = credencial;
  void usuarioEncriptado;

  return { credencial: comStatusExibido(semCifra, new Date()), permissoes, favorita };
}

/**
 * Permissões do viewer sobre uma credencial, sem carregar o registro inteiro. É o gate que
 * `actions.ts` usa antes de mutar ou revelar.
 *
 * Consulta sem o escopo de propósito: quem chama precisa distinguir "não existe" (`null`) de
 * "existe e você não pode" (permissões todas `false`) — o escopo colapsaria os dois casos, e a
 * action precisa auditar de forma diferente. A resposta ao usuário continua sendo a mesma nos
 * dois casos; a diferença fica no log.
 */
export async function permissoesDoViewer(
  viewer: ViewerCofre,
  credencialId: string,
): Promise<PermissoesNaCredencial | null> {
  const cred = await prisma.credencial.findFirst({
    where: { id: credencialId, deletadoEm: null },
    select: {
      responsavelId: true,
      compartilhamentos: {
        select: {
          tipoAlvo: true,
          alvoId: true,
          podeVerCadastro: true,
          podeVerCredencial: true,
          podeEditar: true,
          podeGerenciarPermissoes: true,
        },
      },
    },
  });
  if (!cred) return null;

  return permissoesNaCredencial(viewer, cred.compartilhamentos, {
    ehResponsavel: cred.responsavelId === viewer.id,
  });
}

export type FiltrosAcessos = {
  q?: string;
  categoriaId?: string;
  estado?: string;
  responsavelId?: string;
  status?: string;
  projetoId?: string;
  /** Só os marcados como favoritos POR ESTE viewer (§41). */
  favoritos?: boolean;
  /** §10 — `setor` | `perfil` | `usuario` | `restrito`. Ver `nivelDeAcesso`. */
  nivelAcesso?: string;
};

type Dir = "asc" | "desc";

/** Campos ordenáveis (§58). Whitelist — o valor vem da URL. */
export const SORT_ACESSOS = [
  "nome",
  "categoria",
  "estado",
  "responsavel",
  "vencimento",
  "revisao",
  "status",
] as const;

function orderByAcessos(sort: string | null, dir: Dir): Prisma.CredencialOrderByWithRelationInput[] {
  switch (sort) {
    case "categoria":
      return [{ categoria: { nome: dir } }, { nome: "asc" }];
    case "estado":
      // Nulos por último nos dois sentidos: "sem UF" não é o menor estado, é ausência.
      return [{ estado: { sort: dir, nulls: "last" } }, { nome: "asc" }];
    // `nulls` só vale em campo escalar direto — dentro de relação o Prisma não aceita. Quem
    // não tem responsável cai onde o Postgres puser; ordenar por responsável é para agrupar
    // por pessoa, não para caçar os sem dono (isso é o filtro/alerta).
    case "responsavel":
      return [{ responsavel: { name: dir } }, { nome: "asc" }];
    case "vencimento":
      return [{ vencimentoEm: { sort: dir, nulls: "last" } }, { nome: "asc" }];
    case "revisao":
      return [{ ultimaRevisaoEm: { sort: dir, nulls: "first" } }, { nome: "asc" }];
    case "status":
      return [{ status: dir }, { nome: "asc" }];
    default:
      return [{ nome: dir }];
  }
}

/**
 * Traduz os filtros da URL em `where`, SEMPRE sob o escopo do viewer.
 *
 * A busca (§9) cobre nome, nome completo, descrição, tags, fornecedor e nº de licença. **Não**
 * cobre usuário/senha: eles estão cifrados com IV aleatório, então `LIKE` não funcionaria nem
 * que quiséssemos — e §9 só permite buscar por usuário "quando o usuário tiver permissão para
 * visualizar o campo", o que exigiria decifrar a base inteira a cada tecla. Fica de fora.
 */
function whereAcessos(viewer: ViewerCofre, f: FiltrosAcessos): Prisma.CredencialWhereInput {
  const and: Prisma.CredencialWhereInput[] = [escopoCredencial(viewer)];

  if (f.q) {
    const q = f.q.trim();
    and.push({
      OR: [
        { nome: { contains: q, mode: "insensitive" } },
        { nomeCompleto: { contains: q, mode: "insensitive" } },
        { descricao: { contains: q, mode: "insensitive" } },
        { fornecedor: { contains: q, mode: "insensitive" } },
        { numeroLicenca: { contains: q, mode: "insensitive" } },
        { tags: { some: { tag: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.categoriaId) and.push({ categoriaId: f.categoriaId });
  if (f.estado) and.push({ estado: f.estado });
  if (f.responsavelId) and.push({ responsavelId: f.responsavelId });
  if (f.status) and.push({ status: f.status });
  if (f.projetoId) and.push({ projetos: { some: { projetoId: f.projetoId } } });
  if (f.favoritos) and.push({ favoritos: { some: { userId: viewer.id } } });
  if (f.nivelAcesso === "restrito") {
    // "Restrito" é AUSÊNCIA de alcance coletivo — mesma definição do card §7-04.
    and.push({ compartilhamentos: { none: { podeVerCredencial: true, tipoAlvo: { in: ["setor", "perfil"] } } } });
  } else if (f.nivelAcesso) {
    and.push({ compartilhamentos: { some: { podeVerCredencial: true, tipoAlvo: f.nivelAcesso } } });
  }

  return { AND: and };
}

/**
 * Listagem paginada (§57 — paginação server-side; §64 — sem N+1).
 *
 * Devolve `favorita` já resolvido por item, com UMA consulta a mais para o conjunto da página —
 * não uma por linha. Nunca inclui campo cifrado.
 */
export async function listarCredenciaisPaginado(
  viewer: ViewerCofre,
  filtros: FiltrosAcessos,
  paginacao: { skip: number; take: number; sort: string | null; dir: Dir },
): Promise<{ items: LinhaListagem[]; total: number }> {
  const where = whereAcessos(viewer, filtros);

  const [items, total] = await Promise.all([
    prisma.credencial.findMany({
      where,
      select: SELECT_LISTA,
      orderBy: orderByAcessos(paginacao.sort, paginacao.dir),
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.credencial.count({ where }),
  ]);

  const favoritas = items.length
    ? new Set(
        (
          await prisma.credencialFavorito.findMany({
            where: { userId: viewer.id, credencialId: { in: items.map((i) => i.id) } },
            select: { credencialId: true },
          })
        ).map((f) => f.credencialId),
      )
    : new Set<string>();

  const hoje = new Date();
  const { descriptografarSenha } = await import("@/lib/encryption");

  const linhas = await Promise.all(
    items.map(async (i) => {
      const permissoes = permissoesNaCredencial(viewer, i.compartilhamentos, {
        ehResponsavel: i.responsavelId === viewer.id,
      });

      // §16 — o login só é decifrado para quem pode ver a credencial DESTE registro. Sem esta
      // resolução por linha, a permissão de tela sozinha entregaria o usuário de tudo que o
      // escopo alcança, e escopo é mais largo que `podeVerCredencial` de propósito.
      let usuario: string | null = null;
      if (permissoes.verCredencial && i.usuarioEncriptado) {
        try {
          usuario = await descriptografarSenha(JSON.parse(i.usuarioEncriptado));
        } catch {
          // Registro cifrado com outra chave, ou payload corrompido: a listagem não é lugar de
          // falhar por isso — mostra `—` e segue. O erro real aparece ao revelar, com mensagem.
          usuario = null;
        }
      }

      // Descarta o que não pode sair daqui: o login cifrado e a política de compartilhamento
      // (já consumida acima). `responsavelId` também sai — a tabela usa o objeto `responsavel`.
      const { usuarioEncriptado, compartilhamentos, responsavelId, ...publico } = i;
      void usuarioEncriptado;
      void responsavelId;
      return comStatusExibido(
        {
          ...publico,
          favorita: favoritas.has(i.id),
          usuario,
          nivelAcesso: nivelDeAcesso(compartilhamentos),
        },
        hoje,
      );
    }),
  );

  return { items: linhas, total };
}

/**
 * Contadores dos cards (§7). Todos sob o escopo do viewer: os números refletem o que ELE
 * alcança, não o cofre inteiro — senão o card viraria um oráculo de quantas credenciais existem.
 *
 * "Restritos" (§7 card 04) = credenciais cuja credencial não é compartilhada com ninguém além
 * de alvos nominais — na prática, sem nenhuma linha `podeVerCredencial` de tipo `setor`/`perfil`.
 */
export async function indicadoresAcessos(viewer: ViewerCofre, categoriasPublicas: string[]) {
  const base = escopoCredencial(viewer);
  const [total, portais, softwares, restritos] = await Promise.all([
    prisma.credencial.count({ where: base }),
    prisma.credencial.count({
      where: { AND: [base, { categoria: { nome: { in: categoriasPublicas } } }] },
    }),
    prisma.credencial.count({
      where: { AND: [base, { categoria: { nome: { contains: "Software", mode: "insensitive" } } }] },
    }),
    prisma.credencial.count({
      where: {
        AND: [
          base,
          {
            compartilhamentos: {
              none: { podeVerCredencial: true, tipoAlvo: { in: ["setor", "perfil"] } },
            },
          },
        ],
      },
    }),
  ]);
  return { total, portais, softwares, restritos };
}

/**
 * Distribuição por status EXIBIDO, para o donut do resumo.
 *
 * Conta em memória, não por `groupBy`: o status exibido não é a coluna `status` — deriva de
 * vencimento e revisão (§19), e o banco não sabe disso. O escopo já limita o volume, e o mesmo
 * `statusCredencial()` da tabela é usado aqui, para os dois números nunca discordarem.
 */
export async function contagemPorStatus(viewer: ViewerCofre, hoje = new Date()) {
  const linhas = await prisma.credencial.findMany({
    where: escopoCredencial(viewer),
    select: { status: true, vencimentoEm: true, ultimaRevisaoEm: true },
  });
  const acc: Record<StatusCredencial, number> = {
    ativo: 0,
    atencao: 0,
    expirando: 0,
    bloqueado: 0,
    inativo: 0,
  };
  for (const l of linhas) acc[statusCredencial(l, hoje)]++;
  return acc;
}

/** Quantos acessos entraram no mês corrente, por card (§7 — a linha "+N este mês"). */
export async function novosNoMes(viewer: ViewerCofre, categoriasPublicas: string[], hoje = new Date()) {
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const base: Prisma.CredencialWhereInput = {
    AND: [escopoCredencial(viewer), { criadoEm: { gte: inicio } }],
  };
  const [total, portais, softwares, restritos] = await Promise.all([
    prisma.credencial.count({ where: base }),
    prisma.credencial.count({
      where: { AND: [base, { categoria: { nome: { in: categoriasPublicas } } }] },
    }),
    prisma.credencial.count({
      where: { AND: [base, { categoria: { nome: { contains: "Software", mode: "insensitive" } } }] },
    }),
    prisma.credencial.count({
      where: {
        AND: [
          base,
          { compartilhamentos: { none: { podeVerCredencial: true, tipoAlvo: { in: ["setor", "perfil"] } } } },
        ],
      },
    }),
  ]);
  return { total, portais, softwares, restritos };
}

/** Contagem por categoria, para os cards de "Acesso rápido" (§11). */
export async function contagemPorCategoria(viewer: ViewerCofre) {
  const linhas = await prisma.credencial.groupBy({
    by: ["categoriaId"],
    where: escopoCredencial(viewer),
    _count: { _all: true },
  });
  return new Map(linhas.map((l) => [l.categoriaId, l._count._all]));
}

/** Responsáveis que aparecem no escopo do viewer, para o filtro (§10). */
export async function responsaveisComAcessos(viewer: ViewerCofre) {
  const linhas = await prisma.credencial.findMany({
    where: { AND: [escopoCredencial(viewer), { responsavelId: { not: null } }] },
    select: { responsavel: { select: { id: true, name: true } } },
    distinct: ["responsavelId"],
    orderBy: { responsavel: { name: "asc" } },
  });
  return linhas.flatMap((l) => (l.responsavel ? [l.responsavel] : []));
}

/**
 * §8 — "Atenção necessária". Só o que o viewer alcança, e só o que realmente pede ação.
 * Ordenado por gravidade: o que está vencido/bloqueado antes do que vai vencer.
 */
export async function alertasAcessos(viewer: ViewerCofre, hoje = new Date()) {
  const { statusCredencial, DIAS_AVISO_VENCIMENTO, DIAS_REVISAO, diasAte } = await import("./service");
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + DIAS_AVISO_VENCIMENTO);
  const revisaoLimite = new Date(hoje);
  revisaoLimite.setDate(revisaoLimite.getDate() - DIAS_REVISAO);

  const candidatas = await prisma.credencial.findMany({
    where: {
      AND: [
        escopoCredencial(viewer),
        {
          OR: [
            { vencimentoEm: { lte: limite } },
            { status: "bloqueado" },
            { responsavelId: null },
            { ultimaRevisaoEm: { lte: revisaoLimite } },
          ],
        },
      ],
    },
    select: { id: true, nome: true, status: true, vencimentoEm: true, ultimaRevisaoEm: true, responsavelId: true },
    take: 50,
  });

  const alertas = candidatas.map((c) => {
    const st = statusCredencial(c, hoje);
    const dias = diasAte(c.vencimentoEm, hoje);
    if (st === "bloqueado") {
      return {
        credencialId: c.id,
        nome: c.nome,
        severidade: "critico" as const,
        mensagem: dias !== null && dias < 0 ? `Venceu há ${Math.abs(dias)} dias.` : "Conta marcada como bloqueada.",
      };
    }
    if (st === "expirando") {
      return {
        credencialId: c.id,
        nome: c.nome,
        severidade: "atencao" as const,
        mensagem: `Vence em ${dias} dias.`,
      };
    }
    if (!c.responsavelId) {
      return {
        credencialId: c.id,
        nome: c.nome,
        severidade: "info" as const,
        mensagem: "Nenhum responsável definido.",
      };
    }
    return {
      credencialId: c.id,
      nome: c.nome,
      severidade: "atencao" as const,
      mensagem: "Credencial sem revisão há mais de 180 dias.",
    };
  });

  const peso = { critico: 0, atencao: 1, info: 2 };
  return alertas.sort((a, b) => peso[a.severidade] - peso[b.severidade]);
}

export type AlertaAcesso = Awaited<ReturnType<typeof alertasAcessos>>[number];

/** O que uma revelação devolve. `null` em cada campo = a credencial não tem aquele dado gravado. */
export type CredencialRevelada = { usuario: string | null; senha: string | null };

/** Motivo da recusa. Nunca chega ao usuário separado — só alimenta o log. */
export type MotivoRecusa = "sem-permissao-de-tela" | "sem-permissao-no-registro" | "nao-encontrada";

export type ResultadoRevelacao =
  | { ok: true; dados: CredencialRevelada }
  | { ok: false; motivo: MotivoRecusa };

/**
 * Decifra a credencial de UM registro. É o único caminho do sistema que devolve texto em claro.
 *
 * Aplica os DOIS gates aqui dentro, e não só na action, de propósito:
 *
 *   - o de TELA (`acessos:credencial` por `permissaoEfetiva`) — a action já o aplica via
 *     `defineAction`, mas repeti-lo aqui significa que qualquer chamador futuro (um job, um
 *     script de migração) não consegue pular o gate por descuido;
 *   - o de REGISTRO (`podeVerCredencial`) — este `defineAction` não tem como fazer, porque não
 *     conhece compartilhamento. Sem ele, quem tivesse a permissão de tela leria QUALQUER senha
 *     do cofre trocando o id: o IDOR da §83, e o modo de falha que passa despercebido porque o
 *     caminho autorizado continua funcionando.
 *
 * Devolve motivo estruturado em vez de lançar, para quem chama poder auditar a recusa com
 * precisão e ainda assim responder ao usuário com uma mensagem única (§84 cenário D — distinguir
 * "não existe" de "sem permissão" na resposta seria um oráculo de existência).
 *
 * NÃO faz auditoria: quem chama audita, porque é lá que estão o IP e a identidade da sessão.
 * Chamar isto sem auditar é bug — ver `revelarCredencial`/`copiarCredencial` em `actions.ts`.
 */
export async function revelarCredencialPara(
  viewer: ViewerCofre,
  credencialId: string,
): Promise<ResultadoRevelacao> {
  const { permissaoEfetiva } = await import("@/lib/permissao-efetiva");
  const podeNaTela = await permissaoEfetiva(
    { id: viewer.id, ativo: viewer.ativo, superUsuario: viewer.superUsuario, perfilId: viewer.perfilId },
    "acessos",
    "credencial",
  );
  if (!podeNaTela) return { ok: false, motivo: "sem-permissao-de-tela" };

  const permissoes = await permissoesDoViewer(viewer, credencialId);
  if (!permissoes) return { ok: false, motivo: "nao-encontrada" };
  if (!permissoes.verCredencial) return { ok: false, motivo: "sem-permissao-no-registro" };

  const cred = await prisma.credencial.findUnique({
    where: { id: credencialId },
    select: { usuarioEncriptado: true, senhaEncriptada: true },
  });
  if (!cred) return { ok: false, motivo: "nao-encontrada" };

  const { descriptografarSenha } = await import("@/lib/encryption");
  const decifrar = async (v: string | null) =>
    v ? descriptografarSenha(JSON.parse(v) as Parameters<typeof descriptografarSenha>[0]) : null;

  return {
    ok: true,
    dados: {
      usuario: await decifrar(cred.usuarioEncriptado),
      senha: await decifrar(cred.senhaEncriptada),
    },
  };
}

export type EventoHistorico = {
  id: string;
  acao: string;
  resultado: string;
  criadoEm: Date;
  autor: { id: string; name: string; image: string | null } | null;
};

/**
 * §33 — histórico de UMA credencial, para a aba do drawer.
 *
 * Lê o `AuditLog` que o `defineAction` já grava; não há tabela de histórico própria (§66 — não
 * duplicar o que existe). Filtra por `entidadeId`, que é por isso que toda action do módulo
 * declara `entidade: "Credencial"` + `entidadeId`.
 *
 * **Devolve só o cabeçalho do evento — nunca `detalhe`.** O `detalhe` carrega o antes/depois do
 * cadastro, e ainda que a senha esteja redigida ali (`redact`), mandar o payload inteiro para o
 * cliente entrega mais do que a linha do tempo precisa: quem, o quê, quando (§33: "Registrar
 * somente eventos necessários e seguros").
 *
 * Gate: quem chama precisa ter alcançado a credencial. `historicoDaCredencial` confere o escopo
 * ela mesma, para não depender de o chamador lembrar.
 */
export async function historicoDaCredencial(
  viewer: ViewerCofre,
  credencialId: string,
  limite = 30,
): Promise<EventoHistorico[] | null> {
  const alcanca = await prisma.credencial.count({
    where: { AND: [{ id: credencialId }, escopoCredencial(viewer)] },
  });
  if (alcanca === 0) return null;

  const linhas = await prisma.auditLog.findMany({
    where: { modulo: "acessos", entidade: "Credencial", entidadeId: credencialId },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      acao: true,
      resultado: true,
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    acao: l.acao,
    resultado: l.resultado,
    criadoEm: l.createdAt,
    autor: l.user,
  }));
}

/**
 * §42 — "Acessados recentemente", do PRÓPRIO usuário.
 *
 * Sem tabela nova: sai do `AuditLog`, filtrado por `userId` da sessão. §42 é explícito que a
 * seção não pode expor atividade de terceiros, e filtrar pelo próprio id é o que garante isso —
 * não é otimização, é o requisito.
 *
 * Conta como "acesso recente" apenas revelar/copiar: abrir o cadastro não é uso da credencial, e
 * incluir isso encheria a lista de coisas que a pessoa só espiou.
 */
export async function acessadosRecentemente(viewer: ViewerCofre, limite = 5) {
  const eventos = await prisma.auditLog.findMany({
    where: {
      modulo: "acessos",
      userId: viewer.id,
      resultado: "sucesso",
      acao: { in: ["revelar-credencial", "copiar-credencial"] },
      entidadeId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { entidadeId: true, createdAt: true },
    take: 60,
  });

  // Deduplica preservando a ordem: a credencial aparece uma vez, no uso mais recente.
  const vistos = new Map<string, Date>();
  for (const e of eventos) {
    if (e.entidadeId && !vistos.has(e.entidadeId)) vistos.set(e.entidadeId, e.createdAt);
  }
  const ids = [...vistos.keys()].slice(0, limite);
  if (ids.length === 0) return [];

  // Passa pelo escopo de novo: quem perdeu o compartilhamento depois de ter usado NÃO deve
  // continuar vendo o item na lista só porque o log lembra.
  const credenciais = await prisma.credencial.findMany({
    where: { AND: [{ id: { in: ids } }, escopoCredencial(viewer)] },
    select: { id: true, nome: true, categoria: { select: { nome: true } } },
  });
  const porId = new Map(credenciais.map((c) => [c.id, c]));

  return ids.flatMap((id) => {
    const c = porId.get(id);
    return c ? [{ ...c, usadoEm: vistos.get(id)! }] : [];
  });
}

/**
 * Tudo que o formulário de acesso precisa escolher, num round-trip.
 *
 * Os projetos vêm limitados aos 200 mais recentes e NÃO passam por `escopoProjeto`: associar um
 * acesso a um projeto é ato de quem administra o cofre (gate `acessos:gerir`), não de quem
 * participa daquele projeto — filtrar pela carteira esconderia justamente os projetos alheios
 * que precisam do acesso de um órgão. O vínculo é referência, não concede nada (§39).
 */
export async function opcoesFormulario() {
  const [categorias, pessoas, perfis, projetos] = await Promise.all([
    prisma.credencialCategoria.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.user.findMany({
      where: { ativo: true, tipo: "interno" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cargo: true },
    }),
    prisma.perfilAcesso.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.projeto.findMany({
      where: { situacao: { notIn: ["cancelado", "arquivado"] } },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      take: 200,
      select: { id: true, codigo: true, nome: true },
    }),
  ]);
  return { categorias, pessoas, perfis, projetos };
}

export type OpcoesFormulario = Awaited<ReturnType<typeof opcoesFormulario>>;

/**
 * §38/§39 — acessos vinculados a um projeto, para a seção "Acessos relacionados".
 *
 * Passa pelo escopo do cofre, não pelo escopo do PROJETO: quem abre a ficha do projeto vê ali
 * apenas os acessos que já alcançaria em `/acessos`. Sem isso, a página do projeto viraria uma
 * porta lateral para descobrir que credenciais existem — o vínculo é referência, e referência
 * não concede acesso (§39: "single source of truth", não uma segunda via).
 *
 * Nunca devolve campo cifrado: o card leva ao cofre, onde revelar segue auditado.
 */
export async function acessosDoProjeto(viewer: ViewerCofre, projetoId: string) {
  return prisma.credencial.findMany({
    where: {
      AND: [escopoCredencial(viewer), { projetos: { some: { projetoId } } }],
    },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      nomeCompleto: true,
      estado: true,
      status: true,
      url: true,
      vencimentoEm: true,
      ultimaRevisaoEm: true,
      categoria: { select: { nome: true } },
    },
  });
}

export type AcessoDoProjeto = Awaited<ReturnType<typeof acessosDoProjeto>>[number];

/** Categorias ativas, para filtro e formulário. */
export async function listarCategorias() {
  return prisma.credencialCategoria.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, icone: true },
  });
}
