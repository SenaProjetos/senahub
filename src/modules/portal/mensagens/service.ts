import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { can } from "@/lib/permissions";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import { escopoProjeto } from "@/modules/projetos/queries";
import { acessoDoUsuarioAoProjetoDoPortal } from "@/modules/portal/acesso";
import { ehPerfilCoordenador, PERFIL_COORDENADOR } from "@/modules/projetos/coordenacao";
import { podeVerConversa, type FatosAudiencia } from "./audiencia";
import {
  MOTIVO_DECISAO_JA_MARCADA,
  MOTIVO_DECISAO_NAO_MARCADA,
  MOTIVO_NAO_ENCONTRADA,
  RESUMO_MAX,
  motivoDoTipoDoAnexo,
  motivoParaNaoAnexar,
  motivoParaNaoEnviar,
  type LadoMensagem,
} from "./regras";

/**
 * Conversa do cliente com a coordenação (spec `docs/superpowers/specs/2026-11-21-portal-mensagens-coordenacao-design.md`).
 *
 * Duas portas, conferidas AQUI (não na tela nem só na action): o lado do cliente pela regra de acesso do portal
 * (`acessoDoUsuarioAoProjetoDoPortal` + conta externa ativa), o lado da equipe pela audiência (`podeVerConversa`).
 * Qualquer recusa é a mesma frase, `MOTIVO_NAO_ENCONTRADA` — nunca diz se a conversa existe.
 *
 * Mensagem e anexo nunca se editam nem se apagam. Avisos ficam em `avisos.ts`, chamados depois do commit.
 */

export type Autor = { userId: string; nome: string; lado: LadoMensagem };

const naoEncontrada = () => new ActionError(MOTIVO_NAO_ENCONTRADA);

// ── Audiência do escritório ─────────────────────────────────────────────────────────────────

/**
 * Junta os fatos de `podeVerConversa` para várias pessoas × vários projetos com poucas consultas. É a ÚNICA montagem
 * de fatos: `audienciaDoProjeto` (muitas pessoas, um projeto), `podeVerConversaDoProjeto` (uma, uma) e
 * `conversasDaEquipe` (uma, muitas) passam por aqui — a regra é sempre `podeVerConversa`.
 */
export async function fatosDaAudiencia(
  userIds: readonly string[],
  projetoIds: readonly string[],
): Promise<(userId: string, projetoId: string) => FatosAudiencia | null> {
  const ids = [...new Set(userIds)];
  const projs = [...new Set(projetoIds)];
  if (ids.length === 0 || projs.length === 0) return () => null;
  const pessoas = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, ativo: true, tipo: true, superUsuario: true, perfilId: true, perfil: { select: { chave: true } } },
  });
  const fatos = new Map<string, { base: Omit<FatosAudiencia, "enxergaProjeto">; enxerga: Set<string> }>();
  for (const u of pessoas) {
    const escopoGlobalPerfil = await can(u, "escopo", "global");
    const enxerga =
      u.tipo === "interno" && u.ativo
        ? new Set(
            (
              await prisma.projeto.findMany({
                where: { id: { in: projs }, ...escopoProjeto({ id: u.id, superUsuario: u.superUsuario, escopoGlobalPerfil, tipo: u.tipo }) },
                select: { id: true },
              })
            ).map((p) => p.id),
          )
        : new Set<string>();
    fatos.set(u.id, {
      base: {
        ativo: u.ativo,
        tipo: u.tipo,
        superUsuario: u.superUsuario,
        escopoGlobalPerfil,
        perfilChave: u.perfil?.chave ?? null,
      },
      enxerga,
    });
  }
  return (userId, projetoId) => {
    const f = fatos.get(userId);
    if (!f) return null;
    return { ...f.base, enxergaProjeto: f.enxerga.has(projetoId) };
  };
}

/**
 * Ids internos ativos que veem a conversa do projeto. Candidatos: superusuário, escopo global (o do perfil e o de
 * `whereAudiencia("global")`), membro do projeto e perfil Coordenador — e cada um passa por `podeVerConversa`.
 */
