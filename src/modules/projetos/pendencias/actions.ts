"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { removerArquivo } from "@/lib/storage";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  rotuloItemPendencia,
  podeTransicionar,
  type PapeisPendencia,
  type StatusPendencia,
  mencionadosNovos,
  resolverMencionados,
  SEVERIDADES,
  STATUS_ABERTOS,
  TIPOS_PENDENCIA,
} from "@/modules/projetos/pendencias/helpers";
import { TIPOS_MARCACAO } from "@/modules/projetos/pendencias/marcacao";
import { MODOS_CALIBRACAO } from "@/modules/projetos/pendencias/medicao";
import { extrairMencoes } from "@/modules/chat/mencoes";
import { buscarPendenciasParaReferencia, possiveisReincidencias } from "@/modules/projetos/pendencias/queries";

// ── Schemas ────────────────────────────────────────────────────
// Classificação (item 11) é OPCIONAL: exigir severidade/tipo em todo pino transformaria o
// clique-e-descreve (interação mais quente do viewer) num formulário. Não classificado é um
// estado legítimo — a UI mostra "—" e a lista manda pro fim.
const classificacaoSchema = {
  severidade: z.enum(SEVERIDADES).nullish(),
  tipo: z.enum(TIPOS_PENDENCIA).nullish(),
};
const criarSchema = z.object({
  uploadId: z.string().min(1),
  pagina: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  texto: z.string().trim().min(1, "Descreva a pendência.").max(1000),
  ...classificacaoSchema,
  /** Prazo do apontamento (item 18) — data ISO (AAAA-MM-DD). Opcional. */
  prazo: z.string().trim().min(1).max(10).nullish(),
  // Marcação vetorial (item 9). Só o cliente sabe o que foi desenhado; `x`/`y` acima continuam
  // sendo a âncora (início do arrasto) e os pontos são OFFSETS a partir dela. Ausente = pino.
  marcacao: z
    .object({
      tipo: z.enum(TIPOS_MARCACAO),
      pontos: z.array(z.object({ dx: z.number().min(-1).max(1), dy: z.number().min(-1).max(1) })).max(2),
    })
    .nullish(),
  // Medição (item 28) — valor CONGELADO no momento da criação, junto do fator e do modo que
  // o produziram. Só o cliente sabe as dimensões visuais em pontos da página, então o cálculo
  // nasce lá; guardar o fator é o que permite explicar a medida depois de uma recalibração.
  medida: z
    .object({
      mm: z.number().positive().finite(),
      fator: z.number().positive().finite(),
      modo: z.enum(MODOS_CALIBRACAO),
    })
    .nullish(),
  // Âncora textual (item 3): o cliente monta a partir do texto da página, porque só ele tem
  // o PDF renderizado. Opcional — prancha sem texto perto do clique simplesmente não manda.
  ancora: z
    .object({
      texto: z.string().min(1).max(300),
      offset: z.number().int().min(0),
      dx: z.number().min(-1).max(1),
      dy: z.number().min(-1).max(1),
    })
    .nullish(),
});
const editarSchema = z.object({
  id: z.string().min(1),
  texto: z.string().trim().min(1, "Descreva a pendência.").max(1000),
  ...classificacaoSchema,
});
/** Reclassificar não é "editar": vale mesmo depois de enviada como tarefa (ver `classificarPendencia`). */
const classificarPendenciaSchema = z.object({
  id: z.string().min(1),
  ...classificacaoSchema,
  /** Ajustar o prazo entra na triagem, junto de severidade/tipo (item 18). */
  prazo: z.string().trim().max(10).nullish(),
});
/** "Não procede" exige justificativa (item 22) — validado aqui, não por NOT NULL na coluna. */
const descartarSchema = z.object({
  id: z.string().min(1),
  justificativa: z.string().trim().min(3, "Explique por que o apontamento não procede.").max(1000),
});
const responderSchema = z.object({
  id: z.string().min(1),
  texto: z.string().trim().min(1, "Escreva uma resposta.").max(2000),
});
/**
 * Link anexado ao apontamento (item 12). A URL vira `href` na tela, então o esquema é preso a
 * http/https: `z.string().url()` sozinho aceita `javascript:` e `data:`, que num `href` são
 * vetor de XSS — não é validação cosmética.
 */
const anexarLinkSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().max(120).optional(),
  url: z
    .string()
    .trim()
    .min(1, "Informe o endereço do link.")
    .max(2000)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "O link precisa começar com http:// ou https://"),
});
/**
 * Calibração de escala de uma página (item 28). O cliente manda o `mmPorPonto` já resolvido
 * porque só ele tem o viewport do pdf.js (as dimensões VISUAIS em pontos, com `/Rotate`
 * aplicado) — o servidor teria que reabrir o PDF só pra recalcular o que a tela já sabe.
 * O modo e o denominador vêm junto pra a calibração ser explicável depois.
 */
const calibrarSchema = z
  .object({
    uploadId: z.string().min(1),
    pagina: z.number().int().min(1),
    modo: z.enum(MODOS_CALIBRACAO),
    escalaDenominador: z.number().positive().max(100000).nullish(),
    mmPorPonto: z.number().positive().finite(),
  })
  .refine((v) => v.modo !== "escala" || (v.escalaDenominador ?? 0) > 0, {
    message: "Informe a escala da prancha.",
    path: ["escalaDenominador"],
  });

const replicarSchema = z.object({
  id: z.string().min(1),
  uploadIds: z.array(z.string().min(1)).min(1).max(30),
});
const idSchema = z.object({ id: z.string().min(1) });
// Envio dos apontamentos = criação da tarefa. Campos opcionais vêm da janela de confirmação
// (TarefaDialog); quando ausentes, caem nos defaults. O checklist é SEMPRE as pendências
// (montado no servidor), garantindo o vínculo pendência↔item.
const enviarSchema = z.object({
  uploadId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  statusId: z.string().optional(),
  prazo: z.string().optional(),
  prioridade: z.string().optional(),
  responsaveisIds: z.array(z.string()).optional(),
  dependeDeIds: z.array(z.string()).optional(),
});

// Gate de validador interno (aponta/fecha/descarta): permissão `uploads:validar`.
const baseValidador = { modulo: "uploads", recurso: "uploads", permissao: "validar", entidade: "Pendencia" } as const;
// Gate de projetista (resolve/reabre): só exige acesso ao projeto; o vínculo fino
// (responsável da disciplina) é checado no handler.
const baseProjetista = { modulo: "uploads", recurso: "projetos", permissao: "ver", entidade: "Pendencia" } as const;

/**
 * Categoria de opt-out das notificações de apontamento (chave `notif_apontamento` em
 * `UserPreference`, ver `modules/usuarios/preferencias`). Cobre menção (item 33) e resposta
 * na thread (item 39) — os dois são "alguém falou com você num apontamento". O envio da
 * rodada (`enviarApontamentos`) fica FORA: é trabalho atribuído, não conversa, e silenciar
 * isso esconderia demanda de trabalho.
 */
