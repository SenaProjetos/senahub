"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
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

/**
 * Gera holerites automaticamente p/ **CLT** com salário base (INSS/IRRF + dependentes).
 *
 * Estagiário está FORA de propósito: não é segurado obrigatório do RGPS (Lei 11.788, arts. 12 e 15),
 * logo não há desconto de INSS sobre bolsa-auxílio — e `calcularEncargos` é pura, não recebe perfil
 * e não tem como distinguir. Até o recibo de bolsa-auxílio existir como documento próprio, o RH
 * lança a bolsa do estagiário à mão (`salvarHolerite`).
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§4a)
 */
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
      where: { ativo: true, role: "clt", salarioBase: { not: null }, id: { notIn: jaTem } },
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

    const assinaturasRevogadas = await prisma.$transaction(async (tx) => {
      await tx.folhaPagamento.update({
        where: { id: i.id },
        data: { status: "aberta", fechadaEm: null, lancamentoId: null },
      });
      if (folha.lancamentoId) {
        await tx.lancamento.delete({ where: { id: folha.lancamentoId } }).catch(() => {});
      }
      // Reabrir libera `salvarHolerite`/`removerHolerite` de novo (recusam com folha fechada) —
      // quem já tinha assinado assinou um conjunto de itens que pode não ser mais o que fica
      // gravado. Sem isto, o PDF mostraria "assinado" sobre itens potencialmente diferentes dos
      // que a pessoa leu (mesma garantia que o recibo de produção dá com o hash do texto — aqui
      // o holerite não tem texto fixo, então a garantia é esta).
      const r = await tx.holerite.updateMany({
        where: { folhaId: i.id, assinadoEm: { not: null } },
        data: { assinadoEm: null, assinanteId: null },
      });
      return r.count;
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    revalidatePath("/financeiro/lancamentos");
    return { id: i.id, assinaturasRevogadas };
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

// ── Import do PDF do contador (plano 2026-09-13-folha-clt-import-assinatura.md, P2) ──────────
// O import em si é a rota multipart `/api/rh/folha/importar`. As duas actions abaixo resolvem as
// pendências que ele levanta: código de rubrica e matrícula que o cadastro ainda não conhece.
// Mapeamento é feito UMA vez por código/pessoa — do mês seguinte em diante o import passa direto.

const vincularRubricaSchema = z
  .object({
    codigoExterno: z.string().regex(/^\d{3}$/, "Código do contador tem 3 dígitos."),
    /** Vincular a uma rubrica que já existe… */
    rubricaId: z.string().optional(),
    /** …ou criar uma nova com este nome/tipo. */
    nome: z.string().min(2).optional(),
    tipo: z.enum(["provento", "desconto"]).optional(),
  })
  .refine((d) => Boolean(d.rubricaId) !== Boolean(d.nome && d.tipo), {
    message: "Escolha uma rubrica existente OU informe nome e tipo da nova.",
  });

export const vincularRubricaExterna = defineAction(
  { ...base, acao: "vincular-rubrica-externa", entidade: "RubricaFolha", schema: vincularRubricaSchema },
  async (i) => {
    // Vínculo errado tem que ter volta: se o RH apontar o código pra rubrica errada, o import
    // recusa depois (a classificação não reproduz os totais do PDF) e ele precisa corrigir. Por
    // isso o código MUDA de rubrica em vez de dar erro de "já vinculado" — recusar deixaria o
    // código preso na rubrica errada, sem saída pela tela.
    //
    // Trocar o vínculo é seguro para o histórico: `HoleriteItem` guarda `tipo` e `descricao`
    // próprios, copiados na gravação, e `fecharFolha` soma por `item.tipo` — holerite antigo
    // não muda de sentido por causa disto (confirmado no schema e em `fecharFolha`).
    const anterior = await prisma.rubricaFolha.findUnique({
      where: { codigoExterno: i.codigoExterno },
      select: { id: true, nome: true },
    });

    const rubrica = await prisma.$transaction(async (tx) => {
      if (anterior && anterior.id !== i.rubricaId) {
        await tx.rubricaFolha.update({ where: { id: anterior.id }, data: { codigoExterno: null } });
      }
      if (i.rubricaId) {
        return tx.rubricaFolha.update({
          where: { id: i.rubricaId },
          data: { codigoExterno: i.codigoExterno },
          select: { id: true, nome: true },
        });
      }
      return tx.rubricaFolha.create({
        data: { nome: i.nome!, tipo: i.tipo!, codigoExterno: i.codigoExterno },
        select: { id: true, nome: true },
      });
    });

    revalidatePath(PATH);
    return { id: rubrica.id, nome: rubrica.nome, desvinculadaDe: anterior?.nome ?? null };
  },
);

const vincularMatriculaSchema = z.object({
  matriculaExterna: z.string().min(1),
  userId: z.string().min(1),
});

export const vincularMatriculaExterna = defineAction(
  { ...base, acao: "vincular-matricula-externa", entidade: "User", schema: vincularMatriculaSchema },
  async (i) => {
    // Mesma razão do vínculo de rubrica: apontar a matrícula pra pessoa errada precisa ter
    // conserto pela tela. A matrícula é de UMA pessoa só (unique no banco), então corrigir é
    // movê-la — o vínculo antigo cai, e a troca fica no AuditLog pelo `defineAction`.
    const anterior = await prisma.user.findUnique({
      where: { matriculaFolhaExterna: i.matriculaExterna },
      select: { id: true, name: true },
    });

    const user = await prisma.$transaction(async (tx) => {
      if (anterior && anterior.id !== i.userId) {
        await tx.user.update({ where: { id: anterior.id }, data: { matriculaFolhaExterna: null } });
      }
      return tx.user.update({
        where: { id: i.userId },
        data: { matriculaFolhaExterna: i.matriculaExterna },
        select: { id: true, name: true },
      });
    });

    revalidatePath(PATH);
    return { id: user.id, nome: user.name, desvinculadaDe: anterior && anterior.id !== i.userId ? anterior.name : null };
  },
);

// ── Assinatura do holerite (P3 — espelha `assinarRecibo`, G5 da Produção) ─────────────────────

const assinarHoleriteSchema = z.object({ id: z.string().min(1) });

/**
 * Assinatura eletrônica do funcionário, dentro do sistema. Não trava o pagamento (a folha já
 * fechou antes disso existir) — mas é obrigatória a médio prazo via o gate de acesso
 * (`precisaAssinarHolerite`, P4), não por bloquear nada aqui.
 */
export const assinarHolerite = defineAction(
  {
    modulo: "rh",
    acao: "assinar-holerite",
    entidade: "Holerite",
    schema: assinarHoleriteSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const holerite = await prisma.holerite.findUnique({
      where: { id: i.id },
      select: { id: true, userId: true, assinadoEm: true, folha: { select: { status: true } } },
    });
    if (!holerite) throw new ActionError("Holerite não encontrado.");
    if (holerite.userId !== user.id) throw new ActionError("Só o próprio funcionário assina o holerite dele.");
    if (holerite.folha.status !== "fechada") {
      throw new ActionError("Este holerite ainda não foi fechado — nada para assinar.");
    }
    if (holerite.assinadoEm) throw new ActionError("Este holerite já foi assinado.");

    // `assinadoEm: null` na condição: dois cliques simultâneos não geram duas assinaturas.
    const assinado = await prisma.holerite.updateMany({
      where: { id: holerite.id, assinadoEm: null },
      data: { assinadoEm: new Date(), assinanteId: user.id },
    });
    if (assinado.count === 0) throw new ActionError("Este holerite já foi assinado.");

    revalidatePath("/minha-ficha");
    revalidatePath(`${PATH}`);
    return { id: holerite.id };
  },
);
