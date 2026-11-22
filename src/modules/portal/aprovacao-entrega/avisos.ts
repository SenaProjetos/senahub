import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { destinatariosDaEquipe, ehPapelDeCoordenacao } from "@/modules/portal/mensagens/audiencia";
import { audienciaDoProjeto, contasDoClienteDoProjeto } from "@/modules/portal/mensagens/service";
import { ROTULO_RESPOSTA, contaComoAceite } from "./regras";

/**
 * Avisos da aprovação formal da entrega — sempre DEPOIS do commit; uma falha aqui nunca desfaz a escrita.
 *
 * - Envio → cada conta ativa do cliente: sino (sem categoria) + e-mail `portal-aprovacao-entrega` (sem opção de
 *   desligar: é um pedido formal, como o de assinatura). Sem SMTP, só o sino.
 * - Resposta do cliente → coordenadores membros do projeto (sem nenhum, os de escopo global), dentro da audiência;
 *   categoria `aprovacao_entrega`. Resposta registrada por fora → ninguém da equipe (foi ela que registrou).
 * - Em pacote ligado a parcela: aceite (das duas origens) e anulação de um aceite → quem tem `financeiro:gerir`,
 *   categoria `aprovacao_entrega`.
 * - Anulação → contas ativas do cliente, só sino.
 * O autor da ação nunca recebe o próprio aviso.
 */

export type DepsAvisos = {
  notificar: (ids: string[], n: { titulo: string; corpo: string; href: string }, o?: { categoria: string }) => Promise<void>;
  enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
  gestoresFinanceiro: () => Promise<string[]>;
};

export const CATEGORIA = "aprovacao_entrega";
export const hrefDoCliente = (projetoId: string) => `/portal/${projetoId}#aprovacoes`;
export const hrefDaEquipe = (projetoId: string) => `/projetos/${projetoId}/cliente#aprovacoes`;
export const HREF_FINANCEIRO = "/financeiro/contas";

/** Quem gere o financeiro: só pessoa INTERNA ativa (o financeiro é só interno, `lib/so-interno.ts`). */
export async function gestoresDoFinanceiro(): Promise<string[]> {
  const gestores = await prisma.user.findMany({
    where: { AND: [wherePermissao("financeiro", "gerir"), { tipo: "interno", ativo: true }] },
    select: { id: true },
  });
  return gestores.map((u) => u.id);
}

const avisosPadrao = (): DepsAvisos => ({
  notificar: (ids, n, o) => notificarMuitos(ids, n, o),
  enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null,
  gestoresFinanceiro: gestoresDoFinanceiro,
});

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

async function notificarSemFalhar(deps: DepsAvisos, ids: string[], n: { titulo: string; corpo: string; href: string }, categoria?: string) {
  if (ids.length === 0) return 0;
  try {
    await deps.notificar(ids, n, categoria ? { categoria } : undefined);
    return ids.length;
  } catch (e) {
    console.error("[aprovacao-entrega] sino falhou:", e);
    return 0;
  }
}

/** Coordenadores membros do projeto dentro da audiência; sem nenhum, os de escopo global da audiência. */
async function equipeDoProjeto(projetoId: string, autorId: string): Promise<string[]> {
  const audiencia = new Set(await audienciaDoProjeto(projetoId));
  const membros = await prisma.projetoMembro.findMany({
    where: { projetoId, user: { ativo: true, tipo: "interno" } },
    select: { userId: true, papel: true },
  });
  const coordenadores = membros.filter((m) => ehPapelDeCoordenacao(m.papel) && audiencia.has(m.userId)).map((m) => m.userId);
  const globais =
    coordenadores.length > 0
      ? []
      : (await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } }))
          .map((g) => g.id)
          .filter((id) => audiencia.has(id));
  return destinatariosDaEquipe({ coordenadores, globais, autorId });
}

async function dadosDoPacote(aprovacaoId: string) {
  const a = await prisma.aprovacaoEntrega.findUnique({
    where: { id: aprovacaoId },
    select: { id: true, titulo: true, projetoId: true, parcelaId: true, enviadoPorId: true },
  });
  if (!a) return null;
  const projeto = await prisma.projeto.findUnique({ where: { id: a.projetoId }, select: { id: true, codigo: true, nome: true } });
  return projeto ? { a, projeto } : null;
}