const CATEGORIA_APONTAMENTO = "apontamento";

/** Perfil global (admin/supervisor) — override de escrita. NÃO usa ehSocio (piso só de leitura). */
function ehGlobal(user: { role: string }) {
  return user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
}

function revalidarViewer(projetoId: string, uploadId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
  revalidatePath(`/projetos/${projetoId}/arquivos/${uploadId}/visualizar`);
}

/** Carrega o upload + contexto da disciplina; recusa se a entrega já foi finalizada. */
async function carregarUploadParaApontar(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      pacote: true,
      versao: true,
      autorId: true,
      documentoId: true,
      disciplinaId: true,
      disciplina: {
        select: {
          status: true,
          projetoId: true,
          disciplinaTextoLegado: true,
          projeto: { select: { codigo: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!upload) throw new ActionError("Arquivo não encontrado.");
  // Disciplina já validada não bloqueia mais: apontar numa entrega aprovada abre revisão
  // (mantém a validação financeira) — tratado em enviarApontamentos.
  return upload;
}

/**
 * Quem é candidato a ser @mencionado num apontamento desta prancha — o mesmo universo que já
 * recebe notificação em `enviarApontamentos` (responsáveis da disciplina + autor do upload),
 * não todo usuário do sistema. Evita expor um "buscar qualquer pessoa" onde não faz sentido.
 */
async function candidatosMencao(disciplinaId: string, autorUploadId: string) {
  const ids = [
    ...new Set(
      (
        await prisma.disciplinaResponsavel.findMany({ where: { disciplinaId }, select: { userId: true } })
      )
        .map((r) => r.userId)
        .concat(autorUploadId),
    ),
  ];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return users.map((u) => ({ userId: u.id, nome: u.name }));
}

/** Notifica quem foi @mencionado (item 33) — não interrompe a ação se a notificação falhar. */
async function notificarMencionados(
  mencionados: { userId: string; nome: string }[],
  quemMencionou: string,
  numero: number,
  texto: string,
  projetoId: string,
) {
  const destino = mencionados.filter((m) => m.userId !== quemMencionou).map((m) => m.userId);
  if (destino.length === 0) return;
  await notificarMuitos(
    destino,
    {
      titulo: `Você foi mencionado no apontamento #${numero}`,
      corpo: texto,
      href: `/projetos/${projetoId}`,
      tag: `pendencia-mencao-${numero}`,
    },
    { categoria: CATEGORIA_APONTAMENTO },
  ).catch((err) => console.error("[pendencias] falha ao notificar menção:", err));
}

/**
 * Gate de PARTICIPANTE do apontamento: autor dele, responsável da disciplina, ou perfil
 * global. Mais largo que o gate de quem aponta (`uploads:validar`) de propósito — quem
 * responde na thread (item 39) e quem junta evidência (anexos, item 12) inclui o projetista,
 * que é justamente o outro lado da conversa. Cliente não passa: nunca é autor (criar exige
 * `uploads:validar`) nem responsável de disciplina.
 */
async function exigirParticipante(p: { autorId: string; disciplinaId: string }, user: SessionUser) {
  if (p.autorId === user.id) return;
  await exigirResponsavelOuGlobal(p.disciplinaId, user);
}

/** Exige que o usuário seja responsável da disciplina (ou perfil global). */
async function exigirResponsavelOuGlobal(disciplinaId: string, user: SessionUser) {
  if (ehGlobal(user)) return;
  const resp = await prisma.disciplinaResponsavel.findFirst({
    where: { disciplinaId, userId: user.id },
    select: { id: true },
  });
  if (!resp) throw new ActionError("Só um responsável da disciplina pode alterar esta pendência.");
}

// ── Apontamentos (validador) ───────────────────────────────────

/** Crava um apontamento posicional na prancha. Numeração sequencial por prancha/rodada (uploadId). */
export const criarPendencia = defineAction(
  { ...baseValidador, acao: "criar-pendencia", schema: criarSchema, entidadeId: (_d, i) => i.uploadId },
  async (input, { user }) => {
    const upload = await carregarUploadParaApontar(input.uploadId);
    // Só a versão vigente recebe pinos novos (apontar em versão obsoleta não faz sentido).
    // Escopo é o DOCUMENTO: a tripla (disciplina, pacote, nome) usada antes casava arquivos
    // de MESMO nome em pastas DIFERENTES da disciplina (com `pastaId` preenchido o `pacote` é
    // null, então a comparação `pacote: null` colidia entre pastas) e podia recusar um pino
    // válido alegando "existe versão mais recente". Fallback pela tripla só para linha legada
    // sem pai. Mesma correção já feita em `renomearUpload`.
    const maisNova = await prisma.upload.findFirst({
      where: {
        ...(upload.documentoId
          ? { documentoId: upload.documentoId }
          : { disciplinaId: upload.disciplinaId, pacote: upload.pacote, nomeArquivo: upload.nomeArquivo }),
        versao: { gt: upload.versao },
      },
      select: { id: true },
    });
    if (maisNova) throw new ActionError("Existe versão mais recente deste arquivo — aponte na versão atual.");

    const pend = await prisma.$transaction(async (tx) => {
      // Numeração por DOCUMENTO (não por versão): o número acompanha o apontamento através
      // das revisões. Escopar por `uploadId` reiniciaria a contagem a cada versão nova e
      // criaria dois "#1" dentro do mesmo documento. Fallback p/ uploadId cobre linha
      // legada sem pai (documentoId nulo).
      const escopoNumero = upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id };
      const max = await tx.pendencia.aggregate({ where: escopoNumero, _max: { numero: true } });
      return tx.pendencia.create({
        data: {
          uploadId: upload.id,
          documentoId: upload.documentoId,
          disciplinaId: upload.disciplinaId,
          projetoId: upload.disciplina.projetoId,
          numero: (max._max.numero ?? 0) + 1,
          pagina: input.pagina,
          x: input.x,
          y: input.y,
          texto: input.texto,
          status: "aberta",
          autorId: user.id,
          ancoraTexto: input.ancora?.texto ?? null,
          ancoraOffset: input.ancora?.offset ?? null,
          ancoraDx: input.ancora?.dx ?? null,
          ancoraDy: input.ancora?.dy ?? null,
          severidade: input.severidade ?? null,
          tipo: input.tipo ?? null,
          prazo: input.prazo ? new Date(`${input.prazo}T12:00:00`) : null,
          // Pino simples não grava geometria — `null` mantém a linha idêntica à de antes do item 9.
          marcacaoTipo: input.marcacao && input.marcacao.tipo !== "ponto" ? input.marcacao.tipo : null,
          marcacaoGeo:
            input.marcacao && input.marcacao.tipo !== "ponto" ? { pontos: input.marcacao.pontos } : undefined,
          medidaMm: input.medida?.mm ?? null,
          medidaFator: input.medida?.fator ?? null,
          medidaModo: input.medida?.modo ?? null,
        },
      });
    });
    revalidarViewer(upload.disciplina.projetoId, upload.id);
    // Só consulta candidatos quando o texto realmente tem "@algumacoisa" — criar pendência é
    // a interação mais quente do viewer, e a esmagadora maioria dos textos não menciona ninguém.
    if (extrairMencoes(input.texto).length > 0) {
      const candidatos = await candidatosMencao(upload.disciplinaId, upload.autorId);
      await notificarMencionados(
        resolverMencionados(input.texto, candidatos),
        user.id,
        pend.numero,
        input.texto,
        upload.disciplina.projetoId,
      );
    }
    return { id: pend.id, numero: pend.numero, uploadId: upload.id };
  },
);

/** Edita o texto de um apontamento (autor, enquanto aberto e sem tarefa). */
export const editarPendencia = defineAction(
  { ...baseValidador, acao: "editar-pendencia", schema: editarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({
      where: { id: input.id },
      include: { upload: { select: { autorId: true } } },
    });
    if (!p || p.excluidoEm) throw new ActionError("Pendência não encontrada.");
    if (p.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode editá-lo.");
    if (p.tarefaId) throw new ActionError("Pendência já enviada como tarefa — não pode ser editada.");
    if (p.status !== "aberta") throw new ActionError("Só pendências abertas podem ser editadas.");
    await prisma.pendencia.update({
      where: { id: p.id },
      data: { texto: input.texto, severidade: input.severidade ?? null, tipo: input.tipo ?? null },
    });
    revalidarViewer(p.projetoId, p.uploadId);
    if (extrairMencoes(input.texto).length > 0) {
      const candidatos = await candidatosMencao(p.disciplinaId, p.upload.autorId);
      await notificarMencionados(mencionadosNovos(p.texto, input.texto, candidatos), user.id, p.numero, input.texto, p.projetoId);
    }
    return { id: p.id, projetoId: p.projetoId };
  },
);

/**
 * Reclassifica um apontamento (item 11) — severidade/tipo, sem tocar no texto.
 *
 * Separado de `editarPendencia` de propósito: editar texto é privilégio do AUTOR e só
 * enquanto o apontamento está aberto e sem tarefa (senão o item de checklist já enviado
 * passaria a descrever outra coisa). Reclassificar não tem esse problema — o texto continua
 * o mesmo — e é justamente depois do envio que a triagem costuma acontecer ("isso aqui é
 * impeditivo, segura a aprovação"). Gate: quem valida (`uploads:validar`), como o resto da
 * triagem. Só recusa em estado terminal, onde reclassificar não muda mais nada.
 */
export const classificarPendencia = defineAction(
  {
    ...baseValidador,
    acao: "classificar-pendencia",
    schema: classificarPendenciaSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
    capturarAntes: async (input) =>
      prisma.pendencia.findUnique({ where: { id: input.id }, select: { severidade: true, tipo: true } }),
  },
  async (input) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.excluidoEm) throw new ActionError("Pendência excluída.");
    if (p.status === "fechada" || p.status === "descartada") {
      throw new ActionError("Pendência já encerrada — não pode ser reclassificada.");
    }
    await prisma.pendencia.update({
      where: { id: p.id },
      data: {
        severidade: input.severidade ?? null,
        tipo: input.tipo ?? null,
        prazo: input.prazo ? new Date(`${input.prazo}T12:00:00`) : null,
      },
    });
    revalidarViewer(p.projetoId, p.uploadId);
    return { id: p.id, projetoId: p.projetoId };
  },
);

/**
 * Replica um apontamento pra outras pranchas da mesma disciplina (item 30) — mesmo texto,
 * mesma posição relativa (x,y), cada cópia com seu próprio número sequencial no documento de
 * destino. **Cópia nasce SEM âncora textual** (decisão do solicitante, 2026-08-06): a âncora
 * original foi capturada no clique da prancha DE ORIGEM — nas pranchas de destino não houve
 * esse clique, então gravar uma âncora ali seria fingir uma confirmação que não existiu. Sem
 * âncora, a máquina de "posição incerta" do item 3 já cuida sozinha do resto assim que a
 * prancha de destino tiver revisão nova — zero código novo pra esse caso.
 */
export const replicarPendencia = defineAction(
  { ...baseValidador, acao: "replicar-pendencia", schema: replicarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const origem = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!origem || origem.excluidoEm) throw new ActionError("Pendência não encontrada.");

    // Só pranchas da MESMA disciplina do apontamento original — replicar entre projetos ou
    // disciplinas diferentes não é o caso de uso pedido, e abriria brecha de escopo.
    const destinos = await prisma.upload.findMany({
      where: { id: { in: input.uploadIds }, disciplinaId: origem.disciplinaId },
      select: { id: true, documentoId: true, disciplina: { select: { projetoId: true } } },
    });
    if (destinos.length === 0) throw new ActionError("Nenhuma prancha de destino válida.");

    const criadas = await prisma.$transaction(async (tx) => {
      const out: { uploadId: string; numero: number }[] = [];
      for (const dest of destinos) {
        const escopoNumero = dest.documentoId ? { documentoId: dest.documentoId } : { uploadId: dest.id };
        const max = await tx.pendencia.aggregate({ where: escopoNumero, _max: { numero: true } });
        const nova = await tx.pendencia.create({
          data: {
            uploadId: dest.id,
            documentoId: dest.documentoId,
            disciplinaId: origem.disciplinaId,
            projetoId: dest.disciplina.projetoId,
            numero: (max._max.numero ?? 0) + 1,
            pagina: origem.pagina,
            x: origem.x,
            y: origem.y,
            texto: origem.texto,
            status: "aberta",
            autorId: user.id,
            // Classificação e forma ACOMPANHAM a cópia (ao contrário da âncora textual): é o
            // mesmo problema repetido em outra prancha, então severidade/tipo continuam
            // valendo e o retângulo/seta/nuvem deve aparecer na mesma posição relativa — pelo
            // mesmo motivo de x/y já serem copiados.
            severidade: origem.severidade,
            tipo: origem.tipo,
            marcacaoTipo: origem.marcacaoTipo,
            marcacaoGeo: origem.marcacaoGeo ?? undefined,
            // A medida acompanha a cópia: a geometria é a mesma e o fator ficou congelado
            // nela, então o valor continua descrevendo o que foi medido.
            medidaMm: origem.medidaMm,
            medidaFator: origem.medidaFator,
            medidaModo: origem.medidaModo,
            // Prazo (item 18) acompanha a cópia: é o mesmo problema, com a mesma urgência.
            prazo: origem.prazo,
            // Herda o estado de publicação (item 31): replicar um apontamento já publicado
            // gera cópias publicadas — fazê-las nascer rascunho as esconderia até alguém
            // enviar uma rodada em CADA prancha de destino, o que ninguém espera.
            publicadoEm: origem.publicadoEm ? new Date() : null,
          },
        });
        out.push({ uploadId: nova.uploadId, numero: nova.numero });
      }
      return out;
    });

    for (const dest of destinos) revalidarViewer(dest.disciplina.projetoId, dest.id);
    return { total: criadas.length, criadas };
  },
);

