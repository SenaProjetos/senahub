import "server-only";
import { prisma } from "@/lib/prisma";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { alcanceDaObra } from "@/modules/projetos/arquivos/link-publico-regras";
import type { AcessoPortal, UsuarioDaSessao } from "../acesso";
import { MSG_PORTAL } from "../acesso-regras";
import { decidirAcessoObra, obraLiberadaParaConta } from "./regras";

/** A conta tem `ContaObra`? (a presença da linha é o próprio "é conta de obra"). */
export async function ehContaObra(userId: string): Promise<boolean> {
  return (await prisma.contaObra.findUnique({ where: { userId }, select: { id: true } })) !== null;
}

/**
 * Leitura + decisão da conta de obra num projeto (spec 2026-11-25): conta, projeto e o item da lista, depois o termo (só
 * quando a obra é da pessoa). Devolve o alcance só de "Liberado para obra". Fora da regra, o mesmo 404 neutro do portal.
 */
export async function acessoDaObraAoProjeto(user: UsuarioDaSessao | null, projetoId: string): Promise<AcessoPortal> {
  if (!user) return { ok: false, status: 401, erro: MSG_PORTAL.semSessao };
  const conta = await prisma.user.findUnique({
    where: { id: user.id },
    select: { clienteId: true, contaObra: { select: { id: true, clienteId: true, cliente: { select: { ativo: true } } } } },
  });
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, codigo: true, nome: true, clienteId: true, cliente: { select: { ativo: true } } },
  });
  const item =
    conta?.contaObra && projeto
      ? await prisma.contaObraProjeto.findUnique({
          where: { contaObraId_projetoId: { contaObraId: conta.contaObra.id, projetoId } },
          select: { id: true },
        })
      : null;

  const base = {
    contaClienteId: conta?.contaObra?.clienteId ?? null,
    contaClienteAtivo: conta?.contaObra?.cliente?.ativo ?? false,
    naLista: item !== null,
    projetoClienteId: projeto?.clienteId ?? null,
    projetoClienteAtivo: projeto?.cliente.ativo ?? false,
  };
  const ehObra = user.tipo === "externo" && conta !== null && conta.clienteId === null && conta.contaObra !== null;
  const termoPendente = ehObra && obraLiberadaParaConta(base) ? (await precisaAceitarTermo(user)) !== null : false;

  const decisao = decidirAcessoObra({
    ...base,
    temSessao: true,
    tipo: user.tipo,
    clienteIdDaConta: conta?.clienteId ?? null,
    temContaObra: conta?.contaObra != null,
    mustChangePassword: user.mustChangePassword,
    termoPendente,
  });
  if (!decisao.ok) return decisao;
  if (!projeto) return { ok: false, status: 404, erro: MSG_PORTAL.indisponivel };
  return { ok: true, userId: user.id, alcance: alcanceDaObra(projeto) };
}
