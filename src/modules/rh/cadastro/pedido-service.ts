import "server-only";

import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import { diaDeSaoPaulo } from "@/lib/data";

import { camposFaltantes } from "@/modules/rh/pessoas/completude";
import { minhaContaPendente } from "@/modules/rh/contas/queries";
import {
  planoDePreenchimento,
  reconfirmacaoDevida,
  reconfirmacaoPendente,
  situacaoDoPreenchimento,
  textoDaFaixa,
  textoDaFaixaReconfirmar,
  type SituacaoPreenchimento,
} from "./preencher";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** `solicitadoPorId` do pedido de reconfirmação aberto pelo job (sem pessoa por trás). */
export const SISTEMA = "sistema";

/** Chaves do blob `UserPreference.dados.cadastroPendente.preenchimentos` (CPF/RG à espera do RH). */
export async function preenchimentosPendentes(userId: string): Promise<Record<string, string>> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const pend = (pref?.dados as Record<string, unknown> | null)?.["cadastroPendente"] as { preenchimentos?: Record<string, string> } | undefined;
  return { ...(pend?.preenchimentos ?? {}) };
}

/**
 * O que falta no cadastro da pessoa e o que ELA pode fazer — a mesma regra do selo de cadastro
 * incompleto (`camposFaltantes`), com a contratação real e folha avaliada (a conta bancária conta).
 * `null` para quem não tem cadastro (cliente, TI).
 */
export async function situacaoDaPessoa(userId: string): Promise<SituacaoPreenchimento | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tipo: true,
      contratacao: true,
      nomeCompleto: true,
      cpf: true,
      rg: true,
      dataNascimento: true,
      telefone: true,
      enderecoCep: true,
      enderecoLogradouro: true,
      enderecoNumero: true,
      enderecoComplemento: true,
      enderecoBairro: true,
      enderecoCidade: true,
      enderecoUf: true,
      dataAdmissao: true,
      cargoId: true,
      departamentoId: true,
      pjId: true,
      salarioBase: true,
      _count: { select: { contasBancarias: { where: { ativo: true } } } },
    },
  });
  if (!u || u.tipo !== "interno") return null;

  const faltantes = camposFaltantes({
    tipo: u.tipo,
    contratacao: u.contratacao,
    nomeCompleto: u.nomeCompleto,
    cpf: u.cpf,
    rg: u.rg,
    dataNascimento: ymd(u.dataNascimento),
    enderecoCep: u.enderecoCep,
    enderecoLogradouro: u.enderecoLogradouro,
    enderecoNumero: u.enderecoNumero,
    enderecoBairro: u.enderecoBairro,
    enderecoCidade: u.enderecoCidade,
    enderecoUf: u.enderecoUf,
    telefone: u.telefone,
    dataAdmissao: ymd(u.dataAdmissao),
    cargoId: u.cargoId,
    departamentoId: u.departamentoId,
    pjId: u.pjId,
    temSalario: u.salarioBase != null,
    contasBancariasAtivas: u._count.contasBancarias,
    avaliarFolha: true,
  });
  const [preenchimentos, conta] = await Promise.all([preenchimentosPendentes(userId), minhaContaPendente(userId)]);
  const atual: Record<string, string | null> = {
    nomeCompleto: u.nomeCompleto,
    cpf: u.cpf,
    rg: u.rg,
    dataNascimento: ymd(u.dataNascimento),
    telefone: u.telefone,
    enderecoCep: u.enderecoCep,
    enderecoLogradouro: u.enderecoLogradouro,
    enderecoNumero: u.enderecoNumero,
    enderecoComplemento: u.enderecoComplemento,
    enderecoBairro: u.enderecoBairro,
    enderecoCidade: u.enderecoCidade,
    enderecoUf: u.enderecoUf,
  };
  return situacaoDoPreenchimento(faltantes, atual, new Set(Object.keys(preenchimentos)), conta?.tipo === "criar");
}