/**
 * Exclui um apontamento (autor, enquanto aberto e sem tarefa) — **soft delete** (item 24).
 *
 * Era `delete` de verdade: o apontamento sumia e a única prova de que existiu era o
 * `AuditLog` da ação. Agora a linha fica, com `excluidoEm`/`excluidoPorId`, e o
 * `capturarAntes` grava o estado completo na auditoria (texto, status, classificação).
 *
 * `Pendencia` NÃO entra na extension de soft delete de `lib/prisma.ts` (onde estão `upload`
 * e `lancamento`), de propósito: a numeração é `_max: { numero }` por documento, e esconder
 * o excluído do aggregate faria o próximo apontamento REUSAR o número dele — dois "#5" no
 * mesmo documento, sem erro nenhum. O filtro é explícito em cada leitura de lista.
 */
export const excluirPendencia = defineAction(
  {
    ...baseValidador,
    acao: "excluir-pendencia",
    schema: idSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
    capturarAntes: async (input) => prisma.pendencia.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.excluidoEm) return { id: p.id, projetoId: p.projetoId };
    if (p.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode excluí-lo.");
    if (p.tarefaId) throw new ActionError("Pendência já vinculada a uma tarefa — não pode ser excluída.");
    await prisma.pendencia.update({
      where: { id: p.id },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    revalidarViewer(p.projetoId, p.uploadId);
    return { id: p.id, projetoId: p.projetoId };
  },
);

// NOTA: não existe `restaurarPendencia`. O soft delete aqui serve à trilha de auditoria (item
// 24), não a uma lixeira — nenhuma tela lista apontamento excluído, então uma action de
// restaurar não teria de onde ser chamada. Se um dia pedirem lixeira de apontamento, a coluna
// já suporta: basta a leitura que mostra os excluídos + a action.

/**
 * Fecha a rodada: agrupa as pendências abertas (sem tarefa) desta prancha em UMA tarefa,
 * cada apontamento vira item de checklist, e notifica os responsáveis. Estende o fluxo de
 * "solicitar ajuste" (marca o arquivo como ajuste solicitado).
 */
export const enviarApontamentos = defineAction(
  { ...baseValidador, acao: "enviar-apontamentos", entidade: "Upload", schema: enviarSchema, entidadeId: (_d, i) => i.uploadId },
  async (input, { user }) => {
    const upload = await carregarUploadParaApontar(input.uploadId);
    // Escopo do DOCUMENTO, não da versão: um apontamento aberto na R01 e ainda sem tarefa
    // precisa entrar na rodada de envio feita a partir da R02 (carry-over) — senão ficaria
    // visível no viewer mas impossível de acionar.
    const pendencias = await prisma.pendencia.findMany({
      where: {
        ...(upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id }),
        // Inclui `em_correcao` (item 22): é trabalho pendente e precisa entrar na rodada.
        status: { in: [...STATUS_ABERTOS] },
        tarefaId: null,
        // Rascunho ALHEIO fica de fora (item 31): publicar a análise a meio caminho de outro
        // revisor seria justamente o que o modo rascunho existe pra impedir. Os meus entram —
        // enviar é o ato de entregar o que eu marquei.
        OR: [{ publicadoEm: { not: null } }, { autorId: user.id }],
        // Soft delete (item 24) é explícito: `Pendencia` fica fora da extension de lib/prisma.ts
        // (ver `excluirPendencia`), então nenhuma leitura ganha o filtro de graça.
        excluidoEm: null,
      },
      orderBy: { numero: "asc" },
    });
    if (pendencias.length === 0) throw new ActionError("Nenhuma pendência nova para enviar.");

    const { disciplina } = upload;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    // Responsáveis: os informados na janela de confirmação; senão, os da disciplina.
    const responsaveisIds = input.responsaveisIds?.length
      ? input.responsaveisIds
      : disciplina.responsaveis.map((r) => r.userId);

    // Coluna escolhida (ou 1ª do Kanban por ordem). Guarda `concluido` p/ marcar concluidaEm.
    const statusEscolhido = input.statusId
      ? await prisma.tarefaStatus.findUnique({ where: { id: input.statusId }, select: { id: true, concluido: true } })
      : await prisma.tarefaStatus.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, concluido: true } });
    if (!statusEscolhido) throw new ActionError("Nenhuma coluna de tarefas configurada.");

    const resumo = `${pendencias.length} apontamento(s) na prancha ${upload.nomeArquivo}.`;
    const titulo = input.titulo?.trim() || `Ajustes · ${upload.nomeArquivo} (${disciplina.disciplinaTextoLegado} — ${codigo})`;
    const descricao = input.descricao?.trim() || resumo;
    // Entrega já validada: apontar reabre a disciplina em REVISÃO, mas mantém a validação
    // financeira (pagamentos ficam intactos) e registra a revisão (RVxx).
    const eraAprovada = disciplina.status === "aprovado";

    const { tarefaId, revisaoNumero } = await prisma.$transaction(async (tx) => {
      const tarefa = await tx.tarefa.create({
        data: {
          titulo,
          descricao,
          statusId: statusEscolhido.id,
          concluidaEm: statusEscolhido.concluido ? new Date() : null,
          prazo: input.prazo ? new Date(input.prazo) : null,
          prioridade: input.prioridade || null,
          projetoId: disciplina.projetoId,
          disciplinaId: upload.disciplinaId,
          criadorId: user.id,
          responsaveis: { create: responsaveisIds.map((userId) => ({ userId })) },
          dependeDe: input.dependeDeIds?.length
            ? { create: input.dependeDeIds.map((dependeDeId) => ({ dependeDeId })) }
            : undefined,
        },
      });
      // Um item por pendência, preservando número/ordem, e vincula de volta (deep-link/sync).
      for (let i = 0; i < pendencias.length; i++) {
        const p = pendencias[i];
        const item = await tx.tarefaItem.create({
          data: { tarefaId: tarefa.id, descricao: rotuloItemPendencia(p), ordem: i },
        });
        await tx.pendencia.update({ where: { id: p.id }, data: { tarefaId: tarefa.id, tarefaItemId: item.id } });
      }
      // Publica o lote (item 31): até aqui os apontamentos eram RASCUNHO, visíveis só pro
      // autor. Não existe um segundo passo de "publicar" — o envio já É o lote (cria a tarefa,
      // notifica os responsáveis e, se for o caso, abre revisão). Só marca quem ainda não
      // tinha data, pra não reescrever a publicação de linha antiga (backfill) reenviada.
      await tx.pendencia.updateMany({
        where: { id: { in: pendencias.map((p) => p.id) }, publicadoEm: null },
        data: { publicadoEm: new Date() },
      });
      // Marca o arquivo como "ajuste solicitado" (mesmo badge da validação parcial).
      await tx.upload.update({
        where: { id: upload.id },
        data: { validado: false, validadoPorId: null, validadoEm: null, revisaoObs: resumo, revisaoEm: new Date(), revisaoPorId: user.id },
      });

      let revisaoNumero: number | null = null;
      if (eraAprovada) {
        // Abre revisão SEM tocar nos pagamentos (validação financeira preservada).
        await tx.disciplina.update({ where: { id: upload.disciplinaId }, data: { status: "em_revisao" } });
        const ultima = await tx.revisaoDisciplina.findFirst({
          where: { disciplinaId: upload.disciplinaId },
          orderBy: { numero: "desc" },
          select: { numero: true },
        });
        revisaoNumero = ultima ? ultima.numero + 1 : 0;
        await tx.revisaoDisciplina.create({
          data: { disciplinaId: upload.disciplinaId, numero: revisaoNumero, motivo: resumo, autorId: user.id },
        });
      }
      return { tarefaId: tarefa.id, revisaoNumero };
    });

    const destinatarios = [...new Set([...responsaveisIds, upload.autorId])].filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(destinatarios, {
        titulo: eraAprovada ? "Revisão aberta na prancha" : "Ajustes solicitados na prancha",
        corpo:
          `${upload.nomeArquivo} (${disciplina.disciplinaTextoLegado} · ${codigo}): ${pendencias.length} apontamento(s)` +
          (revisaoNumero != null ? ` — revisão R${revisaoNumero} aberta.` : "."),
        href: "/tarefas",
        tag: `pendencias-${upload.id}`,
      });
    }

    revalidarViewer(disciplina.projetoId, upload.id);
    revalidatePath("/tarefas");
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { tarefaId, uploadId: upload.id, total: pendencias.length, revisaoAberta: revisaoNumero };
  },
);

