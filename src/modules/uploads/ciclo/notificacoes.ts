import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import { rotuloRevisao } from "@/lib/utils";
import type { TipoControle } from "./estados";
import type { ResultadoPublicacao, ResultadoTransicao } from "./service";
import type { AcaoCiclo } from "./transicoes";

/**
 * Notificações do ciclo documental (A6), DEPOIS do commit — nunca derrubam a ação (a transição já
 * aconteceu e está no histórico). Categoria `ciclo_documental`, que a pessoa pode desligar.
 *
 * Destinatários pela mesma regra do gate (`wherePermissao`), para ninguém receber aviso de algo que
 * não pode abrir:
 *  - coordenação = quem pode publicar (`arquivos:publicar`) e participa do projeto; sem ninguém, a gestão;
 *  - autor = quem enviou os arquivos da revisão e quem a criou;
 *  - equipe de obra = quem tem `arquivos:somente_liberado_obra` e é membro do projeto.
 */
const CATEGORIA = "ciclo_documental";

function href(r: Pick<ResultadoTransicao, "projetoId" | "disciplinaId">): string {
  return `/projetos/${r.projetoId}/arquivos?disciplinaId=${r.disciplinaId}`;
}

function participaDoProjeto(projetoId: string) {
  return {
    OR: [
      { projetosMembro: { some: { projetoId } } },
      { disciplinasResponsavel: { some: { disciplina: { projetoId } } } },
    ],
  };
}

async function coordenacao(projetoId: string): Promise<string[]> {
  const doProjeto = await prisma.user.findMany({
    // Superusuário entra só se participa do projeto — senão receberia aviso de todos os projetos.
    where: { ...wherePermissao("arquivos", "publicar"), ...participaDoProjeto(projetoId) },
    select: { id: true },
  });
  if (doProjeto.length > 0) return doProjeto.map((u) => u.id);
  const gestao = await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } });
  return gestao.map((u) => u.id);
}

async function equipeDeObra(projetoId: string): Promise<string[]> {
  // Superusuário passa em qualquer permissão, mas não é "equipe de obra": a restrição não vale para ele.
  const obra = await prisma.user.findMany({
    where: {
      ...wherePermissao("arquivos", "somente_liberado_obra"),
      superUsuario: false,
      role: { not: "admin" },
      projetosMembro: { some: { projetoId } },
    },
    select: { id: true },
  });
  return obra.map((u) => u.id);
}

async function seguro(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[ciclo-documental] notificação ${nome} falhou:`, err);
  }
}

const sem = (ids: string[], quem: string) => ids.filter((id) => id !== quem);

/** Enviar para análise → coordenação; devolver e arquivar → autor (A6, A8). */
export async function notificarTransicao(r: ResultadoTransicao, acao: AcaoCiclo, atorId: string, motivo?: string): Promise<void> {
  await seguro(acao, async () => {
    const rev = `${rotuloRevisao(r.numero)} de ${r.nome}`;
    if (acao === "enviar_analise") {
      await notificarMuitos(sem(await coordenacao(r.projetoId), atorId), { titulo: "Revisão para análise", corpo: `${rev} foi enviada para análise.`, href: href(r) }, { categoria: CATEGORIA });
    } else if (acao === "devolver") {
      await notificarMuitos(sem(r.autores, atorId), { titulo: "Revisão devolvida", corpo: `${rev} voltou para ajustes${motivo ? `: ${motivo}` : "."}`, href: href(r) }, { categoria: CATEGORIA });
    } else if (acao === "arquivar") {
      await notificarMuitos(sem(r.autores, atorId), { titulo: "Revisão arquivada", corpo: `${rev} foi arquivada${motivo ? `: ${motivo}` : "."}`, href: href(r) }, { categoria: CATEGORIA });
    }
  });
}

/** Publicar → autor; liberação ou revogação → equipe de obra; liberação barrada por restrição → coordenação (A2, A6). */
export async function notificarPublicacao(r: ResultadoPublicacao, atorId: string): Promise<void> {
  await seguro("publicar", async () => {
    const rev = `${rotuloRevisao(r.numero)} de ${r.nome}`;
    await notificarMuitos(sem(r.autores, atorId), { titulo: "Revisão publicada", corpo: `${rev} foi publicada.`, href: href(r) }, { categoria: CATEGORIA });

    const obra = await equipeDeObra(r.projetoId);
    if (r.liberacaoObra === "liberada") {
      await notificarMuitos(obra, { titulo: "Liberado para obra", corpo: `${rev} foi liberada para obra.`, href: href(r) }, { categoria: CATEGORIA });
    } else if (r.substituidas.some((s) => s.perdeuLiberacaoObra)) {
      const anterior = r.substituidas.find((s) => s.perdeuLiberacaoObra)!;
      await notificarMuitos(
        obra,
        { titulo: "Liberação para obra revogada", corpo: `A ${rotuloRevisao(anterior.numero)} de ${r.nome} foi substituída pela ${rotuloRevisao(r.numero)}, que ainda não foi liberada para obra.`, href: href(r) },
        { categoria: CATEGORIA },
      );
    }
    if (r.liberacaoObra === "restricao") {
      await notificarMuitos(
        [...new Set([...(await coordenacao(r.projetoId)), atorId])],
        { titulo: "Publicada sem liberação para obra", corpo: `${rev} foi publicada, mas não foi liberada para obra porque tem restrição ativa.`, href: href(r) },
        { categoria: CATEGORIA },
      );
    }
  });
}

/** Liberar para obra ou revogar à mão → equipe de obra. Os demais controles não avisam ninguém. */
export async function notificarControle(r: ResultadoTransicao & { tipo: TipoControle }, mudanca: "aplicado" | "removido", atorId: string, motivo?: string): Promise<void> {
  if (r.tipo !== "liberado_obra") return;
  await seguro(`controle-${mudanca}`, async () => {
    const rev = `${rotuloRevisao(r.numero)} de ${r.nome}`;
    const n = mudanca === "aplicado"
      ? { titulo: "Liberado para obra", corpo: `${rev} foi liberada para obra.` }
      : { titulo: "Liberação para obra revogada", corpo: `${rev} não está mais liberada para obra${motivo ? `: ${motivo}` : "."}` };
    await notificarMuitos(sem(await equipeDeObra(r.projetoId), atorId), { ...n, href: href(r) }, { categoria: CATEGORIA });
  });
}