/** A faixa do topo: só com pedido aberto E algo a fazer. Leitura pura — fechar o pedido é das ações e do job. */
export async function faixaDoUsuario(userId: string) {
  const pedido = await prisma.pedidoDadosCadastro.findFirst({
    where: { userId, status: "aberto" },
    select: { prazo: true, mensagem: true, tipo: true, criadoEm: true, user: { select: { dadosConfirmadosEm: true } } },
  });
  if (!pedido) return null;
  if (pedido.tipo === "reconfirmar") {
    if (!reconfirmacaoPendente(pedido.criadoEm, pedido.user.dadosConfirmadosEm)) return null;
    return { ...textoDaFaixaReconfirmar(ymd(pedido.prazo), diaDeSaoPaulo()), mensagem: pedido.mensagem, href: "/minha-ficha?confirmar=1" };
  }
  const situacao = await situacaoDaPessoa(userId);
  if (!situacao || situacao.pendenteDaPessoa === 0) return null;
  return { ...textoDaFaixa(situacao.pendenteDaPessoa, ymd(pedido.prazo), diaDeSaoPaulo()), mensagem: pedido.mensagem, href: "/minha-ficha?completar=1" };
}

/**
 * Fecha o pedido aberto quando nada mais depende da pessoa (preencheu tudo ou o que sobrou está
 * com o RH) e avisa quem pediu. Condicionado ao status `aberto`: duas chamadas juntas fecham uma vez.
 */
export async function fecharSeAtendido(userId: string): Promise<boolean> {
  const pedido = await prisma.pedidoDadosCadastro.findFirst({
    where: { userId, status: "aberto" },
    select: { id: true, tipo: true, criadoEm: true, solicitadoPorId: true, user: { select: { name: true, dadosConfirmadosEm: true } } },
  });
  if (!pedido) return false;
  const reconfirmar = pedido.tipo === "reconfirmar";
  const situacao = reconfirmar ? null : await situacaoDaPessoa(userId);
  if (reconfirmar ? reconfirmacaoPendente(pedido.criadoEm, pedido.user.dadosConfirmadosEm) : situacao && situacao.pendenteDaPessoa > 0) return false;
  const r = await prisma.pedidoDadosCadastro.updateMany({
    where: { id: pedido.id, status: "aberto" },
    data: { status: "atendido", atendidoEm: new Date() },
  });
  if (r.count !== 1) return false;
  // Completar o que faltava também conta como conferir os dados.
  if (!reconfirmar) await prisma.user.update({ where: { id: userId }, data: { dadosConfirmadosEm: new Date() } });
  // Pedido automático (sem pessoa por trás) não avisa ninguém.
  if (pedido.solicitadoPorId === SISTEMA) return true;
  await notificar(pedido.solicitadoPorId, {
    titulo: "Dados atualizados",
    corpo: reconfirmar
      ? `${pedido.user.name} confirmou que os dados do cadastro continuam certos.`
      : `${pedido.user.name} completou os dados que o RH pediu${situacao && situacao.aguardandoRh.length > 0 ? ` (${situacao.aguardandoRh.join(", ")} aguardando sua aprovação)` : ""}.`,
    href: `/rh/pessoas/${userId}`,
  });
  return true;
}

/** Job diário: fecha os pedidos que ficaram atendidos por outro caminho (RH editou a ficha, conta aprovada). */
export async function fecharPedidosAtendidos(): Promise<number> {
  const abertos = await prisma.pedidoDadosCadastro.findMany({ where: { status: "aberto" }, select: { userId: true } });
  let fechados = 0;
  for (const p of abertos) if (await fecharSeAtendido(p.userId)) fechados++;
  return fechados;
}

/**
 * O miolo de "Completar meus dados" (a action só autentica e revalida): aplica o vazio comum,
 * guarda CPF/RG para o RH e fecha o pedido se nada mais depende da pessoa. Separado da action
 * para o smoke exercitar o mesmo código da tela.
 */