// ── Ciclo de vida: máquina de estados do item 22 ───────────────

/** Descobre os papéis do usuário SOBRE ESTA pendência, na forma que a máquina entende. */
async function papeisSobre(p: { disciplinaId: string }, user: SessionUser): Promise<PapeisPendencia> {
  const global = ehGlobal(user);
  const [validador, resp] = await Promise.all([
    can(user, "uploads", "validar"),
    global
      ? Promise.resolve(true)
      : prisma.disciplinaResponsavel
          .findFirst({ where: { disciplinaId: p.disciplinaId, userId: user.id }, select: { id: true } })
          .then((r) => r !== null),
  ]);
  return { ehValidador: validador, ehResponsavel: resp, ehGlobal: global };
}

/**
 * Aplica UMA transição de estado, validada pela máquina do item 22
 * (`helpers.ts#podeTransicionar`). Antes, cada action checava o status na mão — com 6 estados
 * isso multiplica e diverge, e a UI não tinha como saber o que o servidor aceitaria.
 *
 * Os efeitos colaterais são por DESTINO, não por action: quem entra em estado "concluído"
 * marca o item de checklist, quem volta pra fila desmarca. `reaberturas` (item 23) só conta a
 * volta de `resolvida` — voltar de `em_correcao` ou de `adiado` não é reabertura, é retomada.
 */
