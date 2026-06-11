"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";

const validarSchema = z.object({ disciplinaId: z.string().min(1) });

/**
 * REGRA DE OURO: valida a entrega da disciplina (exige Pacote A e B).
 * Marca uploads como validados e LIBERA o pagamento ao(s) projetista(s),
 * criando um PagamentoProjetista pendente por responsável. Notifica todos.
 * Idempotente: recusa se já houver pagamentos liberados.
 */
export const validarEntrega = defineAction(
  {
    modulo: "uploads",
    acao: "validar-entrega",
    recurso: "uploads",
    permissao: "validar",
    entidade: "Disciplina",
    schema: validarSchema,
    entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId,
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: {
        responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
        uploads: true,
        pagamentos: { select: { id: true } },
        projeto: { select: { id: true, codigo: true, nome: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    if (disciplina.pagamentos.length > 0) {
      throw new ActionError("Esta entrega já foi validada e o pagamento já foi liberado.");
    }

    const temA = disciplina.uploads.some((u) => u.pacote === "A");
    const temB = disciplina.uploads.some((u) => u.pacote === "B");
    if (!temA || !temB) {
      throw new ActionError("Envie o Pacote A e o Pacote B antes de validar.");
    }
    if (disciplina.responsaveis.length === 0) {
      throw new ActionError("Defina ao menos um responsável antes de validar.");
    }

    const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
    const n = disciplina.responsaveis.length;
    const valorBase = Math.floor((valorTotal / n) * 100) / 100;

    const agora = new Date();
    const href = `/projetos/${disciplina.projeto.id}`;

    await prisma.$transaction(async (tx) => {
      await tx.upload.updateMany({
        where: { disciplinaId: disciplina.id, validado: false },
        data: { validado: true, validadoPorId: user.id, validadoEm: agora },
      });
      await tx.disciplina.update({
        where: { id: disciplina.id },
        data: { status: "aprovado" },
      });
      for (let i = 0; i < disciplina.responsaveis.length; i++) {
        const r = disciplina.responsaveis[i];
        // Sobra de centavos vai para o primeiro responsável.
        const valor = i === 0 ? Number((valorTotal - valorBase * (n - 1)).toFixed(2)) : valorBase;
        await tx.pagamentoProjetista.create({
          data: {
            disciplinaId: disciplina.id,
            projetistaId: r.userId,
            valor,
            tipoProfissional: r.user.role,
            status: "pendente",
            liberadoEm: agora,
          },
        });
      }
    });

    // Notifica projetistas (pagamento liberado) e gestores/financeiro.
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    await notificarMuitos(
      disciplina.responsaveis.map((r) => r.userId),
      {
        titulo: "Pagamento liberado",
        corpo: `Entrega de ${disciplina.nome} (${codigo}) validada. Pagamento liberado.`,
        href,
        tag: `pagto-${disciplina.id}`,
      },
    );

    const gestores = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Entrega validada",
        corpo: `${disciplina.nome} (${codigo}) validada — pagamento de projetista criado.`,
        href,
        tag: `validacao-${disciplina.id}`,
      },
    );

    revalidatePath(href);
    return { disciplinaId: disciplina.id, pagamentos: n };
  },
);
