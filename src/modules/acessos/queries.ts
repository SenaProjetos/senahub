import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { permissoesNaCredencial, type ViewerCofre, type PermissoesNaCredencial } from "./service";
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
export type CredencialDetalhe = Prisma.CredencialGetPayload<{ select: typeof SELECT_DETALHE }>;

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
): Promise<{ credencial: CredencialDetalhe; permissoes: PermissoesNaCredencial; favorita: boolean } | null> {
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

  return { credencial, permissoes, favorita };
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
