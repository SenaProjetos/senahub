"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { ensureCanalSocios } from "@/modules/chat/service";
import { registrarAlteracaoContratual } from "@/modules/rh/contratual/service";
import { aplicarVinculo } from "@/modules/usuarios/vinculo/service";
import { notificarNovosMembros, emitParaUsuario } from "@/lib/socket";
import {
  criarUsuarioComCredencial,
  resetarSenha,
} from "@/lib/auth-admin";
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  nomeExibicaoSchema,
  usuarioIdSchema,
} from "@/modules/usuarios/schemas";

const REVALIDATE = "/configuracoes/usuarios";

/** Permissões dadas pessoa a pessoa que o cadastro de usuários edita (Onda F). */
const EXTRAS = {
  gereRh: { recurso: "rh", acao: "gerir", motivo: "Gestão de RH — concedida no cadastro de usuários" },
  moderaChat: { recurso: "chat", acao: "moderar", motivo: "Moderação do chat — concedida no cadastro de usuários" },
} as const;

/** Liga ou desliga um extra: ligado = override `permitido`; desligado = remove o override. */
async function aplicarExtra(userId: string, chave: keyof typeof EXTRAS, ligado: boolean, concedidoPorId: string) {
  const { recurso, acao, motivo } = EXTRAS[chave];
  if (ligado) {
    await prisma.permissaoUsuario.upsert({
      where: { userId_recurso_acao: { userId, recurso, acao } },
      create: { userId, recurso, acao, permitido: true, motivo, concedidoPorId },
      update: { permitido: true, motivo, expiraEm: null, concedidoPorId },
    });
  } else {
    await prisma.permissaoUsuario.deleteMany({ where: { userId, recurso, acao } });
  }
}

function exigirSuperParaExtras(input: { gereRh?: boolean; moderaChat?: boolean }, ehSuper: boolean) {
  if ((input.gereRh !== undefined || input.moderaChat !== undefined) && !ehSuper) {
    throw new ActionError("Apenas administradores podem dar Gestão de RH ou moderação do chat.");
  }
}

export const criarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "criar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: criarUsuarioSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input, ctx) => {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existing) throw new ActionError("Já existe um usuário com esse e-mail.");
    exigirSuperParaExtras(input, ctx.user.superUsuario);
    if (input.tipo === "externo" && !input.clienteId?.trim()) {
      throw new ActionError("Escolha o cliente do portal.");
    }
    if (input.tipo === "interno" && !input.contratacao) {
      throw new ActionError("Escolha como a pessoa é contratada — o vínculo nasce junto com a conta.");
    }

    const { id, senhaTemporaria } = await criarUsuarioComCredencial(input);

    // O vínculo nasce no cadastro: sem ele a pessoa não bate ponto nem apura horas (Onda F).
    if (input.tipo === "interno" && input.contratacao) {
      const classificacao = input.cargoId?.trim()
        ? await prisma.cargo.findUnique({ where: { id: input.cargoId.trim() }, select: { nome: true } })
        : null;
      await aplicarVinculo(prisma, id, {
        contratacao: input.contratacao,
        setor: input.setor ?? "engenharia",
        cargo: classificacao?.nome ?? null,
        remuneracao: input.salarioBase ?? null,
        pjId: input.pjId?.trim() || null,
        dataInicio: input.dataAdmissao ? new Date(input.dataAdmissao + "T00:00:00Z") : new Date(),
      });
    }
    if (input.gereRh) await aplicarExtra(id, "gereRh", true, ctx.user.id);
    if (input.moderaChat) await aplicarExtra(id, "moderaChat", true, ctx.user.id);

    // Fase 2: preenche o cadastro inicial no mesmo ato (só o que veio) — evita "pessoa pela metade".
    const cadastro: {
      nomeCompleto?: string; cpf?: string; telefone?: string;
      dataAdmissao?: Date; pjId?: string; perfilId?: string;
    } = {};
    if (input.nomeCompleto?.trim()) cadastro.nomeCompleto = input.nomeCompleto.trim();
    if (input.cpf?.trim()) cadastro.cpf = input.cpf.trim();
    if (input.telefone?.trim()) cadastro.telefone = input.telefone.trim();
    if (input.dataAdmissao) cadastro.dataAdmissao = new Date(input.dataAdmissao);
    if (input.pjId?.trim()) cadastro.pjId = input.pjId.trim();
    if (input.perfilId?.trim()) cadastro.perfilId = input.perfilId.trim();
    if (Object.keys(cadastro).length > 0) {
      await prisma.user.update({ where: { id }, data: cadastro });
    }

    // Cargo e salário NÃO entram no update acima. Esta rota é gateada por `usuarios:gerir`,
    // não por RH — é a que mais escapa quando se mexe no cadastro — e por isso passa pelo mesmo
    // escritor único, deixando a primeira linha do histórico contratual.
    if (input.cargoId?.trim() || input.salarioBase != null) {
      await prisma.$transaction((tx) =>
        registrarAlteracaoContratual(
          tx,
          id,
          {
            cargoId: input.cargoId?.trim() || null,
            remuneracao: input.salarioBase ?? null,
            vigenciaEm: input.dataAdmissao ? new Date(input.dataAdmissao) : undefined,
            motivo: "admissao",
          },
          ctx.user.id,
        ),
      );
    }

    revalidatePath(REVALIDATE);
    return { id, email: input.email, senhaTemporaria };
  },
);