async function transicionar(
  input: { id: string; justificativa?: string | null },
  user: SessionUser,
  destino: StatusPendencia,
) {
  const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
  if (!p || p.excluidoEm) throw new ActionError("Pendência não encontrada.");

  const papeis = await papeisSobre(p, user);
  const veredito = podeTransicionar(p.status, destino, papeis);
  if (!veredito.ok) throw new ActionError(veredito.motivo);

  const justificativa = input.justificativa?.trim() ?? "";
  if (veredito.exigeJustificativa && justificativa.length === 0) {
    throw new ActionError("Explique por que o apontamento não procede.");
  }

  const agora = new Date();
  const dados: Record<string, unknown> = { status: destino };
  let itemConcluido: boolean | null = null;

  if (destino === "resolvida") {
    dados.resolvidoPorId = user.id;
    dados.resolvidoEm = agora;
    itemConcluido = true;
  } else if (destino === "aberta") {
    dados.resolvidoPorId = null;
    dados.resolvidoEm = null;
    itemConcluido = false;
    // Item 23: só a volta de "resolvida" é reabertura de fato.
    if (p.status === "resolvida") dados.reaberturas = p.reaberturas + 1;
  } else if (destino === "em_correcao" || destino === "adiado") {
    itemConcluido = false;
  } else if (destino === "fechada") {
    dados.fechadoPorId = user.id;
    dados.fechadoEm = agora;
    // Registra CONTRA QUAL versão foi verificada — `uploadId` continua sendo onde nasceu.
    // Sem isso não dá pra dizer "aberto na R01, conferido na R03".
    const verificacao = p.documentoId
      ? await prisma.upload.findFirst({ where: { documentoId: p.documentoId }, orderBy: { versao: "desc" }, select: { id: true } })
      : null;
    dados.uploadVerificacaoId = verificacao?.id ?? p.uploadId;
    itemConcluido = true;
  } else if (destino === "descartada") {
    dados.fechadoPorId = user.id;
    dados.fechadoEm = agora;
    dados.justificativaDescarte = justificativa;
    itemConcluido = true;
  }

  await prisma.$transaction(async (tx) => {
    await tx.pendencia.update({ where: { id: p.id }, data: dados });
    if (p.tarefaItemId && itemConcluido !== null) {
      // `updateMany`, não `update`: `tarefaItemId` é ponteiro SEM FK e pode estar órfão (item
      // de checklist apagado com a tarefa, ou recriado por uma edição antiga da tarefa). Com
      // `update`, o Prisma joga P2025 — que não é `ActionError` — e a transição INTEIRA morre
      // com "Erro ao processar a solicitação.". O estado do apontamento não pode depender de
      // um item de checklist que sumiu; sem alvo, o sync simplesmente não acontece.
      await tx.tarefaItem.updateMany({ where: { id: p.tarefaItemId }, data: { concluido: itemConcluido } });
    }
  });

  revalidarViewer(p.projetoId, p.uploadId);
  revalidatePath("/tarefas");
  revalidatePath("/pendencias");
  return { id: p.id, projetoId: p.projetoId, status: destino };
}

