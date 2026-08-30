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
 * REGRA DO MÓDULO: nenhuma função daqui devolve `senhaEncriptada`/`usuarioEncriptado`. Revelar é
 * caminho próprio e auditado, em `actions.ts` (§45: "NÃO retornar senha junto ao endpoint de
 * listagem"). Os `select` abaixo são explícitos justamente para que incluir a coluna cifrada por
 * descuido seja uma edição visível no diff, e não o efeito silencioso de um `include`.
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
  credencial: CredencialDetalhe & { statusExibido: StatusCredencial };
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

  return { credencial: comStatusExibido(credencial, new Date()), permissoes, favorita };
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
): Promise<{ items: Array<CredencialLista & { favorita: boolean; statusExibido: StatusCredencial }>; total: number }> {
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
  return {
    items: items.map((i) => comStatusExibido({ ...i, favorita: favoritas.has(i.id) }, hoje)),
    total,
  };
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

/** Categorias ativas, para filtro e formulário. */
export async function listarCategorias() {
  return prisma.credencialCategoria.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, icone: true },
  });
}