export async function audienciaDoProjeto(projetoId: string): Promise<string[]> {
  const candidatos = await prisma.user.findMany({
    where: {
      ativo: true,
      tipo: "interno",
      OR: [
        { superUsuario: true },
        whereAudiencia("global"),
        wherePermissao("escopo", "global"),
        { projetosMembro: { some: { projetoId } } },
        { perfil: { chave: PERFIL_COORDENADOR } },
      ],
    },
    select: { id: true },
  });
  const ids = candidatos.map((c) => c.id);
  const fatos = await fatosDaAudiencia(ids, [projetoId]);
  return ids.filter((id) => {
    const f = fatos(id, projetoId);
    return f !== null && podeVerConversa(f);
  });
}

export async function podeVerConversaDoProjeto(userId: string, projetoId: string): Promise<boolean> {
  const f = (await fatosDaAudiencia([userId], [projetoId]))(userId, projetoId);
  return f !== null && podeVerConversa(f);
}

/**
 * A pessoa é audiência da conversa de ALGUM projeto? (lista "Mensagens de clientes" e o botão em Projetos.)
 * `podeVerConversa` só cresce com o enxergar, então perguntar no melhor caso — enxerga algum projeto — é o mesmo que
 * "existe um projeto em que ela vê". `coordenadorDeAlgum` (perfil Coordenador que enxerga algum projeto, a mesma regra de
 * `coordenaOProjeto`) liga o filtro "Só os projetos em que sou coordenador" da lista.
 */
export async function audienciaDeAlgumProjeto(userId: string): Promise<{ audiencia: boolean; coordenadorDeAlgum: boolean }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, ativo: true, tipo: true, superUsuario: true, perfilId: true, perfil: { select: { chave: true } } },
  });
  if (!u) return { audiencia: false, coordenadorDeAlgum: false };
  const escopoGlobalPerfil = await can(u, "escopo", "global");
  const base = {
    ativo: u.ativo,
    tipo: u.tipo,
    superUsuario: u.superUsuario,
    escopoGlobalPerfil,
    perfilChave: u.perfil?.chave ?? null,
  };
  const coordenador = u.ativo && u.tipo === "interno" && ehPerfilCoordenador(base.perfilChave);
  // Escopo global enxerga todos os projetos: vê todas as conversas e, sendo Coordenador, coordena todos.
  if (podeVerConversa({ ...base, enxergaProjeto: false })) return { audiencia: true, coordenadorDeAlgum: coordenador };
  // Sem escopo global, só o perfil Coordenador vê — e só se enxerga algum projeto pelo escopo de dados.
  if (!coordenador) return { audiencia: false, coordenadorDeAlgum: false };
  const algum = await prisma.projeto.findFirst({
    where: escopoProjeto({ id: u.id, superUsuario: u.superUsuario, escopoGlobalPerfil, tipo: u.tipo }),
    select: { id: true },
  });
  return { audiencia: algum !== null, coordenadorDeAlgum: algum !== null };
}

// ── Lado do cliente ─────────────────────────────────────────────────────────────────────────

/** Conta externa ativa com acesso ao projeto pelo portal (cliente ativo, termo e senha em dia, projeto do cliente). */
export async function contaPodeVerConversa(userId: string, projetoId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, ativo: true, tipo: true, mustChangePassword: true },
  });
  if (!u || !u.ativo || u.tipo !== "externo") return false;
  const acesso = await acessoDoUsuarioAoProjetoDoPortal({ id: u.id, tipo: u.tipo, mustChangePassword: u.mustChangePassword }, projetoId);
  return acesso.ok;
}