export const editarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "editar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: editarUsuarioSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: async (input) =>
      prisma.user.findUnique({
        where: { id: input.id },
        select: {
          name: true,
          nomeCompleto: true,
          tipo: true,
          clienteId: true,
          socio: { select: { ativo: true } },
        },
      }),
  },
  async (input, ctx) => {
    // Sócio: soft-toggle no registro Socio (nunca exclui — preserva retiradas).
    // Cliente do portal (tipo externo) nunca é sócio (mesma regra de usuariosParaSocio no financeiro).
    const alvo = await prisma.user.findUnique({ where: { id: input.id }, select: { tipo: true } });
    if (!alvo) throw new ActionError("Usuário não encontrado.");
    const externo = alvo.tipo === "externo";
    const desejaSocio = externo && input.ehSocio ? false : input.ehSocio;
    let socioMudou = false;
    let socio: { id: string; ativo: boolean } | null = null;
    if (desejaSocio !== undefined) {
      socio = await prisma.socio.findUnique({
        where: { userId: input.id },
        select: { id: true, ativo: true },
      });
      socioMudou = desejaSocio !== (socio?.ativo === true);
      // Valida ANTES de gravar qualquer coisa — evita atualização parcial.
      if (socioMudou && !ctx.user.superUsuario) {
        throw new ActionError("Apenas administradores podem definir quem é sócio.");
      }
    }

    // Bypass total — mesmo raciocínio do sócio: só admin concede (validado ANTES de gravar).
    if (input.superUsuario !== undefined && !ctx.user.superUsuario) {
      throw new ActionError("Apenas administradores podem conceder acesso total (superUsuário).");
    }

    exigirSuperParaExtras(input, ctx.user.superUsuario);

    await prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        nomeCompleto: input.nomeCompleto?.trim() || null,
        clienteId: externo ? input.clienteId || null : null,
        ...(input.perfilId !== undefined ? { perfilId: input.perfilId || null } : {}),
        ...(input.superUsuario !== undefined ? { superUsuario: input.superUsuario } : {}),
      },
    });

    if (input.gereRh !== undefined) await aplicarExtra(input.id, "gereRh", input.gereRh, ctx.user.id);
    if (input.moderaChat !== undefined) await aplicarExtra(input.id, "moderaChat", input.moderaChat, ctx.user.id);

    if (socioMudou) {
      if (desejaSocio) {
        if (socio) {
          await prisma.socio.update({ where: { id: socio.id }, data: { ativo: true } });
        } else {
          // Percentual de participação é gerido em Financeiro → Cadastros → Sócios.
          await prisma.socio.create({ data: { userId: input.id, percentual: 0 } });
        }
      } else if (socio) {
        await prisma.socio.update({ where: { id: socio.id }, data: { ativo: false } });
      }
      // Reconcilia o canal "Sócios" do chat e reflete ao vivo (entrar/sair).
      const sync = await ensureCanalSocios();
      notificarNovosMembros(sync.adicionados);
      for (const r of sync.removidos) emitParaUsuario(r.userId, "sair-canal", { canalId: r.canalId });
    }

    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const desativarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "desativar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input, ctx) => {
    if (input.id === ctx.user.id) {
      throw new ActionError("Você não pode desativar o próprio usuário.");
    }
    // Nunca exclui — apenas desativa (regra de negócio).
    await prisma.user.update({ where: { id: input.id }, data: { ativo: false } });
    // Encerra sessões ativas do usuário desativado.
    await prisma.session.deleteMany({ where: { userId: input.id } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

/**
 * Exclusão DEFINITIVA (admin) de um usuário já desativado e SEM histórico de atividade.
 * Só remove contas "vazias" (criadas por engano / nunca usadas): usa a auditoria como prova
 * de atividade e deixa o banco barrar (P2003) qualquer registro de negócio vinculado.
 * Usuários com histórico permanecem desativados — nunca são apagados (integridade/legal).
 */
export const excluirUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "excluir-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    superUsuario: true,
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: async (input) =>
      prisma.user.findUnique({
        where: { id: input.id },
        select: { name: true, email: true, tipo: true, ativo: true },
      }),
  },
  async (input, ctx) => {
    if (input.id === ctx.user.id) {
      throw new ActionError("Você não pode excluir o próprio usuário.");
    }
    const alvo = await prisma.user.findUnique({ where: { id: input.id }, select: { ativo: true } });
    if (!alvo) throw new ActionError("Usuário não encontrado.");
    if (alvo.ativo) throw new ActionError("Desative o usuário antes de excluí-lo.");

    // Proxy de atividade: toda mutação passa por auditoria. Se há qualquer registro, o
    // usuário já atuou (histórico/financeiro/ponto vinculados) → não pode ser apagado.
    const atividade = await prisma.auditLog.count({ where: { userId: input.id } });
    if (atividade > 0) {
      throw new ActionError(
        "Este usuário possui histórico de atividade e não pode ser excluído — mantenha-o desativado.",
      );
    }

    try {
      // Cascata remove sessões/contas/preferências (artefatos de autenticação, sem valor).
      await prisma.user.delete({ where: { id: input.id } });
    } catch (e) {
      // FK (P2003): sobrou algum registro de negócio vinculado → não apaga.
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2003") {
        throw new ActionError(
          "Não é possível excluir: o usuário possui registros vinculados (arquivos, tarefas, financeiro, ponto). Mantenha-o desativado.",
        );
      }
      throw e;
    }

    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const reativarUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "reativar-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    // `acessoAte` vencido faria `getSession` recusar a pessoa recém-reativada.
    await prisma.user.update({ where: { id: input.id }, data: { ativo: true, acessoAte: null } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

/**
 * Auto-serviço: o próprio usuário define seu nome de EXIBIÇÃO (`name`), mostrado nas telas.
 * Não sensível → sem validação de admin. O nome completo (cadastro) é editado separadamente pelo RH.
 */
export const atualizarNomeExibicao = defineAction(
  {
    modulo: "conta",
    acao: "atualizar-nome-exibicao",
    entidade: "User",
    schema: nomeExibicaoSchema,
  },
  async (input, ctx) => {
    const name = input.name.trim();
    await prisma.user.update({ where: { id: ctx.user.id }, data: { name } });
    // Atualiza o layout do servidor (topbar / user-menu) e telas que exibem o nome.
    revalidatePath("/", "layout");
    return { name };
  },
);

export const resetarSenhaUsuario = defineAction(
  {
    modulo: "configuracoes",
    acao: "resetar-senha-usuario",
    recurso: "usuarios",
    permissao: "gerir",
    entidade: "User",
    schema: usuarioIdSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    const senhaTemporaria = await resetarSenha(input.id);
    // Marca solicitações de reset pendentes como resolvidas.
    await prisma.solicitacaoResetSenha.updateMany({
      where: { userId: input.id, resolvida: false },
      data: { resolvida: true },
    });
    revalidatePath(REVALIDATE);
    return { id: input.id, senhaTemporaria };
  },
);