export async function avisarEnvio(aprovacaoId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number; emails: number }> {
  const d = await dadosDoPacote(aprovacaoId);
  if (!d) return { sinos: 0, emails: 0 };
  const contas = await contasDoClienteDoProjeto(d.projeto.id);
  const href = hrefDoCliente(d.projeto.id);
  const sinos = await notificarSemFalhar(
    deps,
    contas.map((c) => c.userId),
    { titulo: "Entrega para sua aprovação", corpo: `${d.a.titulo} — projeto ${d.projeto.nome}.`, href },
  );
  let emails = 0;
  if (deps.enviarEmail) {
    const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
    for (const c of contas) {
      if (!c.email) continue;
      try {
        const ok = await deps.enviarEmail(c.email, "portal-aprovacao-entrega", {
          nome: primeiroNome(c.nome),
          titulo: d.a.titulo,
          projeto: d.projeto.nome,
          url: `${app}${href}`,
        });
        if (ok) emails += 1;
      } catch (e) {
        console.error("[aprovacao-entrega] e-mail falhou:", e);
      }
    }
  }
  return { sinos, emails };
}

export async function avisarResposta(respostaId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  const r = await prisma.respostaAprovacaoEntrega.findUnique({
    where: { id: respostaId },
    select: { aprovacaoId: true, resposta: true, origem: true, respondidoPorNome: true, registradoPorId: true },
  });
  if (!r) return { sinos: 0 };
  const d = await dadosDoPacote(r.aprovacaoId);
  if (!d) return { sinos: 0 };
  const rotulo = ROTULO_RESPOSTA[r.resposta];
  let sinos = 0;
  if (r.origem === "portal") {
    sinos += await notificarSemFalhar(
      deps,
      await equipeDoProjeto(d.projeto.id, ""),
      {
        titulo: `Resposta do cliente — ${formatarCodigo(d.projeto.codigo)}`,
        corpo: `${r.respondidoPorNome}: ${rotulo} em "${d.a.titulo}".`,
        href: hrefDaEquipe(d.projeto.id),
      },
      CATEGORIA,
    );
  }
  if (d.a.parcelaId && contaComoAceite(r.resposta)) {
    const gestores = (await deps.gestoresFinanceiro()).filter((id) => id !== r.registradoPorId);
    sinos += await notificarSemFalhar(
      deps,
      gestores,
      {
        titulo: "Aceite do cliente registrado",
        corpo: `${formatarCodigo(d.projeto.codigo)} — "${d.a.titulo}" (${rotulo}). A parcela ligada pode ser faturada.`,
        href: HREF_FINANCEIRO,
      },
      CATEGORIA,
    );
  }
  return { sinos };
}

export async function avisarAnulacao(respostaId: string, deps: DepsAvisos = avisosPadrao()): Promise<{ sinos: number }> {
  const r = await prisma.respostaAprovacaoEntrega.findUnique({
    where: { id: respostaId },
    select: { aprovacaoId: true, resposta: true, anuladaPorId: true },
  });
  if (!r) return { sinos: 0 };
  const d = await dadosDoPacote(r.aprovacaoId);
  if (!d) return { sinos: 0 };
  const contas = (await contasDoClienteDoProjeto(d.projeto.id)).map((c) => c.userId);
  let sinos = await notificarSemFalhar(deps, contas, {
    titulo: "Resposta anulada pela coordenação",
    corpo: `"${d.a.titulo}" — projeto ${d.projeto.nome}. Veja o motivo no portal.`,
    href: hrefDoCliente(d.projeto.id),
  });
  if (d.a.parcelaId && contaComoAceite(r.resposta)) {
    const gestores = (await deps.gestoresFinanceiro()).filter((id) => id !== r.anuladaPorId);
    sinos += await notificarSemFalhar(
      deps,
      gestores,
      {
        titulo: "Aceite do cliente anulado",
        corpo: `${formatarCodigo(d.projeto.codigo)} — "${d.a.titulo}". A parcela ligada voltou a aguardar o aceite.`,
        href: HREF_FINANCEIRO,
      },
      CATEGORIA,
    );
  }
  return { sinos };
}