export async function preencherDadosNoBanco(user: { id: string; name: string }, valores: Record<string, string>) {
  const atual = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      nomeCompleto: true, cpf: true, rg: true, dataNascimento: true, telefone: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
      enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
    },
  });
  if (!atual) throw new ActionError("Usuário não encontrado.");
  const pendentes = await preenchimentosPendentes(user.id);
  const valoresAtuais: Record<string, string | null> = {
    ...Object.fromEntries(Object.entries(atual).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | null)])),
  };
  // Campo já esperando o RH conta como preenchido: não manda duas vezes.
  for (const k of Object.keys(pendentes)) valoresAtuais[k] = valoresAtuais[k] || pendentes[k];

  const { aplicar, aprovar } = planoDePreenchimento(valores, valoresAtuais, diaDeSaoPaulo());

  if (Object.keys(aplicar).length > 0) {
    const data: Prisma.UserUpdateInput = {};
    for (const [k, v] of Object.entries(aplicar)) {
      (data as Record<string, unknown>)[k] = k === "dataNascimento" ? new Date(`${v}T00:00:00Z`) : v;
    }
    await prisma.user.update({ where: { id: user.id }, data });
  }

  if (Object.keys(aprovar).length > 0) {
    const pref = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { dados: true } });
    const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}) };
    const anterior = (dados["cadastroPendente"] as Record<string, unknown> | undefined) ?? {};
    dados["cadastroPendente"] = {
      alteracoes: (anterior.alteracoes as Record<string, string> | undefined) ?? {},
      preenchimentos: { ...((anterior.preenchimentos as Record<string, string> | undefined) ?? {}), ...aprovar },
      propostoEm: (anterior.propostoEm as string | undefined) ?? new Date().toISOString(),
    };
    const valor = dados as Prisma.InputJsonObject;
    await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, dados: valor }, update: { dados: valor } });

    const gestores = await prisma.user.findMany({ where: whereAudiencia("rh_admin"), select: { id: true } });
    await notificarMuitos(
      gestores.map((g) => g.id).filter((id) => id !== user.id),
      {
        titulo: "Dados de cadastro para validar",
        corpo: `${user.name} preencheu ${Object.keys(aprovar).map((k) => k.toUpperCase()).join(" e ")} no próprio cadastro.`,
        href: "/rh/pessoas",
        tag: "alteracao-cadastro",
      },
    );
  }

  const atendido = await fecharSeAtendido(user.id);
  return { aplicados: Object.keys(aplicar).length, paraValidar: Object.keys(aprovar).length, atendido };
}

/** "Está tudo certo": a pessoa confirma o cadastro; fecha o pedido de reconfirmação se houver. */
export async function confirmarMeusDadosNoBanco(userId: string): Promise<{ atendido: boolean }> {
  await prisma.user.update({ where: { id: userId }, data: { dadosConfirmadosEm: new Date() } });
  return { atendido: await fecharSeAtendido(userId) };
}

/**
 * Job diário: abre o pedido de reconfirmação para quem confirmou há 12 meses ou mais e não tem pedido
 * aberto. Quem NUNCA confirmou fica de fora (a primeira rodada é do RH, em lote) — senão o deploy
 * dispararia a faixa para todo mundo no mesmo dia.
 */
export async function criarReconfirmacoesAnuais(agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - 365 * 86_400_000);
  const candidatos = await prisma.user.findMany({
    where: { ativo: true, tipo: "interno", dadosConfirmadosEm: { lte: limite }, pedidosDados: { none: { status: "aberto" } } },
    select: { id: true, dadosConfirmadosEm: true },
  });
  let criados = 0;
  for (const c of candidatos) {
    if (!reconfirmacaoDevida(c.dadosConfirmadosEm, agora)) continue;
    try {
      await prisma.pedidoDadosCadastro.create({ data: { userId: c.id, solicitadoPorId: SISTEMA, tipo: "reconfirmar" } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") continue; // outro pedido abriu no meio
      throw e;
    }
    await notificar(c.id, {
      titulo: "Confira seus dados de cadastro",
      corpo: "Faz um ano da última conferência. Veja se contato, endereço e contato de emergência continuam certos.",
      href: "/minha-ficha?confirmar=1",
      tag: "pedido-dados",
    });
    criados++;
  }
  return criados;
}

/** Há reconfirmação aberta esperando a pessoa? (cartão "Confira seus dados" em Minha conta) */
export async function reconfirmacaoAberta(userId: string): Promise<boolean> {
  const p = await prisma.pedidoDadosCadastro.findFirst({
    where: { userId, status: "aberto", tipo: "reconfirmar" },
    select: { criadoEm: true, user: { select: { dadosConfirmadosEm: true } } },
  });
  return !!p && reconfirmacaoPendente(p.criadoEm, p.user.dadosConfirmadosEm);
}
