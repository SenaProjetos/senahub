import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { textoPreenchimento } from "@/modules/inputs/portal-pedido";

/**
 * Aviso à equipe de que o cliente mexeu no formulário (briefing ou perguntas extras), pelo
 * link público ou pelo portal. O formulário salva sozinho a cada campo — sem trava, uma sessão de
 * preenchimento viraria dezenas de notificações.
 *
 * Trava: `BriefingProjeto.avisoEquipeEm` (uma por projeto, vale para os dois canais). Só notifica se a última notificação for
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
  // A linha do briefing pode não existir (só perguntas extras respondidas): garante antes do updateMany.
  await prisma.briefingProjeto.createMany({ data: [{ projetoId }], skipDuplicates: true });
  const { count } = await prisma.briefingProjeto.updateMany({
    where: forcar
      ? { projetoId }
      : { projetoId, OR: [{ avisoEquipeEm: null }, { avisoEquipeEm: { lt: corte } }] },
    data: { avisoEquipeEm: agora },
  });
  return count > 0;
}

/**
 * Notifica a gestão operacional. Nunca lança: o preenchimento do cliente não pode
 * falhar porque o aviso interno falhou.
 */
export async function notificarPreenchimentoInput(
  projetoId: string,
  motivo: Motivo,
  canal: "link" | "portal" = "link",
): Promise<void> {
  try {
    if (!(await reservar(projetoId, motivo === "completo"))) return;

    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { nome: true, codigo: true },
    });
    if (!projeto) return;

    const destinatarios = await prisma.user.findMany({
      where: whereAudiencia("gestao_operacional"),
      select: { id: true },
    });
    const { titulo, corpo } = textoPreenchimento({
      motivo,
      canal,
      projetoNome: projeto.nome,
      codigo: formatarCodigo(projeto.codigo),
    });

    await notificarMuitos(
      destinatarios.map((d) => d.id),
      {
        titulo,
        corpo,
        href: `/projetos/${projetoId}/inputs`,
        tag: `input-cliente-${projetoId}`,
      },
      { categoria: "input_cliente" },
    );
  } catch {
    // silencioso de propósito — ver docstring.
  }
}