/** Contas externas ativas do cliente do projeto, com o cliente ativo (os destinatários quando a equipe escreve). */
export async function contasDoClienteDoProjeto(
  projetoId: string,
): Promise<{ userId: string; nome: string; email: string | null }[]> {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { clienteId: true, cliente: { select: { ativo: true } } },
  });
  if (!projeto?.clienteId || !projeto.cliente?.ativo) return [];
  const contas = await prisma.user.findMany({
    where: { tipo: "externo", ativo: true, clienteId: projeto.clienteId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return contas.map((c) => ({ userId: c.id, nome: c.name, email: c.email || null }));
}

/** O lado de quem fala, conferido no banco: a mesma porta de leitura e de escrita. */
async function exigirLado(userId: string, projetoId: string, lado: LadoMensagem): Promise<void> {
  const pode = lado === "cliente" ? await contaPodeVerConversa(userId, projetoId) : await podeVerConversaDoProjeto(userId, projetoId);
  if (!pode) throw naoEncontrada();
}

/** O lado pelo tipo da pessoa (`marcarLida` serve aos dois): externo = cliente, interno = equipe. */
async function ladoComAcesso(userId: string, projetoId: string): Promise<LadoMensagem | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tipo: true } });
  if (!u) return null;
  const lado: LadoMensagem = u.tipo === "externo" ? "cliente" : "equipe";
  const pode = lado === "cliente" ? await contaPodeVerConversa(userId, projetoId) : await podeVerConversaDoProjeto(userId, projetoId);
  return pode ? lado : null;
}

// ── Escritas ────────────────────────────────────────────────────────────────────────────────

/**
 * Uma transação: cria a conversa se não existe (`ON CONFLICT DO NOTHING` — duas primeiras mensagens ao mesmo tempo
 * dão UMA conversa), trava a linha dela, grava a mensagem com a hora lida sob a trava (a ordem da trava é a ordem das
 * mensagens, e `ultimoLado` fica com a mais recente) e marca o autor como tendo lido até a própria mensagem.
 */
export async function enviarMensagem(p: {
  projetoId: string;
  autor: Autor;
  texto: string;
  comAnexos: boolean;
}): Promise<{ mensagemId: string; conversaId: string }> {
  await exigirLado(p.autor.userId, p.projetoId, p.autor.lado);
  const motivo = motivoParaNaoEnviar({ texto: p.texto, comAnexos: p.comAnexos });
  if (motivo) throw new ActionError(motivo);
  const texto = p.texto.trim();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO conversa_portal (id, "projetoId", "criadaEm")
      VALUES (${randomUUID()}, ${p.projetoId}, ${new Date()})
      ON CONFLICT ("projetoId") DO NOTHING`;
    const travada = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM conversa_portal WHERE "projetoId" = ${p.projetoId} FOR UPDATE`;
    const conversaId = travada[0]?.id;
    if (!conversaId) throw naoEncontrada();
    const criadaEm = new Date();
    const m = await tx.mensagemPortal.create({
      data: {
        conversaId,
        autorId: p.autor.userId,
        autorNome: p.autor.nome,
        lado: p.autor.lado,
        texto,
        comAnexos: p.comAnexos,
        criadaEm,
      },
      select: { id: true },
    });
    await tx.conversaPortal.update({
      where: { id: conversaId },
      data: { ultimaMensagemEm: criadaEm, ultimoLado: p.autor.lado },
    });
    await tx.$executeRaw`
      INSERT INTO leitura_conversa_portal (id, "conversaId", "userId", "lidaAte")
      VALUES (${randomUUID()}, ${conversaId}, ${p.autor.userId}, ${criadaEm})
      ON CONFLICT ("conversaId", "userId")
      DO UPDATE SET "lidaAte" = GREATEST(leitura_conversa_portal."lidaAte", EXCLUDED."lidaAte")`;
    return { mensagemId: m.id, conversaId };
  });
}

/**
 * Marca como lida até `ate` (a última mensagem carregada na tela), limitado a agora e sem nunca recuar. Sem conversa
 * ainda, não há o que marcar.
 */
export async function marcarLida(p: { projetoId: string; userId: string; ate: Date }): Promise<void> {
  if (!(await ladoComAcesso(p.userId, p.projetoId))) throw naoEncontrada();
  const conversa = await prisma.conversaPortal.findUnique({ where: { projetoId: p.projetoId }, select: { id: true } });
  if (!conversa) return;
  const agora = new Date();
  const ate = Number.isNaN(p.ate.getTime()) || p.ate > agora ? agora : p.ate;
  await prisma.$executeRaw`
    INSERT INTO leitura_conversa_portal (id, "conversaId", "userId", "lidaAte")
    VALUES (${randomUUID()}, ${conversa.id}, ${p.userId}, ${ate})
    ON CONFLICT ("conversaId", "userId")
    DO UPDATE SET "lidaAte" = GREATEST(leitura_conversa_portal."lidaAte", EXCLUDED."lidaAte")`;
}

