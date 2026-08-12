import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";

/**
 * Aviso à equipe de que o cliente mexeu no formulário público (briefing ou perguntas
 * extras). O formulário salva sozinho a cada campo — sem trava, uma sessão de
 * preenchimento viraria dezenas de notificações.
 *
 * Trava: `LinkPublicoInput.notificadoEm`. Só notifica se a última notificação for
 * mais velha que `JANELA_MS`, e a checagem é o próprio `updateMany` condicional —
 * com dois autosaves concorrentes, apenas um `count` volta 1 e notifica.
 *
 * Exceção: a **transição** para briefing completo fura a janela (é o evento que a
 * equipe espera). Quem decide se houve transição é o chamador — passar "completo"
 * em todo save de um briefing já completo notificaria a cada tecla.
 */
const JANELA_MS = 6 * 60 * 60 * 1000; // 6 h

type Motivo = "parcial" | "completo";

/** Reserva o direito de notificar (retorna false se outro save já notificou na janela). */
async function reservar(projetoId: string, forcar: boolean): Promise<boolean> {
  const agora = new Date();
  const corte = new Date(agora.getTime() - JANELA_MS);
  const { count } = await prisma.linkPublicoInput.updateMany({
    where: forcar
      ? { projetoId }
      : { projetoId, OR: [{ notificadoEm: null }, { notificadoEm: { lt: corte } }] },
    data: { notificadoEm: agora },
  });
  return count > 0;
}

/**
 * Notifica a gestão operacional. Nunca lança: o preenchimento do cliente não pode
 * falhar porque o aviso interno falhou.
 */
export async function notificarPreenchimentoInput(projetoId: string, motivo: Motivo): Promise<void> {
  try {
    const concluido = motivo === "completo";
    if (!(await reservar(projetoId, concluido))) return;

    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { nome: true, codigo: true },
    });
    if (!projeto) return;

    const destinatarios = await prisma.user.findMany({
      where: whereAudiencia("gestao_operacional"),
      select: { id: true },
    });
    const codigo = formatarCodigo(projeto.codigo);

    await notificarMuitos(
      destinatarios.map((d) => d.id),
      {
        titulo: concluido ? "Formulário do cliente concluído" : "Cliente preencheu o formulário",
        corpo: concluido
          ? `${projeto.nome} (${codigo}) — briefing completo pelo link público.`
          : `${projeto.nome} (${codigo}) — novas respostas pelo link público.`,
        href: `/projetos/${projetoId}/inputs`,
        tag: `input-cliente-${projetoId}`,
      },
      { categoria: "input_cliente" },
    );
  } catch {
    // silencioso de propósito — ver docstring.
  }
}
