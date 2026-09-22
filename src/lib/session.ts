import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import type { Contratacao, Setor } from "@/generated/prisma/enums";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  ativo: boolean;
  mustChangePassword: boolean;
  image?: string | null;
  /** Sócio ativo (registro Socio) — recebe acesso de LEITURA elevado (piso de supervisor). */
  ehSocio: boolean;
  /**
   * Motor de Perfil de acesso (plano em
   * docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md).
   * ATIVO desde a Onda D (2026-08-09): `can()` resolve por `permissaoEfetiva` e
   * `acessoGlobal()` lê `superUsuario || escopoGlobalPerfil` — estes campos SÃO a autorização
   * real hoje, não mais um ensaio. (O comentário anterior dizia "inerte, nenhum gate lê" —
   * era verdade na Onda A e virou mentira no flip.)
   */
  perfilId: string | null;
  /**
   * `PerfilAcesso.chave` do perfil acima — slug estável, o identificador que dado histórico
   * usa (ver `DocumentoModelo.perfis`). Vem do mesmo round-trip de `perfilId`, sem custo extra.
   */
  perfilChave: string | null;
  escopoGlobalPerfil: boolean;
  /**
   * `tarefas:gerir_todas` já resolvido (2026-09-15, era `GLOBAL_ROLES`). Está na sessão pelo mesmo
   * motivo de `escopoGlobalPerfil`: `escopoTarefa()` é síncrono e montado dentro de ~12 `where`
   * — resolver `can()` em cada chamador espalharia o async por queries puras.
   */
  gereTodasTarefas: boolean;
  /**
   * Bypass total do motor de Perfil de acesso (equivalente ao `role === "admin"` de `can()`).
   * Exposto na sessão a partir da Onda D porque `can(subject, ...)` recebe o sujeito inteiro e
   * `permissaoEfetiva` consome este campo. Já era lido pelo `getSession` desde a Onda A.
   */
  superUsuario: boolean;
  /**
   * Setor do vínculo ativo (cache denormalizado em `User`, escrito por `aplicarVinculo()`).
   * NÃO autoriza nada — Setor é endereço, não crachá (§2.1 do plano de Setor × Contratação ×
   * Perfil), e `permissaoEfetiva` deliberadamente não tem passo de setor.
   *
   * Está na sessão porque o cofre de Acessos compartilha registros POR SETOR
   * (`CredencialCompartilhamento.tipoAlvo = "setor"`), e sem o dado aqui esse alvo nunca
   * casaria — falha fechada e silenciosa, do tipo que ninguém percebe até alguém reclamar
   * que não vê o que deveria.
   */
  setor: Setor | null;
  /**
   * Interno × externo do vínculo ativo (mesmo cache denormalizado que `setor`, escrito por
   * `aplicarVinculo()`). É o eixo que a Onda D pôs no lugar do antigo `roles[]` para a pergunta
   * "é gente de dentro?" — ver a nota de topo de `nav-config.ts`.
   *
   * **`null` NÃO significa "externo"**: significa "sem vínculo aplicado". A coluna é opcional e
   * sem default (`User.tipo TipoUsuario?`), então todo gate que ler este campo precisa tratar o
   * nulo — ver `requireInterno()`.
   */
  tipo: "interno" | "externo" | null;
  /**
   * Contratação do vínculo ativo (mesmo cache de `setor`/`tipo`). É o eixo de JORNADA — quem bate
   * ponto, tem espelho e tem férias — desde 2026-09-15; ver `modules/ponto/jornada.ts`. Não autoriza
   * tela nenhuma: `permissaoEfetiva` não tem passo de contratação.
   */
  contratacao: Contratacao | null;
  /**
   * Já teve algum vínculo, ativo ou encerrado. Sem ele não dá para distinguir "backfill não chegou
   * nesta pessoa" (cai no papel) de "vínculo encerrado" (contratação nula e SEM fallback) — e
   * confundir os dois concede batida a quem saiu.
   */
  jaTeveVinculo: boolean;
};