/** Projeto da mensagem (para conferir a audiência, emitir e revalidar). null = mensagem inexistente. */
export async function projetoDaMensagem(mensagemId: string): Promise<string | null> {
  const m = await prisma.mensagemPortal.findUnique({ where: { id: mensagemId }, select: { conversaId: true } });
  if (!m) return null;
  const c = await prisma.conversaPortal.findUnique({ where: { id: m.conversaId }, select: { projetoId: true } });
  return c?.projetoId ?? null;
}

/** Confere a audiência no projeto da mensagem e devolve o projeto (a action emite para ele sem ler de novo). */
async function exigirEquipeNaMensagem(mensagemId: string, userId: string): Promise<string> {
  const projetoId = await projetoDaMensagem(mensagemId);
  if (!projetoId || !(await podeVerConversaDoProjeto(userId, projetoId))) throw naoEncontrada();
  return projetoId;
}

/**
 * Marca a mensagem como decisão do cliente. Uma marca ativa por mensagem: o índice parcial decide a corrida.
 * Devolve o projeto da mensagem (para a emissão depois do commit).
 */
export async function marcarDecisao(p: {
  mensagemId: string;
  userId: string;
  resumo: string | null;
}): Promise<{ projetoId: string }> {
  const projetoId = await exigirEquipeNaMensagem(p.mensagemId, p.userId);
  const resumo = p.resumo?.trim() || null;
  if (resumo && resumo.length > RESUMO_MAX) throw new ActionError(`O resumo passa de ${RESUMO_MAX} caracteres.`);
  try {
    await prisma.decisaoMensagemPortal.create({ data: { mensagemId: p.mensagemId, resumo, marcadaPorId: p.userId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ActionError(MOTIVO_DECISAO_JA_MARCADA);
    throw e;
  }
  return { projetoId };
}

/** Remove a marca ativa: preenche quem e quando (nunca apaga — o histórico das marcações fica). */
export async function desmarcarDecisao(p: { mensagemId: string; userId: string }): Promise<{ projetoId: string }> {
  const projetoId = await exigirEquipeNaMensagem(p.mensagemId, p.userId);
  const { count } = await prisma.decisaoMensagemPortal.updateMany({
    where: { mensagemId: p.mensagemId, removidaEm: null },
    data: { removidaEm: new Date(), removidaPorId: p.userId },
  });
  if (count === 0) throw new ActionError(MOTIVO_DECISAO_NAO_MARCADA);
  return { projetoId };
}

// ── Anexos ──────────────────────────────────────────────────────────────────────────────────

/**
 * A mensagem aceita anexo desta pessoa? Confere, nesta ordem: a mensagem existe; a pessoa ainda passa pela porta do
 * lado da mensagem (conta externa com acesso ao projeto pelo portal, ou a audiência do escritório); o tipo do arquivo
 * (quando o nome já é conhecido); e as regras do anexo (`motivoParaNaoAnexar`: só o autor, só mensagem com anexos,
 * janela, limite). A rota pergunta isto ANTES de ler o corpo, sem o nome (não recebe 100 MB para recusar), e de novo
 * com o nome antes de gravar no disco; `gravarAnexo` repete as regras sob a trava da mensagem.
 * Lança `ActionError` — inexistente, sem acesso e de outra pessoa são todos `MOTIVO_NAO_ENCONTRADA`.
 */
export async function exigirMensagemAnexavel(p: {
  mensagemId: string;
  userId: string;
  nome?: string;
  /** Instante do começo da requisição (a rota o captura antes de ler o corpo); a janela é medida nele. */
  agora?: Date;
}): Promise<{ projetoId: string; conversaId: string }> {
  const m = await prisma.mensagemPortal.findUnique({
    where: { id: p.mensagemId },
    select: { conversaId: true, autorId: true, lado: true, criadaEm: true, comAnexos: true },
  });
  if (!m || m.autorId !== p.userId) throw naoEncontrada();
  const conversa = await prisma.conversaPortal.findUnique({ where: { id: m.conversaId }, select: { projetoId: true } });
  if (!conversa) throw naoEncontrada();
  await exigirLado(p.userId, conversa.projetoId, m.lado);
  const tipo = p.nome === undefined ? null : motivoDoTipoDoAnexo(p.nome);
  if (tipo) throw new ActionError(tipo);
  const anexos = await prisma.anexoMensagemPortal.count({ where: { mensagemId: p.mensagemId } });
  const motivo = motivoParaNaoAnexar({ ...m, userId: p.userId, agora: p.agora ?? new Date(), anexos });
  if (motivo) throw new ActionError(motivo);
  return { projetoId: conversa.projetoId, conversaId: m.conversaId };
}

/**
 * Registra um anexo já gravado no disco (a rota apaga o arquivo se isto lançar). Confere a porta de novo e, numa
 * transação, trava a linha da mensagem (`FOR UPDATE`): dois envios ao mesmo tempo contam um depois do outro e não
 * passam de 5. Leituras planas e em sequência dentro da transação. A janela de 15 minutos é medida em `agora`, o
 * começo da requisição: um arquivo grande que começou a subir no prazo não perde a vaga por terminar de chegar depois.
 * O limite de anexos e o autor continuam conferidos sob a trava.
 */
export async function gravarAnexo(p: {
  mensagemId: string;
  userId: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipo: string;
  agora?: Date;
}): Promise<{ anexoId: string }> {
  const agora = p.agora ?? new Date();
  await exigirMensagemAnexavel({ mensagemId: p.mensagemId, userId: p.userId, nome: p.nome, agora });
  return prisma.$transaction(async (tx) => {
    const travada = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM mensagem_portal WHERE id = ${p.mensagemId} FOR UPDATE`;
    if (travada.length === 0) throw naoEncontrada();
    const m = await tx.mensagemPortal.findUnique({
      where: { id: p.mensagemId },
      select: { autorId: true, criadaEm: true, comAnexos: true },
    });
    if (!m) throw naoEncontrada();
    const anexos = await tx.anexoMensagemPortal.count({ where: { mensagemId: p.mensagemId } });
    const motivo = motivoParaNaoAnexar({ ...m, userId: p.userId, agora, anexos });
    if (motivo) throw new ActionError(motivo);
    const a = await tx.anexoMensagemPortal.create({
      data: { mensagemId: p.mensagemId, caminho: p.caminho, nome: p.nome, tamanho: p.tamanho, tipo: p.tipo.slice(0, 200) },
      select: { id: true },
    });
    return { anexoId: a.id };
  });
}

/**
 * Quem baixa um anexo: o lado do cliente pela porta do portal (conta externa ativa com acesso ao projeto da conversa),
 * o escritório pela audiência (`podeVerConversaDoProjeto`). O `tipo` diz qual porta — e a porta confere o tipo no
 * banco, então quem se diz do outro lado não entra. null = não pode ou não existe (a rota responde 404 igual).
 */
export async function anexoParaUsuario(
  anexoId: string,
  user: { id: string; tipo: "interno" | "externo"; mustChangePassword: boolean },
): Promise<{ caminho: string; nome: string; tipo: string } | null> {
  const anexo = await prisma.anexoMensagemPortal.findUnique({
    where: { id: anexoId },
    select: { caminho: true, nome: true, tipo: true, mensagemId: true },
  });
  if (!anexo) return null;
  const projetoId = await projetoDaMensagem(anexo.mensagemId);
  if (!projetoId) return null;
  // Conta com troca de senha pendente não entra no portal; `contaPodeVerConversa` ainda relê ativo, tipo e a troca de
  // senha no banco (a sessão pode estar velha).
  if (user.mustChangePassword && user.tipo === "externo") return null;
  const pode = user.tipo === "externo" ? await contaPodeVerConversa(user.id, projetoId) : await podeVerConversaDoProjeto(user.id, projetoId);
  return pode ? { caminho: anexo.caminho, nome: anexo.nome, tipo: anexo.tipo } : null;
}

/** O cliente liga ou desliga o e-mail de mensagem nova da equipe (o sino fica). Grava só `notif_portal_mensagem`. */
export async function definirAvisoPortalMensagem(userId: string, quer: boolean): Promise<void> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}), notif_portal_mensagem: quer };
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, dados: dados as Prisma.InputJsonObject },
    update: { dados: dados as Prisma.InputJsonObject },
  });
}
