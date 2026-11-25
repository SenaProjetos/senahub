import "server-only";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { alcanceDoPortal, type AlcanceArquivos } from "@/modules/projetos/arquivos/link-publico-regras";
import { decidirAcessoPortal } from "./acesso-regras";
import { acessoDaObraAoProjeto, ehContaObra } from "./obra/acesso";

export type AcessoPortal =
  | { ok: true; userId: string; alcance: AlcanceArquivos }
  | { ok: false; status: 401 | 403 | 404; erro: string };

/**
 * Porta única das rotas de download do portal: lê a sessão, o cliente da pessoa, o termo e o projeto,
 * decide com `decidirAcessoPortal` e devolve o alcance do portal (o mesmo do link "projeto todo por
 * situação"). O termo só é consultado quando o projeto é da pessoa — fora isso a resposta já é 404.
 */
export async function acessoAoProjetoDoPortal(projetoId: string): Promise<AcessoPortal> {
  const session = await getSession();
  return acessoDoUsuarioAoProjetoDoPortal(session?.user ?? null, projetoId);
}

/** O que a decisão lê da sessão. */
export type UsuarioDaSessao = { id: string; tipo: "interno" | "externo"; mustChangePassword: boolean };

/**
 * A parte de `acessoAoProjetoDoPortal` que vem depois da sessão: lê o cliente da pessoa, o projeto e o termo
 * e decide. Separada para o smoke conferir a ligação com o banco sem montar uma sessão HTTP.
 */
export async function acessoDoUsuarioAoProjetoDoPortal(
  user: UsuarioDaSessao | null,
  projetoId: string,
): Promise<AcessoPortal> {
  const [dono, projeto] = user
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: { clienteId: true, cliente: { select: { ativo: true } } },
        }),
        prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true, clienteId: true } }),
      ])
    : [null, null];
  const clienteId = dono?.clienteId ?? null;
  const clienteAtivo = dono?.cliente?.ativo ?? false;
  const ehDoCliente =
    user !== null && user.tipo === "externo" && clienteId !== null && clienteAtivo && projeto?.clienteId === clienteId;
  const termoPendente = ehDoCliente && user ? (await precisaAceitarTermo(user)) !== null : false;

  const decisao = decidirAcessoPortal({
    temSessao: user !== null,
    tipo: user?.tipo ?? null,
    clienteId,
    mustChangePassword: user?.mustChangePassword ?? false,
    termoPendente,
    projetoClienteId: projeto?.clienteId ?? null,
    clienteAtivo,
  });
  if (!decisao.ok) return decisao;
  // `decisao.ok` garante sessão e projeto; a checagem é só para o TypeScript.
  if (!user || !projeto) return { ok: false, status: 404, erro: "Arquivo indisponível." };
  return { ok: true, userId: user.id, alcance: alcanceDoPortal(projeto) };
}

export type PapelNoPortal = "cliente" | "obra";
export type AcessoArquivosPortal =
  | { ok: true; userId: string; papel: PapelNoPortal; alcance: AlcanceArquivos }
  | { ok: false; status: 401 | 403 | 404; erro: string };

/**
 * Porta dos ARQUIVOS do portal: cliente (pela porta de cima, alcance de hoje) ou conta de obra (alcance só de "Liberado para
 * obra", `acessoDaObraAoProjeto`). Usada SÓ pelo download de arquivo, .zip, ART e modelos 3D — nunca por pedidos, mensagens,
 * briefing, documentos recebidos ou qualquer área do cliente: essas seguem em `acessoDoUsuarioAoProjetoDoPortal`, que recusa a
 * conta de obra (ela não tem `clienteId`). Spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md.
 */
export async function acessoDoUsuarioAosArquivosDoPortal(
  user: UsuarioDaSessao | null,
  projetoId: string,
): Promise<AcessoArquivosPortal> {
  if (user && user.tipo === "externo" && (await ehContaObra(user.id))) {
    const obra = await acessoDaObraAoProjeto(user, projetoId);
    return obra.ok ? { ...obra, papel: "obra" } : obra;
  }
  const cliente = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  return cliente.ok ? { ...cliente, papel: "cliente" } : cliente;
}

/** `acessoDoUsuarioAosArquivosDoPortal` com a pessoa da sessão (rotas de download). */
export async function acessoAosArquivosDoPortal(projetoId: string): Promise<AcessoArquivosPortal> {
  const session = await getSession();
  return acessoDoUsuarioAosArquivosDoPortal(session?.user ?? null, projetoId);
}
