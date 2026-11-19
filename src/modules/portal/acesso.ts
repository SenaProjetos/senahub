import "server-only";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { alcanceDoPortal, type AlcanceArquivos } from "@/modules/projetos/arquivos/link-publico-regras";
import { decidirAcessoPortal } from "./acesso-regras";

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
  const user = session?.user ?? null;
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
