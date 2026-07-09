"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES, CLT_ROLES } from "@/lib/roles";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { calcularEncargos } from "@/lib/encargos";
import { faixasPorTipo, deducaoDependente } from "@/modules/rh/encargos/queries";
import { dependentesPorUsuario } from "@/modules/rh/funcionarios/queries";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const PATH = "/rh/folha";

const criarFolhaSchema = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
});

const itemSchema = z.object({
  rubricaId: z.string().optional().or(z.literal("")),
  descricao: z.string().min(1),
  tipo: z.enum(["provento", "desconto"]),
  valor: z.number().positive(),
});

const salvarHoleriteSchema = z.object({
  folhaId: z.string().min(1),
  userId: z.string().min(1),
  itens: z.array(itemSchema).min(1, "Adicione ao menos um item."),
});

const idSchema = z.object({ id: z.string().min(1) });

export const criarFolha = defineAction(
  { ...base, acao: "criar-folha", entidade: "FolhaPagamento", schema: criarFolhaSchema },
  async (i) => {
    const existe = await prisma.folhaPagamento.findUnique({
      where: { ano_mes: { ano: i.ano, mes: i.mes } },
    });
    if (existe) throw new ActionError("Folha deste mês já existe.");
    const folha = await prisma.folhaPagamento.create({ data: { ano: i.ano, mes: i.mes } });
    revalidatePath(PATH);
    return { id: folha.id };
  },
);

/** Gera holerites automaticamente p/ CLT/estagiário com salário base (INSS/IRRF + dependentes). */
export const gerarHoleritesAutomatico = defineAction(
  { ...base, acao: "gerar-holerites-auto", entidade: "FolhaPagamento", schema: idSchema },
  async (i) => {
    const folha = await prisma.folhaPagamento.findUnique({
      where: { id: i.id },
      include: { holerites: { select: { userId: true } } },
    });
    if (!folha) throw new ActionError("Folha não encontrada.");
    if (folha.status === "fechada") throw new ActionError("Folha fechada — reabra para gerar.");

    const jaTem = folha.holerites.map((h) => h.userId);
    const funcionarios = await prisma.user.findMany({
      where: { ativo: true, role: { in: CLT_ROLES }, salarioBase: { not: null }, id: { notIn: jaTem } },
      select: { id: true, salarioBase: true },
    });
    if (funcionarios.length === 0) {
      throw new ActionError("Nenhum funcionário com salário base pendente (cadastre em RH → Funcionários).");
    }

    const [{ inss, irrf }, dedDep, nDeps] = await Promise.all([
      faixasPorTipo(),
      deducaoDependente(),
      dependentesPorUsuario(funcionarios.map((f) => f.id)),
    ]);

    let criados = 0;
    for (const f of funcionarios) {
      const salario = Number(f.salarioBase);
      const enc = calcularEncargos(salario, inss, irrf, (nDeps[f.id] ?? 0) * dedDep);
      await prisma.holerite.create({
        data: {
          folhaId: folha.id,
          userId: f.id,
          itens: {
            create: [
              { descricao: "Salário base", tipo: "provento", valor: salario },
              ...(enc.inss > 0 ? [{ descricao: "INSS", tipo: "desconto" as const, valor: enc.inss }] : []),
              ...(enc.irrf > 0 ? [{ descricao: "IRRF", tipo: "desconto" as const, valor: enc.irrf }] : []),
            ],
          },
        },
      });
      criados++;
    }
    revalidatePath(`${PATH}/${folha.id}`);
    return { criados };
  },
);

/** Cria ou substitui o holerite de um colaborador na folha (itens inteiros). */
export const salvarHolerite = defineAction(
  { ...base, acao: "salvar-holerite", entidade: "Holerite", schema: salvarHoleriteSchema },
  async (i) => {
    const folha = await prisma.folhaPagamento.findUnique({ where: { id: i.folhaId } });
    if (!folha) throw new ActionError("Folha não encontrada.");
    if (folha.status === "fechada") throw new ActionError("Folha fechada — reabra para editar.");

    const holerite = await prisma.$transaction(async (tx) => {
      const h = await tx.holerite.upsert({
        where: { folhaId_userId: { folhaId: i.folhaId, userId: i.userId } },
        create: { folhaId: i.folhaId, userId: i.userId },
        update: {},
      });
      await tx.holeriteItem.deleteMany({ where: { holeriteId: h.id } });
      await tx.holeriteItem.createMany({
        data: i.itens.map((it) => ({
          holeriteId: h.id,
          rubricaId: it.rubricaId || null,
          descricao: it.descricao,
          tipo: it.tipo,
          valor: it.valor,
        })),
      });
      return h;
    });
    revalidatePath(`${PATH}/${i.folhaId}`);
    return { id: holerite.id };
  },
);

