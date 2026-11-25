import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";

export type ProjetoParaContaObra = { id: string; rotulo: string; detalhe: string; clienteId: string };

/**
 * Projetos que podem entrar na lista de uma conta de obra (Configurações → Usuários): os de clientes ativos, do mais novo para o
 * mais antigo. O formulário filtra pelo cliente quando a conta é "do cliente"; o serviço confere de novo ao gravar.
 */
export async function projetosParaContaObra(): Promise<ProjetoParaContaObra[]> {
  const projetos = await prisma.projeto.findMany({
    where: { cliente: { ativo: true } },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: { id: true, codigo: true, nome: true, clienteId: true, cliente: { select: { nome: true } } },
  });
  return projetos.map((p) => ({
    id: p.id,
    rotulo: `${formatarCodigo(p.codigo)} · ${p.nome}`,
    detalhe: p.cliente.nome,
    clienteId: p.clienteId,
  }));
}
