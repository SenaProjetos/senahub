import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { diaDeSaoPaulo } from "@/lib/data";
import { criarUsuarioComCredencial } from "@/lib/auth-admin";
import {
  MOTIVO_ACESSO_ATE_PASSADO,
  MOTIVO_CLIENTE_DA_CONTA,
  MOTIVO_CONTA_OBRA,
  MOTIVO_CONTA_OBRA_MUDOU,
  MOTIVO_EMPRESA,
  MOTIVO_OBRA_NAO_ENCONTRADA,
  deveReativarPorAcessoAte,
  motivoListaDeObras,
  normalizarEmpresa,
} from "./regras";
import type { CriarContaObraInput, SalvarContaObraInput } from "./schemas";

/**
 * Único escritor da conta de obra (spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md): `User` externo SEM
 * `clienteId` e sem perfil + `ContaObra` + a lista `ContaObraProjeto`. Os outros caminhos que dariam cliente, perfil ou permissão
 * a uma conta chamam `exigirNaoEhContaObra`.
 */

/** Recusa mexer em cliente, perfil ou permissão de uma conta de obra. */
export async function exigirNaoEhContaObra(userId: string): Promise<void> {
  const obra = await prisma.contaObra.findUnique({ where: { userId }, select: { id: true } });
  if (obra) throw new ActionError(MOTIVO_CONTA_OBRA);
}

const dataDoDia = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const diaDaData = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** O que criar e editar conferem antes de gravar qualquer coisa. Devolve os valores já normalizados. */
async function validar(i: { empresa: string; clienteId?: string; projetoIds: string[]; acessoAte?: string }) {
  const empresa = normalizarEmpresa(i.empresa);
  if (!empresa) throw new ActionError(MOTIVO_EMPRESA);
  const acessoAte = i.acessoAte?.trim() || null;
  if (acessoAte && acessoAte < diaDeSaoPaulo()) throw new ActionError(MOTIVO_ACESSO_ATE_PASSADO);
  const clienteId = i.clienteId?.trim() || null;
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { ativo: true } });
    if (!cliente?.ativo) throw new ActionError(MOTIVO_CLIENTE_DA_CONTA);
  }
  const projetoIds = [...new Set(i.projetoIds)];
  const projetos = projetoIds.length
    ? await prisma.projeto.findMany({ where: { id: { in: projetoIds } }, select: { id: true, clienteId: true } })
    : [];
  const motivo = motivoListaDeObras(clienteId, projetos, projetoIds);
  if (motivo) throw new ActionError(motivo);
  return { empresa, acessoAte, clienteId, projetoIds };
}

/** Cria a conta (senha temporária, troca obrigatória), a `ContaObra` e a lista. Tudo validado antes de criar o usuário. */
export async function criarContaObraNoBanco(i: CriarContaObraInput, autorId: string): Promise<{ id: string; senhaTemporaria: string }> {
  const email = i.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ActionError("Já existe um usuário com esse e-mail.");
  }
  const v = await validar(i);
  // Sem `clienteId` e sem perfil: é o que mantém as áreas do cliente fechadas para a obra.
  const { id, senhaTemporaria } = await criarUsuarioComCredencial({ name: i.name.trim(), email, tipo: "externo" });
  try {
    await prisma.$transaction(async (tx) => {
      if (v.acessoAte) await tx.user.update({ where: { id }, data: { acessoAte: dataDoDia(v.acessoAte) } });
      const conta = await tx.contaObra.create({
        data: { userId: id, empresa: v.empresa, clienteId: v.clienteId, criadoPorId: autorId },
        select: { id: true },
      });
      if (v.projetoIds.length) {
        await tx.contaObraProjeto.createMany({
          data: v.projetoIds.map((projetoId) => ({ contaObraId: conta.id, projetoId, concedidoPorId: autorId })),
        });
      }
    });
  } catch (e) {
    // Sem a ContaObra, a conta seria um externo sem cliente perdido: desfaz a criação.
    await prisma.user.delete({ where: { id } }).catch((erro: unknown) => console.error("[obra] desfazer conta falhou:", erro));
    throw e;
  }
  return { id, senhaTemporaria };
}

/**
 * Edita nome, empresa, "é do cliente", a lista de obras e o "Acesso até", numa transação com trava otimista pelo `updatedAt`
 * lido. Obra que sai da lista fecha na próxima requisição; obra que fica mantém o `criadoEm` (o resumo não recomeça).
 * "Obra que atrasou": data nova numa conta desligada pelo vencimento a reativa, guardando a data.
 */
export async function salvarContaObraNoBanco(i: SalvarContaObraInput, autorId: string): Promise<{ userId: string; reativada: boolean }> {
  const conta = await prisma.contaObra.findUnique({ where: { userId: i.userId }, select: { id: true } });
  if (!conta) throw new ActionError(MOTIVO_OBRA_NAO_ENCONTRADA);
  const v = await validar(i);
  const user = await prisma.user.findUnique({ where: { id: i.userId }, select: { ativo: true, acessoAte: true } });
  if (!user) throw new ActionError(MOTIVO_OBRA_NAO_ENCONTRADA);
  const reativar = deveReativarPorAcessoAte({
    ativo: user.ativo,
    acessoAteAntes: diaDaData(user.acessoAte),
    acessoAteNovo: v.acessoAte,
    hoje: diaDeSaoPaulo(),
  });
  const versao = new Date(i.versao);
  if (Number.isNaN(versao.getTime())) throw new ActionError(MOTIVO_CONTA_OBRA_MUDOU);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contaObra.updateMany({
      where: { id: conta.id, updatedAt: versao },
      data: { empresa: v.empresa, clienteId: v.clienteId },
    });
    if (count !== 1) throw new ActionError(MOTIVO_CONTA_OBRA_MUDOU);
    await tx.contaObraProjeto.deleteMany({ where: { contaObraId: conta.id, projetoId: { notIn: v.projetoIds } } });
    if (v.projetoIds.length) {
      await tx.contaObraProjeto.createMany({
        data: v.projetoIds.map((projetoId) => ({ contaObraId: conta.id, projetoId, concedidoPorId: autorId })),
        skipDuplicates: true,
      });
    }
    await tx.user.update({
      where: { id: i.userId },
      data: {
        name: i.name.trim(),
        acessoAte: v.acessoAte ? dataDoDia(v.acessoAte) : null,
        ...(reativar ? { ativo: true } : {}),
      },
    });
  });
  return { userId: i.userId, reativada: reativar };
}