/** Projetista assume a correção (item 22) — o único estado 100% novo da máquina. */
export const assumirCorrecaoPendencia = defineAction(
  { ...baseProjetista, acao: "assumir-correcao-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "em_correcao"),
);

/** Projetista marca como resolvida (= aguardando verificação do validador). */
export const resolverPendencia = defineAction(
  { ...baseProjetista, acao: "resolver-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "resolvida"),
);

/** Volta pra fila: reabrir (de resolvida), largar a correção, ou reativar um adiado. */
export const reabrirPendencia = defineAction(
  { ...baseProjetista, acao: "reabrir-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "aberta"),
);

/** Validador encerra a pendência (aceita a resolução). */
export const fecharPendencia = defineAction(
  { ...baseValidador, acao: "fechar-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "fechada"),
);

/**
 * Validador marca "não procede" (item 22) — a justificativa passou a ser OBRIGATÓRIA. O valor
 * gravado continua `descartada`: é o mesmo estado, e renomear invalidaria o AuditLog já escrito.
 */
export const descartarPendencia = defineAction(
  { ...baseValidador, acao: "descartar-pendencia", schema: descartarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "descartada"),
);

/** Adia o apontamento — SÓ admin/supervisor (restrição do solicitante em R9). */
export const adiarPendencia = defineAction(
  { ...baseProjetista, acao: "adiar-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => transicionar(input, user, "adiado"),
);

// ── Thread de resposta (item 39) ───────────────────────────────

/**
 * Responde num apontamento (item 39) — abre o ciclo pro projetista argumentar, pedir
 * esclarecimento ou registrar o que fez, em vez de só mudar status.
 *
 * Gate: o mesmo de `resolverPendencia` (`projetos:ver` + responsável da disciplina ou
 * perfil global), mais o AUTOR do apontamento — quem apontou precisa poder responder na
 * própria thread mesmo sem ser responsável daquela disciplina. Um `cliente` não passa: não
 * é responsável de disciplina, não é global, e não é autor de apontamento (criar exige
 * `uploads:validar`).
 *
 * Não muda status: comentar e resolver são atos diferentes, e fundir os dois faria a thread
 * virar máquina de estado paralela à que o item 22 vai formalizar.
 */
export const responderPendencia = defineAction(
  { ...baseProjetista, acao: "responder-pendencia", entidade: "PendenciaResposta", schema: responderSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({
      where: { id: input.id },
      include: { upload: { select: { autorId: true } } },
    });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.excluidoEm) throw new ActionError("Pendência excluída.");
    await exigirParticipante(p, user);

    const resposta = await prisma.pendenciaResposta.create({
      data: { pendenciaId: p.id, autorId: user.id, texto: input.texto },
    });
    revalidarViewer(p.projetoId, p.uploadId);

    // Notifica o OUTRO lado da conversa: quem abriu o apontamento + quem já respondeu antes
    // + os responsáveis da disciplina. Sem isso a resposta fica esperando alguém reabrir a
    // prancha por acaso — que é exatamente o vazio que este item veio fechar.
    const [responsaveis, jaResponderam] = await Promise.all([
      prisma.disciplinaResponsavel.findMany({ where: { disciplinaId: p.disciplinaId }, select: { userId: true } }),
      prisma.pendenciaResposta.findMany({
        where: { pendenciaId: p.id },
        select: { autorId: true },
        distinct: ["autorId"],
      }),
    ]);
    const destinatarios = [
      ...new Set([p.autorId, ...responsaveis.map((r) => r.userId), ...jaResponderam.map((r) => r.autorId)]),
    ].filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(
        destinatarios,
        {
          titulo: `Resposta no apontamento #${p.numero}`,
          corpo: `${user.name}: ${input.texto}`,
          href: `/projetos/${p.projetoId}/arquivos/${p.uploadId}/visualizar?pin=${p.numero}`,
          tag: `pendencia-resposta-${p.id}`,
        },
        { categoria: CATEGORIA_APONTAMENTO },
      ).catch((err) => console.error("[pendencias] falha ao notificar resposta:", err));
    }
    // Menção dentro da thread também notifica (R13 — mesmo parse-and-notify do chat).
    if (extrairMencoes(input.texto).length > 0) {
      const candidatos = await candidatosMencao(p.disciplinaId, p.upload.autorId);
      await notificarMencionados(resolverMencionados(input.texto, candidatos), user.id, p.numero, input.texto, p.projetoId);
    }
    return { id: resposta.id, pendenciaId: p.id, projetoId: p.projetoId };
  },
);

// ── Biblioteca de apontamentos-padrão (item 10) ────────────────

const padraoSchema = z.object({
  disciplinaId: z.string().nullish(),
  texto: z.string().trim().min(3, "Escreva o texto do apontamento-padrão.").max(1000),
  ...classificacaoSchema,
});

/**
 * Cadastra uma frase recorrente na biblioteca (item 10) — "cota ausente na planta baixa" e
 * afins, pra não redigitar a cada revisão. `disciplinaId` nulo = vale pra qualquer disciplina.
 *
 * Gate de quem aponta (`uploads:validar`): a biblioteca é ferramenta de quem revisa.
 */
export const criarApontamentoPadrao = defineAction(
  { ...baseValidador, acao: "criar-apontamento-padrao", entidade: "ApontamentoPadrao", schema: padraoSchema, entidadeId: (d) => (d as { id: string }).id },
  async (input, { user }) => {
    const p = await prisma.apontamentoPadrao.create({
      data: {
        disciplinaId: input.disciplinaId || null,
        texto: input.texto,
        severidade: input.severidade ?? null,
        tipo: input.tipo ?? null,
        autorId: user.id,
      },
    });
    revalidatePath("/pendencias");
    return { id: p.id, texto: p.texto };
  },
);

/** Desativa um padrão (soft): sai do autocomplete sem sumir de quem já usou. */
export const desativarApontamentoPadrao = defineAction(
  { ...baseValidador, acao: "desativar-apontamento-padrao", entidade: "ApontamentoPadrao", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (input, { user }) => {
    const p = await prisma.apontamentoPadrao.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Apontamento-padrão não encontrado.");
    if (p.autorId !== user.id && !ehGlobal(user)) {
      throw new ActionError("Só quem cadastrou (ou admin/supervisor) pode desativar.");
    }
    await prisma.apontamentoPadrao.update({ where: { id: p.id }, data: { ativo: false } });
    revalidatePath("/pendencias");
    return { id: p.id };
  },
);

/**
 * Marca que um padrão foi usado (item 10) — alimenta a ordenação do autocomplete pelo que a
 * equipe mais usa. Separado da criação da pendência de propósito: falhar aqui não pode
 * derrubar a criação do apontamento, que é o que importa.
 */
export const registrarUsoApontamentoPadrao = defineAction(
  { ...baseValidador, acao: "usar-apontamento-padrao", entidade: "ApontamentoPadrao", schema: idSchema, entidadeId: (d) => (d as { id: string }).id, audit: false },
  async (input) => {
    await prisma.apontamentoPadrao.update({ where: { id: input.id }, data: { usos: { increment: 1 } } });
    return { id: input.id };
  },
);

// ── Medição (item 28) ──────────────────────────────────────────

/**
 * Define (ou substitui) a calibração de escala de uma PÁGINA da prancha (item 28), nos dois
 * modos que o solicitante escolheu: declarar a escala (1:50) ou calibrar por dois pontos de
 * dimensão conhecida. Os dois chegam aqui já normalizados em `mmPorPonto`.
 *
 * Ancorada no DOCUMENTO quando existe: revisão nova da mesma prancha herda a escala, que é o
 * comportamento esperado (e recalibrar é um clique se a revisão mudou de escala). Só cai no
 * `uploadId` na linha legada sem documento pai — mesmo fallback do resto do módulo.
 *
 * **Não recalcula medições já feitas**, de propósito: `Pendencia.medidaMm` é congelado com o
 * fator que o produziu. Um apontamento que diz "viga com 5,00 m" não pode virar outro número
 * porque alguém recalibrou a folha depois.
 */
export const calibrarPrancha = defineAction(
  { ...baseValidador, acao: "calibrar-prancha", entidade: "CalibracaoPrancha", schema: calibrarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { id: true, documentoId: true, disciplina: { select: { projetoId: true } } },
    });
    if (!upload) throw new ActionError("Prancha não encontrada.");

    const onde = upload.documentoId
      ? { documentoId_pagina: { documentoId: upload.documentoId, pagina: input.pagina } }
      : { uploadId_pagina: { uploadId: upload.id, pagina: input.pagina } };
    const dados = {
      modo: input.modo,
      escalaDenominador: input.modo === "escala" ? (input.escalaDenominador ?? null) : null,
      mmPorPonto: input.mmPorPonto,
      autorId: user.id,
    };
    const calibracao = await prisma.calibracaoPrancha.upsert({
      where: onde,
      update: dados,
      create: {
        ...dados,
        pagina: input.pagina,
        // Exatamente UM dos donos é preenchido — é o que faz as duas chaves únicas
        // funcionarem sem colidir no NULL do Postgres.
        documentoId: upload.documentoId ?? null,
        uploadId: upload.documentoId ? null : upload.id,
      },
    });

    revalidarViewer(upload.disciplina.projetoId, upload.id);
    return {
      id: calibracao.id,
      pagina: calibracao.pagina,
      modo: calibracao.modo,
      escalaDenominador: calibracao.escalaDenominador,
      mmPorPonto: calibracao.mmPorPonto,
      projetoId: upload.disciplina.projetoId,
    };
  },
);

// ── Anexos (item 12) ───────────────────────────────────────────

/**
 * Anexa um LINK externo ao apontamento (item 12). Arquivo (print/foto/áudio/PDF) vai pela
 * rota multipart `/api/pendencias/anexo` — link é só texto, então cabe numa Server Action.
 *
 * Gate de participante (ver `exigirParticipante`): o projetista precisa poder juntar
 * evidência, não só quem apontou.
 */
export const anexarLinkPendencia = defineAction(
  { ...baseProjetista, acao: "anexar-link-pendencia", entidade: "PendenciaAnexo", schema: anexarLinkSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p || p.excluidoEm) throw new ActionError("Pendência não encontrada.");
    await exigirParticipante(p, user);

    const anexo = await prisma.pendenciaAnexo.create({
      data: {
        pendenciaId: p.id,
        tipo: "link",
        // Sem rótulo, mostra o host — "www.abnt.org.br" lê melhor numa lista do que a URL inteira.
        nome: input.nome?.trim() || new URL(input.url).host,
        url: input.url,
        autorId: user.id,
      },
    });
    revalidarViewer(p.projetoId, p.uploadId);
    return { id: anexo.id, nome: anexo.nome, url: anexo.url, projetoId: p.projetoId };
  },
);

/** Remove um anexo (quem anexou, ou admin). Apaga também o arquivo do disco, quando houver. */
export const excluirAnexoPendencia = defineAction(
  { ...baseProjetista, acao: "excluir-anexo-pendencia", entidade: "PendenciaAnexo", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const a = await prisma.pendenciaAnexo.findUnique({
      where: { id: input.id },
      include: { pendencia: { select: { projetoId: true, uploadId: true } } },
    });
    if (!a) throw new ActionError("Anexo não encontrado.");
    if (a.autorId !== user.id && user.role !== "admin") {
      throw new ActionError("Só quem anexou (ou admin) pode remover o anexo.");
    }
    await prisma.pendenciaAnexo.delete({ where: { id: a.id } });
    // Some do disco junto — anexo não tem lixeira, e deixar o arquivo órfão só ocupa espaço.
    if (a.caminho) await removerArquivo(a.caminho).catch((err) => console.error("[pendencias] falha ao remover anexo do disco:", err));
    revalidarViewer(a.pendencia.projetoId, a.pendencia.uploadId);
    return { id: a.id, projetoId: a.pendencia.projetoId };
  },
);

// ── Reincidência (item 17) ─────────────────────────────────────

/**
 * Sugere apontamentos já fechados parecidos com o texto sendo escrito (item 17).
 *
 * Só sugere: nada muda de estado aqui, e confirmar (no cliente) apenas cria a referência
 * cruzada do item 13 — a mesma ligação que a pessoa faria à mão. É a garantia contra o risco
 * que a ficha registra (falso positivo escondendo problema novo): a heurística nunca fecha,
 * marca nem classifica nada sozinha.
 *
 * `disciplinaId` vem do UPLOAD, não do cliente. `audit: false` — dispara a cada pausa na
 * digitação.
 */
export const sugerirReincidencias = defineAction(
  { ...baseValidador, acao: "sugerir-reincidencias", entidade: "Pendencia", schema: z.object({ uploadId: z.string().min(1), texto: z.string().max(2000) }), entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId, audit: false },
  async (input) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { disciplinaId: true },
    });
    if (!upload) throw new ActionError("Prancha não encontrada.");
    const itens = await possiveisReincidencias(upload.disciplinaId, input.texto);
    return { disciplinaId: upload.disciplinaId, itens };
  },
);