export const removerHolerite = defineAction(
  { ...base, acao: "remover-holerite", entidade: "Holerite", schema: idSchema },
  async (i) => {
    const h = await prisma.holerite.findUnique({ where: { id: i.id }, include: { folha: true } });
    if (!h) throw new ActionError("Holerite não encontrado.");
    if (h.folha.status === "fechada") throw new ActionError("Folha fechada.");
    await prisma.holerite.delete({ where: { id: i.id } });
    revalidatePath(`${PATH}/${h.folhaId}`);
    return { id: i.id };
  },
);

/**
 * Fecha a folha: total líquido vira Lançamento de despesa CONFIRMADO
 * na categoria 2.03 (Folha CLT) → entra no caixa e na DRE.
 */
export const fecharFolha = defineAction(
  { ...base, acao: "fechar-folha", entidade: "FolhaPagamento", schema: idSchema },
  async (i, { user }) => {
    const folha = await prisma.folhaPagamento.findUnique({
      where: { id: i.id },
      include: { holerites: { include: { itens: true } } },
    });
    if (!folha) throw new ActionError("Folha não encontrada.");
    if (folha.status === "fechada") throw new ActionError("Folha já fechada.");
    if (folha.holerites.length === 0) throw new ActionError("Adicione holerites antes de fechar.");

    let liquido = 0;
    for (const h of folha.holerites) {
      for (const it of h.itens) {
        liquido += it.tipo === "provento" ? Number(it.valor) : -Number(it.valor);
      }
    }
    if (liquido <= 0) throw new ActionError("Total líquido deve ser positivo.");

    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo: "2.03" } });
    if (!categoria) throw new ActionError("Categoria 2.03 (Folha CLT) ausente no plano de contas.");

    const agora = new Date();
    await prisma.$transaction(async (tx) => {
      const lanc = await tx.lancamento.create({
        data: {
          tipo: "despesa",
          descricao: `Folha CLT ${String(folha.mes).padStart(2, "0")}/${folha.ano}`,
          valor: liquido,
          status: "confirmado",
          data: agora,
          dataConfirmacao: agora,
          categoriaId: categoria.id,
          autorId: user.id,
        },
      });
      await tx.folhaPagamento.update({
        where: { id: folha.id },
        data: { status: "fechada", fechadaEm: agora, lancamentoId: lanc.id },
      });
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    revalidatePath("/financeiro/lancamentos");
    return { id: i.id, liquido };
  },
);

/** Reabre a folha: exclui o lançamento financeiro vinculado. */
export const reabrirFolha = defineAction(
  { ...base, acao: "reabrir-folha", entidade: "FolhaPagamento", schema: idSchema },
  async (i) => {
    const folha = await prisma.folhaPagamento.findUnique({ where: { id: i.id } });
    if (!folha) throw new ActionError("Folha não encontrada.");
    if (folha.status !== "fechada") throw new ActionError("Folha não está fechada.");

    await prisma.$transaction(async (tx) => {
      await tx.folhaPagamento.update({
        where: { id: i.id },
        data: { status: "aberta", fechadaEm: null, lancamentoId: null },
      });
      if (folha.lancamentoId) {
        await tx.lancamento.delete({ where: { id: folha.lancamentoId } }).catch(() => {});
      }
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    revalidatePath("/financeiro/lancamentos");
    return { id: i.id };
  },
);

/** Envia os holerites da folha por e-mail (exige SMTP configurado). */
export const enviarHolerites = defineAction(
  { ...base, acao: "enviar-holerites", entidade: "FolhaPagamento", schema: idSchema },
  async (i) => {
    if (!smtpConfigurado()) {
      throw new ActionError("SMTP não configurado (defina SMTP_HOST no .env).");
    }
    const folha = await prisma.folhaPagamento.findUnique({
      where: { id: i.id },
      include: {
        holerites: { include: { user: true, itens: true } },
      },
    });
    if (!folha) throw new ActionError("Folha não encontrada.");

    let enviados = 0;
    for (const h of folha.holerites) {
      const linhas = h.itens
        .map(
          (it) =>
            `| ${it.descricao} | ${it.tipo === "desconto" ? "-" : ""}R$ ${Number(it.valor).toFixed(2)} |`,
        )
        .join("\n");
      const liquido = h.itens.reduce(
        (s, it) => s + (it.tipo === "provento" ? Number(it.valor) : -Number(it.valor)),
        0,
      );
      const ok = await enviarEmailTemplate(h.user.email, "holerite", {
        competencia: `${String(folha.mes).padStart(2, "0")}/${folha.ano}`,
        // Documento formal: usa o nome completo de cadastro; cai no de exibição se vazio.
        nome: h.user.nomeCompleto?.trim() || h.user.name,
        linhas,
        liquido: `R$ ${liquido.toFixed(2)}`,
      });
      if (ok) {
        await prisma.holerite.update({ where: { id: h.id }, data: { enviadoEm: new Date() } });
        enviados++;
      }
    }
    revalidatePath(`${PATH}/${i.id}`);
    return { enviados, total: folha.holerites.length };
  },
);
