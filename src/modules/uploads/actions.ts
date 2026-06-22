"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { PJ_ROLES, type Role } from "@/lib/roles";

const validarSchema = z.object({ disciplinaId: z.string().min(1) });

/**
 * REGRA DE OURO: valida a entrega da disciplina (exige pacotes configurados em exigePacoteA/B).
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
    // P-24: status "aprovado" só é alcançável por esta ação (P-11) → guarda de idempotência
    // mesmo quando a disciplina é 100% CLT (sem pagamento criado para o check acima cobrir).
    if (disciplina.status === "aprovado") {
      throw new ActionError("Esta entrega já foi validada.");
    }

    const temA = !disciplina.exigePacoteA || disciplina.uploads.some((u) => u.pacote === "A");
    const temB = !disciplina.exigePacoteB || disciplina.uploads.some((u) => u.pacote === "B");
    const faltam = [
      !temA ? "Pranchas e arquivos" : null,
      !temB ? "Backup do modelo" : null,
    ].filter(Boolean);
    if (faltam.length > 0) {
      throw new ActionError(`Envie os pacotes obrigatórios antes de validar: ${faltam.join(", ")}.`);
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
        // P-12: entregueEm marca a data da validação formal (separado do status manual).
        data: { status: "aprovado", entregueEm: agora },
      });
      for (let i = 0; i < disciplina.responsaveis.length; i++) {
        const r = disciplina.responsaveis[i];
        // P-24: salariados (CLT/estagiário) não recebem por entrega — seu custo já entra
        // na margem via ponto/rateio de horas. Pular evita a dupla contagem.
        if (!PJ_ROLES.includes(r.user.role as Role)) continue;
        // Sobra de centavos vai para o primeiro responsável.
        const valor = i === 0 ? Number((valorTotal - valorBase * (n - 1)).toFixed(2)) : valorBase;
        const pag = await tx.pagamentoProjetista.create({
          data: {
            disciplinaId: disciplina.id,
            projetistaId: r.userId,
            valor,
            tipoProfissional: r.user.role,
            status: "pendente",
            liberadoEm: agora,
          },
        });
        // Custo entra no financeiro como despesa PREVISTA já na liberação (pagar = confirmar).
        if (valor > 0) {
          const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
            pagamentoId: pag.id,
            valor,
            tipoProfissional: r.user.role,
            projetistaNome: r.user.name,
            disciplinaNome: disciplina.nome,
            projetoId: disciplina.projeto.id,
            projetoCodigo: disciplina.projeto.codigo,
            autorId: user.id,
            quando: agora,
          });
          await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
        }
      }
    });

    // Notifica projetistas (pagamento liberado) e gestores/financeiro.
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const pagaveis = disciplina.responsaveis.filter((r) => PJ_ROLES.includes(r.user.role as Role));
    const salariados = disciplina.responsaveis.filter((r) => !PJ_ROLES.includes(r.user.role as Role));
    if (pagaveis.length > 0) {
      await notificarMuitos(
        pagaveis.map((r) => r.userId),
        {
          titulo: "Pagamento liberado",
          corpo: `Entrega de ${disciplina.nome} (${codigo}) validada. Pagamento liberado.`,
          href,
          tag: `pagto-${disciplina.id}`,
        },
      );
    }
    if (salariados.length > 0) {
      // P-24: CLT/estagiário não recebem por entrega — apenas confirmamos a validação.
      await notificarMuitos(
        salariados.map((r) => r.userId),
        {
          titulo: "Entrega validada",
          corpo: `Entrega de ${disciplina.nome} (${codigo}) validada.`,
          href,
          tag: `entrega-${disciplina.id}`,
        },
      );
    }

    const gestores = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Entrega validada",
        corpo:
          pagaveis.length > 0
            ? `${disciplina.nome} (${codigo}) validada — pagamento de projetista criado.`
            : `${disciplina.nome} (${codigo}) validada — sem pagamento (equipe CLT/estágio).`,
        href,
        tag: `validacao-${disciplina.id}`,
      },
    );

    revalidatePath(href);
    revalidatePath("/planejamento/cronograma");
    revalidatePath("/");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/contas-a-pagar");
    return { disciplinaId: disciplina.id, pagamentos: pagaveis.length };
  },
);

// ── Aceite digital do cliente (N-43) ───────────────────────────

const gerarAceiteSchema = z.object({ uploadId: z.string().min(1) });

export const gerarAceiteCliente = defineAction(
  {
    modulo: "uploads",
    acao: "gerar-aceite-cliente",
    recurso: "uploads",
    permissao: "validar",
    entidade: "AceiteCliente",
    schema: gerarAceiteSchema,
    entidadeId: (d) => (d as { uploadId: string }).uploadId,
  },
  async (input, { user }) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { id: true, validado: true, disciplina: { select: { projetoId: true } } },
    });
    if (!upload) throw new ActionError("Entrega não encontrada.");
    if (!upload.validado) throw new ActionError("A entrega precisa ser validada antes de gerar o link de aceite.");

    const existing = await prisma.aceiteCliente.findUnique({ where: { uploadId: input.uploadId } });
    if (existing) return { token: existing.token };

    const token = randomBytes(24).toString("hex");
    const aceite = await prisma.aceiteCliente.create({
      data: { uploadId: input.uploadId, token, geradoPorId: user.id },
    });
    revalidatePath(`/projetos/${upload.disciplina.projetoId}`);
    return { token: aceite.token };
  },
);