// ── Marca d'água de leitura (item 8) ───────────────────────────

/**
 * Avança a marca d'água de "já analisei até aqui" ao ABRIR a prancha (item 8).
 *
 * Roda depois de o viewer montar, não durante a leitura do RSC: gravar na renderização faria a
 * própria visita zerar o aviso antes de a pessoa lê-lo. `audit: false` — abrir prancha é
 * navegação, e uma linha de auditoria por abertura afogaria o log sem contar nada novo (o
 * acesso ao arquivo já é auditado no download).
 *
 * Gate: `projetos:ver` + a linha é sempre do PRÓPRIO usuário (`user.id`, nunca um id vindo do
 * cliente), então não há como marcar leitura em nome de outra pessoa.
 */
export const marcarDocumentoLido = defineAction(
  { ...baseProjetista, acao: "marcar-documento-lido", entidade: "LeituraDocumento", schema: z.object({ documentoId: z.string().min(1) }), entidadeId: (d) => (d as { documentoId: string }).documentoId, audit: false },
  async (input, { user }) => {
    const agora = new Date();
    await prisma.leituraDocumento.upsert({
      where: { documentoId_userId: { documentoId: input.documentoId, userId: user.id } },
      update: { lidoEm: agora },
      create: { documentoId: input.documentoId, userId: user.id, lidoEm: agora },
    });
    return { documentoId: input.documentoId };
  },
);

