import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { emitParaUsuario } from "@/lib/socket";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { destinatariosDaEquipe } from "./audiencia";
import { coordenadoresDoProjeto } from "@/modules/projetos/coordenacao-queries";
import { EVENTO_CONVERSA, precisaDeEmail } from "./regras";
import { audienciaDoProjeto, contasDoClienteDoProjeto } from "./service";

/**
 * Avisos de mensagem nova na conversa do portal — sempre DEPOIS do commit; uma falha aqui nunca desfaz a mensagem.
 *
 * - Cliente escreveu → coordenadores membros do projeto (sem nenhum, os de escopo global), sempre dentro da audiência;
 *   sino e e-mail respeitam a categoria `mensagem_cliente`.
 * - Equipe escreveu → as contas ativas do cliente; o sino vai sempre, só o e-mail respeita `portal_mensagem`.
 * - O autor nunca. E-mail no máximo um por conversa e pessoa até ela ler (reserva atômica na leitura), sem o texto.
 * - Socket.io `portal-conversa` com só o `projetoId`, por usuário, para a audiência inteira e todas as contas ativas do
 *   cliente (opt-out não corta: é a tela aberta que se atualiza).
 */

export type AvisarMensagem = {
  notificar: (ids: string[], n: { titulo: string; corpo: string; href: string }, o?: { categoria: string }) => Promise<void>;
  enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
  emitir: (userId: string, evento: string, payload: unknown) => void;
};

const avisosPadrao = (): AvisarMensagem => ({
  notificar: (ids, n, o) => notificarMuitos(ids, n, o),
  enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null,
  emitir: emitParaUsuario,
});

export const hrefDoCliente = (projetoId: string) => `/portal/${projetoId}#mensagens`;
export const hrefDaEquipe = (projetoId: string) => `/projetos/${projetoId}/cliente`;

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/**
 * Avisa a tela aberta dos dois lados que a conversa mudou (mensagem nova, decisão marcada ou desmarcada).
 * `audiencia` = a de `audienciaDoProjeto`, quando quem chama já a calculou (o aviso de mensagem nova): não lê de novo.
 */
export async function emitirAtualizacaoDaConversa(
  projetoId: string,
  emitir: AvisarMensagem["emitir"] = emitParaUsuario,
  audienciaPronta?: readonly string[],
): Promise<number> {
  const audiencia = audienciaPronta ?? (await audienciaDoProjeto(projetoId));
  const contas = (await contasDoClienteDoProjeto(projetoId)).map((c) => c.userId);
  let n = 0;
  for (const id of new Set([...audiencia, ...contas])) {
    try {
      emitir(id, EVENTO_CONVERSA, { projetoId });
      n += 1;
    } catch (e) {
      console.error("[portal-mensagens] emissão falhou:", e);
    }
  }
  return n;
}

/**
 * Reserva o e-mail desta pessoa nesta conversa: cria a linha de leitura (sem `lidaAte`) se não existe e marca
 * `emailAvisadoEm` só se nunca avisada ou se leu depois do último aviso. Ganhou a reserva = pode enviar. A marca é a
 * hora da MENSAGEM (não a do relógio): quem abre a conversa lê até a última mensagem carregada, e é essa hora que
 * precisa alcançar o aviso para a próxima mensagem avisar de novo.
 */
