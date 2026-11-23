import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { destinatariosDaEquipe, ehPapelDeCoordenacao } from "@/modules/portal/mensagens/audiencia";
import { audienciaDoProjeto, contasDoClienteDoProjeto } from "@/modules/portal/mensagens/service";
import { ROTULO_RESPOSTA_ATA } from "./regras";
import type { TarefaAvisada } from "./service";

/**
 * Avisos das atas de reunião — sempre DEPOIS do commit; uma falha aqui nunca desfaz a escrita.
 *
 * - Ata publicada (cada versão) → contas ativas do cliente: sino (sem categoria) + e-mail `portal-ata-reuniao` (sem opção
 *   de desligar). Sem SMTP, só o sino.
 * - Resposta do cliente e pendência marcada como feita → coordenadores do projeto (sem nenhum, os de escopo global), na
 *   audiência; categoria `ata_reuniao`.
 * - Pendência reaberta → contas ativas do cliente, só sino.
 * - Tarefa nova (ou responsável trocado) → o responsável, com o mesmo aviso do módulo de Tarefas.
 */

type Notificacao = { titulo: string; corpo: string; href: string; tag?: string };
export type DepsAvisos = {
  notificar: (ids: string[], n: Notificacao, o?: { categoria: string }) => Promise<void>;
  enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
};

export const CATEGORIA = "ata_reuniao";
export const hrefDoCliente = (projetoId: string) => `/portal/${projetoId}#atas`;
export const hrefDaEquipe = (projetoId: string) => `/projetos/${projetoId}/cliente#atas`;

const avisosPadrao = (): DepsAvisos => ({
  notificar: (ids, n, o) => notificarMuitos(ids, n, o),
  enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null,
});

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

async function notificarSemFalhar(deps: DepsAvisos, ids: string[], n: Notificacao, categoria?: string): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    await deps.notificar(ids, n, categoria ? { categoria } : undefined);
    return ids.length;
  } catch (e) {
    console.error("[atas] sino falhou:", e);
    return 0;
  }
}

async function coordenacaoDoProjeto(projetoId: string): Promise<string[]> {
  const audiencia = new Set(await audienciaDoProjeto(projetoId));
  const membros = await prisma.projetoMembro.findMany({
    where: { projetoId, user: { ativo: true, tipo: "interno" } },
    select: { userId: true, papel: true },
  });
  const coordenadores = membros.filter((m) => ehPapelDeCoordenacao(m.papel) && audiencia.has(m.userId)).map((m) => m.userId);
  const globais =
    coordenadores.length > 0
      ? []
      : (await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } })).map((g) => g.id).filter((id) => audiencia.has(id));
  return destinatariosDaEquipe({ coordenadores, globais, autorId: "" });
}

async function reuniaoDaVersao(versaoId: string) {
  const v = await prisma.ataVersao.findUnique({ where: { id: versaoId }, select: { numero: true, reuniaoId: true, resposta: true, respondidaPorNome: true } });
  if (!v) return null;
  const r = await prisma.reuniaoProjeto.findUnique({ where: { id: v.reuniaoId }, select: { titulo: true, projetoId: true } });
  if (!r) return null;
  const projeto = await prisma.projeto.findUnique({ where: { id: r.projetoId }, select: { id: true, codigo: true, nome: true } });
  return projeto ? { v, r, projeto } : null;
}

export async function avisarPublicacao(versaoId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number; emails: number }> {
  const d = await reuniaoDaVersao(versaoId);
  if (!d) return { sinos: 0, emails: 0 };
  const contas = await contasDoClienteDoProjeto(d.projeto.id);
  const href = hrefDoCliente(d.projeto.id);
  const titulo = d.v.numero > 1 ? "Ata de reunião corrigida" : "Ata de reunião para você conferir";
  const sinos = await notificarSemFalhar(deps, contas.map((c) => c.userId), { titulo, corpo: `${d.r.titulo} — projeto ${d.projeto.nome}.`, href });
  let emails = 0;
  if (deps.enviarEmail) {
    const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
    for (const c of contas) {
      if (!c.email) continue;
      try {
        const ok = await deps.enviarEmail(c.email, "portal-ata-reuniao", {
          nome: primeiroNome(c.nome),
          titulo: d.r.titulo,
          projeto: d.projeto.nome,
          url: `${app}${href}`,
        });
        if (ok) emails += 1;
      } catch (e) {
        console.error("[atas] e-mail falhou:", e);
      }
    }
  }
  return { sinos, emails };
}

export async function avisarRespostaAta(versaoId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  const d = await reuniaoDaVersao(versaoId);
  if (!d || !d.v.resposta) return { sinos: 0 };
  return {
    sinos: await notificarSemFalhar(
      deps,
      await coordenacaoDoProjeto(d.projeto.id),
      {
        titulo: `Resposta à ata — ${formatarCodigo(d.projeto.codigo)}`,
        corpo: `${d.v.respondidaPorNome ?? "O cliente"}: ${ROTULO_RESPOSTA_ATA[d.v.resposta]} em "${d.r.titulo}".`,
        href: hrefDaEquipe(d.projeto.id),
      },
      CATEGORIA,
    ),
  };
}

async function dadosDaPendencia(pendenciaId: string) {
  const p = await prisma.pendenciaCliente.findUnique({ where: { id: pendenciaId }, select: { titulo: true, projetoId: true, feitaPorNome: true } });
  if (!p) return null;
  const projeto = await prisma.projeto.findUnique({ where: { id: p.projetoId }, select: { id: true, codigo: true, nome: true } });
  return projeto ? { p, projeto } : null;
}

export async function avisarPendenciaFeita(pendenciaId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  const d = await dadosDaPendencia(pendenciaId);
  if (!d) return { sinos: 0 };
  return {
    sinos: await notificarSemFalhar(
      deps,
      await coordenacaoDoProjeto(d.projeto.id),
      {
        titulo: `Pendência feita pelo cliente — ${formatarCodigo(d.projeto.codigo)}`,
        corpo: `${d.p.feitaPorNome ?? "O cliente"} marcou como feito: "${d.p.titulo}". Confira.`,
        href: hrefDaEquipe(d.projeto.id),
      },
      CATEGORIA,
    ),
  };
}

export async function avisarPendenciaReaberta(pendenciaId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  const d = await dadosDaPendencia(pendenciaId);
  if (!d) return { sinos: 0 };
  const contas = await contasDoClienteDoProjeto(d.projeto.id);
  return {
    sinos: await notificarSemFalhar(deps, contas.map((c) => c.userId), {
      titulo: "Pendência reaberta pela coordenação",
      corpo: `"${d.p.titulo}" — projeto ${d.projeto.nome}. Veja o motivo no portal.`,
      href: `/portal/${d.projeto.id}#pendencias`,
    }),
  };
}

/** Mesmo aviso que o módulo de Tarefas dá a um responsável novo. */
export async function avisarTarefasNovas(tarefas: readonly TarefaAvisada[], deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  let sinos = 0;
  for (const t of tarefas) {
    sinos += await notificarSemFalhar(deps, [t.responsavelId], { titulo: "Nova tarefa atribuída", corpo: t.titulo, href: "/tarefas", tag: `tarefa-${t.tarefaId}` });
  }
  return { sinos };
}