// ── Referência cruzada (item 13) ───────────────────────────────

const referenciarSchema = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1),
  nota: z.string().trim().max(300).optional(),
});

/**
 * Liga dois apontamentos do mesmo projeto ("este problema é o mesmo do #12 da ARQ", item 13).
 *
 * Gate de PARTICIPANTE (`baseProjetista` + `exigirParticipante`), igual a anexo (item 12) e
 * resposta (item 39): ligar dois apontamentos é acrescentar contexto a um que já existe, não
 * abrir apontamento novo — e o projetista é justamente quem costuma reconhecer que dois
 * problemas são o mesmo. Exigir `uploads:validar` deixaria de fora quem tem a informação.
 *
 * A ligação é gravada com direção, mas é exibida dos dois lados (ver `carregarReferencias`),
 * então o **par inverso é recusado**: `@@unique([origemId, destinoId])` não o pega, e ele
 * renderizaria como uma segunda linha idêntica na tela dos dois apontamentos.
 */
export const referenciarPendencia = defineAction(
  { ...baseProjetista, acao: "referenciar-pendencia", entidade: "ReferenciaPendencia", schema: referenciarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    if (input.origemId === input.destinoId) throw new ActionError("Um apontamento não pode referenciar a si mesmo.");

    const [origem, destino] = await Promise.all([
      prisma.pendencia.findUnique({ where: { id: input.origemId } }),
      prisma.pendencia.findUnique({ where: { id: input.destinoId } }),
    ]);
    if (!origem || origem.excluidoEm) throw new ActionError("Apontamento de origem não encontrado.");
    // Rascunho de terceiro é tratado como inexistente (item 31): admitir aqui vazaria a
    // existência de uma análise que ninguém mais pode abrir.
    if (!destino || destino.excluidoEm || (destino.publicadoEm === null && destino.autorId !== user.id)) {
      throw new ActionError("Apontamento referenciado não encontrado.");
    }
    if (origem.projetoId !== destino.projetoId) {
      throw new ActionError("Só é possível referenciar apontamentos do mesmo projeto.");
    }
    await exigirParticipante(origem, user);

    const jaExiste = await prisma.referenciaPendencia.findFirst({
      where: {
        OR: [
          { origemId: input.origemId, destinoId: input.destinoId },
          { origemId: input.destinoId, destinoId: input.origemId },
        ],
      },
      select: { id: true },
    });
    if (jaExiste) throw new ActionError("Estes apontamentos já estão ligados.");

    const ref = await prisma.referenciaPendencia.create({
      data: { origemId: origem.id, destinoId: destino.id, nota: input.nota?.trim() || null, autorId: user.id },
    });
    // Revalida os DOIS viewers: o apontamento citado também passa a mostrar a ligação.
    revalidarViewer(origem.projetoId, origem.uploadId);
    if (destino.uploadId !== origem.uploadId) revalidarViewer(destino.projetoId, destino.uploadId);

    // Avisa o outro lado — a referência é informação nova pra quem cuida do apontamento citado.
    const destinatarios = [...new Set([destino.autorId])].filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(
        destinatarios,
        {
          titulo: `Apontamento #${destino.numero} foi referenciado`,
          corpo: `${user.name} ligou o apontamento #${origem.numero} a este.`,
          href: `/projetos/${destino.projetoId}/arquivos/${destino.uploadId}/visualizar?pin=${destino.numero}`,
          tag: `pendencia-referencia-${ref.id}`,
        },
        { categoria: CATEGORIA_APONTAMENTO },
      ).catch((err) => console.error("[pendencias] falha ao notificar referência:", err));
    }
    return { id: ref.id, origemId: origem.id, destinoId: destino.id, projetoId: origem.projetoId };
  },
);

const buscarAlvosSchema = z.object({
  origemId: z.string().min(1),
  termo: z.string().max(120).default(""),
});

/**
 * Alimenta o seletor de destino da referência (item 13).
 *
 * O projeto vem da PRÓPRIA pendência de origem, não do cliente: assim o escopo da busca não
 * depende de um id enviado pelo navegador, e o mesmo `exigirParticipante` que autoriza criar a
 * ligação já autoriza procurar o destino. `audit: false` — é leitura de digitação, gravaria uma
 * linha de auditoria por tecla.
 */
export const buscarAlvosReferencia = defineAction(
  { ...baseProjetista, acao: "buscar-alvos-referencia", entidade: "Pendencia", schema: buscarAlvosSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId, audit: false },
  async (input, { user }) => {
    const origem = await prisma.pendencia.findUnique({ where: { id: input.origemId } });
    if (!origem || origem.excluidoEm) throw new ActionError("Apontamento não encontrado.");
    await exigirParticipante(origem, user);
    const itens = await buscarPendenciasParaReferencia({
      projetoId: origem.projetoId,
      excluirId: origem.id,
      termo: input.termo,
      viewerId: user.id,
    });
    return { projetoId: origem.projetoId, itens };
  },
);

/** Desfaz uma referência cruzada (quem ligou, ou admin). Hard delete — a ligação não tem história. */
export const removerReferenciaPendencia = defineAction(
  { ...baseProjetista, acao: "remover-referencia-pendencia", entidade: "ReferenciaPendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const ref = await prisma.referenciaPendencia.findUnique({
      where: { id: input.id },
      include: {
        origem: { select: { projetoId: true, uploadId: true } },
        destino: { select: { projetoId: true, uploadId: true } },
      },
    });
    if (!ref) throw new ActionError("Referência não encontrada.");
    if (ref.autorId !== user.id && user.role !== "admin") {
      throw new ActionError("Só quem criou a referência (ou admin) pode removê-la.");
    }
    await prisma.referenciaPendencia.delete({ where: { id: ref.id } });
    revalidarViewer(ref.origem.projetoId, ref.origem.uploadId);
    if (ref.destino.uploadId !== ref.origem.uploadId) revalidarViewer(ref.destino.projetoId, ref.destino.uploadId);
    return { id: ref.id, projetoId: ref.origem.projetoId };
  },
);

/** Autor apaga a própria resposta (ou admin). Hard delete — thread curta, sem histórico de edição. */
export const excluirRespostaPendencia = defineAction(
  { ...baseProjetista, acao: "excluir-resposta-pendencia", entidade: "PendenciaResposta", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const r = await prisma.pendenciaResposta.findUnique({
      where: { id: input.id },
      include: { pendencia: { select: { projetoId: true, uploadId: true } } },
    });
    if (!r) throw new ActionError("Resposta não encontrada.");
    if (r.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem escreveu (ou admin) pode apagar a resposta.");
    await prisma.pendenciaResposta.delete({ where: { id: r.id } });
    revalidarViewer(r.pendencia.projetoId, r.pendencia.uploadId);
    return { id: r.id, projetoId: r.pendencia.projetoId };
  },
);