async function reservarEmail(
  conversaId: string,
  userId: string,
  marca: Date,
): Promise<{ ganhou: false } | { ganhou: true; id: string; anterior: Date | null }> {
  await prisma.$executeRaw`
    INSERT INTO leitura_conversa_portal (id, "conversaId", "userId")
    VALUES (${randomUUID()}, ${conversaId}, ${userId})
    ON CONFLICT ("conversaId", "userId") DO NOTHING`;
  const atual = await prisma.leituraConversaPortal.findUnique({
    where: { conversaId_userId: { conversaId, userId } },
    select: { lidaAte: true, emailAvisadoEm: true },
  });
  if (!atual || !precisaDeEmail(atual)) return { ganhou: false };
  const r = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE leitura_conversa_portal SET "emailAvisadoEm" = ${marca}
    WHERE "conversaId" = ${conversaId} AND "userId" = ${userId}
      AND ("emailAvisadoEm" IS NULL OR ("lidaAte" IS NOT NULL AND "emailAvisadoEm" <= "lidaAte"))
    RETURNING id`;
  if (r.length === 0) return { ganhou: false };
  return { ganhou: true, id: r[0].id, anterior: atual.emailAvisadoEm };
}

/** Envio falhou: devolve a reserva (só se ninguém a trocou desde então). */
async function liberarEmail(id: string, marca: Date, anterior: Date | null): Promise<void> {
  await prisma.leituraConversaPortal.updateMany({ where: { id, emailAvisadoEm: marca }, data: { emailAvisadoEm: anterior } });
}

export async function avisarMensagemNova(
  mensagemId: string,
  deps: AvisarMensagem = avisosPadrao(),
): Promise<{ sinos: number; emails: number; emitidos: number }> {
  const zero = { sinos: 0, emails: 0, emitidos: 0 };
  const m = await prisma.mensagemPortal.findUnique({
    where: { id: mensagemId },
    select: { id: true, conversaId: true, autorId: true, autorNome: true, lado: true, criadaEm: true },
  });
  if (!m) return zero;
  const conversa = await prisma.conversaPortal.findUnique({ where: { id: m.conversaId }, select: { projetoId: true } });
  if (!conversa) return zero;
  const projeto = await prisma.projeto.findUnique({
    where: { id: conversa.projetoId },
    select: { id: true, codigo: true, nome: true },
  });
  if (!projeto) return zero;
  const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  // Uma leitura da audiência por aviso: serve aos destinatários (cliente escreveu) e à emissão do fim.
  const audienciaIds = await audienciaDoProjeto(projeto.id);

  let sinos = 0;
  let emails = 0;
  // Quem recebe, com o e-mail de cada um, já sem o autor e já filtrado pela categoria de cada lado.
  let paraSino: string[];
  let paraEmail: { userId: string; nome: string; email: string | null }[];
  let categoriaDoSino: string | undefined;
  let slug: string;
  let href: string;
  let texto: { titulo: string; corpo: string };

  if (m.lado === "cliente") {
    const audiencia = new Set(audienciaIds);
    const coordenadores = (await coordenadoresDoProjeto(projeto.id)).filter((id) => audiencia.has(id));
    const globais =
      coordenadores.length > 0
        ? []
        : (await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } }))
            .map((g) => g.id)
            .filter((id) => audiencia.has(id));
    const destino = destinatariosDaEquipe({ coordenadores, globais, autorId: m.autorId });
    // Equipe: o opt-out `mensagem_cliente` corta sino E e-mail.
    const comAviso = await filtrarPorCategoria(destino, "mensagem_cliente");
    const pessoas = comAviso.length
      ? await prisma.user.findMany({ where: { id: { in: comAviso } }, select: { id: true, name: true, email: true } })
      : [];
    paraSino = comAviso;
    paraEmail = pessoas.map((p) => ({ userId: p.id, nome: p.name, email: p.email || null }));
    categoriaDoSino = "mensagem_cliente";
    slug = "portal-mensagem-cliente";
    href = hrefDaEquipe(projeto.id);
    texto = {
      titulo: `Mensagem do cliente — ${formatarCodigo(projeto.codigo)}`,
      corpo: `${m.autorNome} escreveu na conversa do projeto ${projeto.nome}.`,
    };
  } else {
    const contas = (await contasDoClienteDoProjeto(projeto.id)).filter((c) => c.userId !== m.autorId);
    // Cliente: o sino vai sempre; só o e-mail respeita `portal_mensagem`.
    const querEmail = new Set(await filtrarPorCategoria(contas.map((c) => c.userId), "portal_mensagem"));
    paraSino = contas.map((c) => c.userId);
    paraEmail = contas.filter((c) => querEmail.has(c.userId));
    categoriaDoSino = undefined;
    slug = "portal-mensagem-equipe";
    href = hrefDoCliente(projeto.id);
    texto = {
      titulo: "Mensagem nova da coordenação",
      corpo: `${m.autorNome} escreveu na conversa do projeto ${projeto.nome}.`,
    };
  }

  if (paraSino.length > 0) {
    try {
      await deps.notificar(paraSino, { ...texto, href }, categoriaDoSino ? { categoria: categoriaDoSino } : undefined);
      sinos = paraSino.length;
    } catch (e) {
      console.error("[portal-mensagens] sino falhou:", e);
    }
  }

  if (deps.enviarEmail) {
    for (const p of paraEmail) {
      if (!p.email) continue;
      try {
        const reserva = await reservarEmail(m.conversaId, p.userId, m.criadaEm);
        if (!reserva.ganhou) continue;
        let enviado = false;
        try {
          enviado = await deps.enviarEmail(p.email, slug, {
            nome: primeiroNome(p.nome),
            projeto: projeto.nome,
            autor: m.autorNome,
            url: `${app}${href}`,
          });
        } catch (e) {
          console.error("[portal-mensagens] e-mail falhou:", e);
        }
        if (enviado) emails += 1;
        else await liberarEmail(reserva.id, m.criadaEm, reserva.anterior);
      } catch (e) {
        console.error("[portal-mensagens] reserva do e-mail falhou:", e);
      }
    }
  }

  let emitidos = 0;
  try {
    emitidos = await emitirAtualizacaoDaConversa(projeto.id, deps.emitir, audienciaIds);
  } catch (e) {
    console.error("[portal-mensagens] emissão falhou:", e);
  }
  return { sinos, emails, emitidos };
}