/** Sessão atual (ou null). Memoizada por request. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Todo campo que NÃO vem do better-auth precisa estar neste Omit. Esquecer um faz o TypeScript
  // acreditar que ele já existe em `base`: o objeto de retorno compila, e em runtime o campo é
  // `undefined`. Falha silenciosa — `lint` e `build` passam.
  const base = session.user as unknown as Omit<
    SessionUser,
    "ehSocio" | "perfilId" | "perfilChave" | "escopoGlobalPerfil" | "gereTodasTarefas" | "superUsuario" | "setor" | "tipo" | "contratacao" | "jaTeveVinculo"
  >;

  // Sócio + perfil/superUsuário num único round-trip (mesmo lookup que já existia, ampliado).
  const { prisma } = await import("@/lib/prisma");
  const dados = await prisma.user.findUnique({
    where: { id: base.id },
    select: {
      perfilId: true,
      superUsuario: true,
      ativo: true,
      acessoAte: true,
      setor: true,
      tipo: true,
      contratacao: true,
      _count: { select: { vinculos: true } },
      perfil: { select: { chave: true } },
      socio: { select: { ativo: true } },
    },
  });

  // Desligamento: a sessão deixa de valer no dia seguinte a `acessoAte`, sem esperar a rotina
  // noturna que grava `ativo = false`. Desativado também cai aqui — antes, quem tinha a sessão
  // apagada podia simplesmente logar de novo (o bloqueio de login está em `auth.ts`).
  const { acessoBloqueado } = await import("@/modules/usuarios/vinculo/desligamento");
  if (!dados || acessoBloqueado({ ativo: dados.ativo, acessoAte: dados.acessoAte })) return null;

  const { permissaoEfetiva } = await import("@/lib/permissao-efetiva");
  const sujeito = {
    id: base.id,
    ativo: base.ativo,
    superUsuario: dados?.superUsuario ?? false,
    perfilId: dados?.perfilId ?? null,
  };
  const [escopoGlobalPerfil, gereTodasTarefas] = await Promise.all([
    permissaoEfetiva(sujeito, "escopo", "global"),
    permissaoEfetiva(sujeito, "tarefas", "gerir_todas"),
  ]);

  return {
    user: {
      ...base,
      ehSocio: dados?.socio?.ativo === true,
      perfilId: dados?.perfilId ?? null,
      perfilChave: dados?.perfil?.chave ?? null,
      superUsuario: dados?.superUsuario ?? false,
      setor: dados?.setor ?? null,
      tipo: dados?.tipo ?? null,
      contratacao: dados?.contratacao ?? null,
      // Sem registro (`dados` nulo) não se sabe nada: `true` faz `controlaJornada` negar em vez de
      // cair no papel. É o lado que falha fechado.
      jaTeveVinculo: dados ? dados._count.vinculos > 0 : true,
      escopoGlobalPerfil,
      gereTodasTarefas,
    } as SessionUser,
    session: session.session,
  };
});

/** Exige sessão; redireciona para login se ausente. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  return session.user;
}

/**
 * Exige colaborador **interno**, sem exigir permissão de módulo nenhum. É o gate dos Guias de uso
 * (`/guias`): material de formação não é dado operacional, e ler sobre o Financeiro sem ter
 * `financeiro:ver` é justamente o caso de uso — quem ainda não trabalha no setor é o público.
 *
 * Eixo primário é `tipo` (o vigente desde a Onda D); o nulo é resolvido por `tipoEfetivo()`, o
 * mesmo helper que o contexto do menu usa — se os dois divergirem, aparece o par "vê o link e toma
 * 404" (ou o inverso, pior).
 *
 * `notFound()` e não `redirect("/sem-permissao")`: para quem é externo a página simplesmente não
 * existe, e não vaza que há uma área interna com esse endereço.
 */
export async function requireInterno(): Promise<SessionUser> {
  const { tipoEfetivo } = await import("@/lib/roles");
  const user = await requireUser();
  if (tipoEfetivo(user.tipo, user.role) !== "interno") notFound();
  return user;
}

/**
 * Exige um dos perfis informados; senão, sem permissão.
 * Sócio ativo tem piso de supervisor: passa em qualquer página que o supervisor acessaria
 * (leitura/gestão), mas não em páginas restritas só a admin (destrutivas/config).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  const ok = roles.includes(user.role) || (user.ehSocio && roles.includes("supervisor"));
  if (!ok) redirect("/sem-permissao");
  return user;
}

/**
 * Exige permissão fina `recurso:acao` (admin tem bypass); senão, sem permissão.
 * Sócio ativo herda as permissões do supervisor (acesso de leitura/gestão elevado).
 */
export async function requirePermission(recurso: string, acao: string): Promise<SessionUser> {
  const { can, canRole } = await import("@/lib/permissions");
  const user = await requireUser();
  // `canRole("supervisor", ...)` é o piso de sócio — a única pergunta legítima do tipo "o que o
  // papel X poderia" que sobra fora do arnês. Vira override individual (só leitura, §15.7) no
  // religamento do motor.
  const ok = (await can(user, recurso, acao)) || (user.ehSocio && (await canRole("supervisor", recurso, acao)));
  if (!ok) redirect("/sem-permissao");
  return user;
}
