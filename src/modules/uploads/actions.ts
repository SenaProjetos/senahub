"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { PJ_ROLES, GLOBAL_ROLES, type Role } from "@/lib/roles";
import { statusValidacao } from "@/modules/uploads/validacao";

/** Extensão com o ponto, no case original (`.pdf`). Sem ponto (ou dotfile) → vazio. */
function extComPonto(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i) : "";
}

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
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: {
        responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
        // Lixeira: leitura aninhada não passa pelo filtro global → arquivos na lixeira
        // não contam para completude de pacote nem para validação.
        uploads: { where: { excluidoEm: null } },
        pagamentos: { select: { id: true } },
        projeto: { select: { id: true, codigo: true, nome: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    // P-24: status "aprovado" só é alcançável por esta ação (P-11) → guarda de idempotência
    // mesmo quando a disciplina é 100% CLT (sem pagamento criado para o check abaixo cobrir).
    if (disciplina.status === "aprovado") {
      throw new ActionError("Esta entrega já foi validada.");
    }
    // Reaprovação pós-revisão: se a disciplina voltou para "em_revisao" (apontamentos numa
    // entrega já validada), ela já tem pagamento. Reaprovar NÃO gera pagamento novo — a
    // validação financeira é mantida. Fora desse caso, pagamento existente = já validada.
    const emRevisao = disciplina.status === "em_revisao";
    const jaTemPagamento = disciplina.pagamentos.length > 0;
    if (jaTemPagamento && !emRevisao) {
      throw new ActionError("Esta entrega já foi validada e o pagamento já foi liberado.");
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

    // Validação parcial: só finaliza quando TODOS os entregáveis (versão atual) já
    // foram validados um a um. Os efeitos financeiros/conclusão vêm só aqui.
    const st = statusValidacao(disciplina.uploads, {
      exigePacoteA: disciplina.exigePacoteA,
      exigePacoteB: disciplina.exigePacoteB,
    });
    if (st.pendentes > 0) {
      throw new ActionError(
        `Valide todos os arquivos antes de finalizar: ${st.pendentes} pendente(s) de ${st.total}.`,
      );
    }

    const agora = new Date();
    const href = `/projetos/${disciplina.projeto.id}`;
    const codigoDisc = formatarCodigo(disciplina.projeto.codigo);

    // Reaprovação pós-revisão: fecha a revisão de volta para "aprovado" sem gerar pagamento.
    if (emRevisao && jaTemPagamento) {
      await prisma.disciplina.update({
        where: { id: disciplina.id },
        data: { status: "aprovado", entregueEm: agora },
      });
      const avisar = [
        ...disciplina.responsaveis.map((r) => r.userId),
        ...(await prisma.user.findMany({
          where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
          select: { id: true },
        })).map((g) => g.id),
      ];
      await notificarMuitos([...new Set(avisar)].filter((id) => id !== user.id), {
        titulo: "Revisão concluída",
        corpo: `Revisão de ${disciplina.nome} (${codigoDisc}) revalidada — sem novo pagamento.`,
        href,
        tag: `revalidacao-${disciplina.id}`,
      });
      revalidatePath(href);
      revalidatePath("/planejamento/cronograma");
      revalidatePath("/");
      return { disciplinaId: disciplina.id, pagamentos: 0 };
    }

    const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
    const n = disciplina.responsaveis.length;
    const valorBase = Math.floor((valorTotal / n) * 100) / 100;

    await prisma.$transaction(async (tx) => {
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

// ── Validação parcial (arquivo a arquivo) ──────────────────────

const uploadIdSchema = z.object({ uploadId: z.string().min(1) });
const ajusteSchema = z.object({
  uploadId: z.string().min(1),
  motivo: z.string().trim().min(1, "Descreva o ajuste necessário.").max(500),
});

const baseValidacao = {
  modulo: "uploads",
  recurso: "uploads",
  permissao: "validar",
  entidade: "Upload",
  // Correlação no histórico do projeto: o uploadId cai no conjunto de ids da disciplina.
  entidadeId: (d: unknown, i: unknown) =>
    (i as { uploadId?: string })?.uploadId ?? (d as { uploadId?: string } | undefined)?.uploadId,
} as const;

/** Carrega o upload + disciplina e recusa se a entrega já foi finalizada (status aprovado). */
async function carregarUploadEditavel(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      autorId: true,
      disciplinaId: true,
      disciplina: {
        select: {
          status: true,
          projetoId: true,
          nome: true,
          projeto: { select: { codigo: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!upload) throw new ActionError("Arquivo não encontrado.");
  if (upload.disciplina.status === "aprovado") {
    throw new ActionError("Entrega já finalizada — não é possível alterar a validação dos arquivos.");
  }
  return upload;
}

function revalidarArquivos(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

/** Valida um único arquivo (validação parcial). Limpa qualquer ajuste pendente nele. */
export const validarArquivo = defineAction(
  { ...baseValidacao, acao: "validar-arquivo", schema: uploadIdSchema },
  async (input, { user }) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: {
        validado: true,
        validadoPorId: user.id,
        validadoEm: new Date(),
        revisaoObs: null,
        revisaoEm: null,
        revisaoPorId: null,
      },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Desfaz a validação de um arquivo (antes de finalizar a entrega). */
export const reverterValidacaoArquivo = defineAction(
  { ...baseValidacao, acao: "reverter-validacao-arquivo", schema: uploadIdSchema },
  async (input) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: { validado: false, validadoPorId: null, validadoEm: null },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Solicita ajuste em um arquivo (com motivo) e notifica autor + responsáveis. */
export const solicitarAjusteArquivo = defineAction(
  { ...baseValidacao, acao: "solicitar-ajuste-arquivo", schema: ajusteSchema },
  async (input, { user }) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: {
        validado: false,
        validadoPorId: null,
        validadoEm: null,
        revisaoObs: input.motivo,
        revisaoEm: new Date(),
        revisaoPorId: user.id,
      },
    });

    const { disciplina } = upload;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const destinatarios = [upload.autorId, ...disciplina.responsaveis.map((r) => r.userId)]
      .filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(destinatarios, {
        titulo: "Ajuste solicitado em arquivo",
        corpo: `${upload.nomeArquivo} (${disciplina.nome} · ${codigo}): ${input.motivo}`,
        href: `/projetos/${disciplina.projetoId}/arquivos`,
        tag: `ajuste-${upload.id}`,
      });
    }

    revalidarArquivos(disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

// ── Renomear arquivo de disciplina (nome exibido) ──────────────

const renomearSchema = z.object({
  uploadId: z.string().min(1),
  nome: z.string().trim().min(1, "Informe o novo nome.").max(255),
});

/**
 * Renomeia o nome exibido de um upload (não altera o arquivo físico nem a versão).
 * A cadeia de versões é derivada por (disciplinaId, pacote, nomeArquivo) — sem FK —,
 * então renomeamos TODAS as versões do arquivo em bloco. Renomear só a versão atual
 * quebraria a cadeia: a versão renomeada viraria um "arquivo cópia" e o histórico
 * (versões anteriores) ficaria órfão sob o nome antigo.
 * Permitido ao responsável da disciplina ou perfil global. Auditado (de → para),
 * com `entidadeId = disciplinaId` para correlação no histórico do projeto.
 */
export const renomearUpload = defineAction(
  {
    modulo: "uploads",
    acao: "renomear-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: renomearSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({ where: { id: input.uploadId }, select: { nomeArquivo: true } }),
  },
  async (input, { user }) => {
    const up = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        pacote: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
      },
    });
    if (!up) throw new ActionError("Arquivo não encontrado.");

    const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
    const ehResp = up.disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!ehGlobal && !ehResp) throw new ActionError("Sem permissão para renomear este arquivo.");

    // A extensão do arquivo não pode ser alterada: força a extensão original,
    // trocando o que o cliente eventualmente tenha enviado (case-insensitive).
    const extOriginal = extComPonto(up.nomeArquivo);
    let nomeFinal = input.nome;
    if (extOriginal) {
      const extNova = extComPonto(nomeFinal);
      if (extNova.toLowerCase() !== extOriginal.toLowerCase()) {
        const base = extNova ? nomeFinal.slice(0, nomeFinal.length - extNova.length) : nomeFinal;
        nomeFinal = `${base}${extOriginal}`;
      }
    }
    if (!nomeFinal.trim() || nomeFinal.trim() === extOriginal) {
      throw new ActionError("Informe um nome antes da extensão.");
    }

    // Renomeia a cadeia inteira (todas as versões deste arquivo lógico), não só a
    // versão-alvo — assim o agrupamento por nome não se quebra e o histórico se mantém.
    // Sem filtro de excluidoEm: versões na lixeira também migram (nenhuma fica órfã
    // sob o nome antigo, o que reiniciaria a numeração num futuro re-upload).
    const { count } = await prisma.upload.updateMany({
      where: {
        disciplinaId: up.disciplinaId,
        pacote: up.pacote,
        nomeArquivo: up.nomeArquivo,
      },
      data: { nomeArquivo: nomeFinal },
    });
    revalidatePath(`/projetos/${up.disciplina.projetoId}/arquivos`);
    return { disciplinaId: up.disciplinaId, de: up.nomeArquivo, para: nomeFinal, versoes: count };
  },
);

// ── Lixeira do projeto: excluir / restaurar / purgar (só admin) ──

const excluirSchema = z.object({ uploadId: z.string().min(1) });

/** Gate comum: só admin mexe na lixeira. */
function exigirAdmin(role: string) {
  if (role !== "admin") {
    throw new ActionError("Apenas administradores podem gerir a lixeira do projeto.");
  }
}

/**
 * Manda um arquivo (Upload) para a LIXEIRA do projeto (soft delete). RESTRITO A ADMIN,
 * override total (mesmo entregas já validadas). Não apaga nada do disco — o arquivo some
 * das listagens/downloads (filtro `excluidoEm` em lib/prisma.ts + leituras aninhadas) e
 * pode ser restaurado por até `DIAS_LIXEIRA` dias, quando o job de purga o remove em
 * definitivo. Auditado (entidadeId = disciplinaId p/ correlação no histórico do projeto).
 */
export const excluirUpload = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, pacote: true, versao: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (upload.excluidoEm) throw new ActionError("Arquivo já está na lixeira.");

    await prisma.upload.update({
      where: { id: upload.id },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
  },
);

const excluirLoteSchema = z.object({
  projetoId: z.string().min(1),
  uploadIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um arquivo.").max(500),
});

/**
 * Move VÁRIOS arquivos (Upload) para a lixeira de uma vez (seleção múltipla no explorer).
 * Mesma regra do single: RESTRITO A ADMIN, soft delete (não apaga do disco), restaurável.
 * O escopo é travado ao `projetoId` informado — ids fora dele (ou já na lixeira) são
 * ignorados, não removidos. Auditado uma vez (entidadeId = projetoId → cai no histórico
 * do projeto). O `detalhe` guarda quantos/quais ids foram movidos.
 */
export const excluirUploadsLote = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivos-lote",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirLoteSchema,
    entidadeId: (d) => (d as { projetoId?: string } | undefined)?.projetoId,
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    // Só arquivos DESTE projeto e ainda fora da lixeira (escopo + idempotência).
    const uploads = await prisma.upload.findMany({
      where: {
        id: { in: input.uploadIds },
        excluidoEm: null,
        disciplina: { projetoId: input.projetoId },
      },
      select: { id: true },
    });
    if (uploads.length === 0) {
      throw new ActionError("Nenhum arquivo válido para mover à lixeira.");
    }

    await prisma.upload.updateMany({
      where: { id: { in: uploads.map((u) => u.id) } },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    revalidarArquivos(input.projetoId);
    return { total: uploads.length, ids: uploads.map((u) => u.id) };
  },
);

/**
 * Restaura um arquivo da lixeira (limpa `excluidoEm`). Só admin. Auditado.
 */
export const restaurarUpload = defineAction(
  {
    modulo: "uploads",
    acao: "restaurar-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, excluidoEm: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (!upload.excluidoEm) throw new ActionError("Este arquivo não está na lixeira.");

    await prisma.upload.update({
      where: { id: upload.id },
      data: { excluidoEm: null, excluidoPorId: null },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
  },
);

/**
 * Exclui EM DEFINITIVO um arquivo que já está na lixeira ("excluir agora" / esvaziar).
 * Só admin. Remove o registro (cascata: Pendencia/AceiteCliente/ConversaoModelo) e os
 * arquivos físicos (o próprio + o `.frag` da conversão IFC, se houver). Auditado.
 */
export const excluirUploadDefinitivo = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivo-definitivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, pacote: true, versao: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        caminho: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
        conversao: { select: { caminhoFrag: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (!upload.excluidoEm) {
      throw new ActionError("Só é possível excluir em definitivo arquivos que estão na lixeira.");
    }

    // Cascata (schema): remove Pendencia, AceiteCliente e ConversaoModelo vinculados.
    await prisma.upload.delete({ where: { id: upload.id } });
    await removerArquivo(upload.caminho);
    if (upload.conversao?.caminhoFrag) await removerArquivo(upload.conversao.caminhoFrag);

    revalidarArquivos(upload.disciplina.projetoId);
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
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
    entidadeId: (d, i) => ((d ?? i) as { uploadId: string }).uploadId,
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

