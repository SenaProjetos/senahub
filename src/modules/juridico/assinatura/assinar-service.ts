import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { ActionError } from "@/lib/action-error";
import { registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";
import { decidirPrazoDoProjeto, devePassarParaAssinado } from "@/modules/juridico/contrato/estado";
import { gerarRecebiveisDoContrato } from "@/modules/juridico/contrato/recebiveis";
import { sincronizarPrevisoesDepois } from "@/modules/juridico/contrato/previsao-service";
import { registrarAlteracaoContratual, type MotivoContratual } from "@/modules/rh/contratual/service";

/**
 * O miolo da assinatura de uma versão de documento jurídico (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`, "O miolo").
 *
 * O Jurídico (`registrarAceite`) e o portal do cliente (pedido de assinatura) chamam a MESMA
 * função, dentro da transação de quem chama. Autorização e alçada são de quem chama; aqui só o
 * que a assinatura grava: o aceite, o evento da trilha e, na transição para "assinado", o status,
 * o aditivo de equipe, o prazo do projeto e os recebíveis.
 */

export type EntradaAssinatura = {
  versaoId: string;
  /** Quem assina (`AceiteDocumento.userId/userNome` e o evento da trilha). */
  ator: { id: string; nome: string };
  /**
   * Autor dos recebíveis e da alteração contratual. No Jurídico é quem assina; no portal é quem
   * PEDIU a assinatura (interno) — o Financeiro é só interno, a conta externa nunca é autora.
   */
  autorFinanceiroId: string;
  hashArquivo: string;
  ip: string | null;
  userAgent: string | null;
};

export type ResultadoAssinatura = {
  aceiteId: string;
  /** A mesma pessoa já tinha aceite nesta versão: nada foi gravado. */
  jaAssinado: boolean;
  /** Esta assinatura levou o documento a "assinado" (só uma, mesmo com várias ao mesmo tempo). */
  transicao: boolean;
  documento: { id: string; projetoId: string | null; vinculoId: string | null; formaCobranca: "por_data" | "por_entrega" };
};

/** SHA-256 do arquivo da versão NAQUELE momento — a prova de integridade do aceite. */
export async function hashDaVersao(versaoId: string): Promise<string> {
  const versao = await prisma.docJuridicoVersao.findUnique({ where: { id: versaoId }, select: { arquivoPath: true } });
  if (!versao) throw new ActionError("Versão não encontrada.");
  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(versao.arquivoPath);
  } catch {
    throw new ActionError("Arquivo da versão indisponível para assinatura.");
  }
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Assina a versão dentro de `tx`. Sem `Promise.all`: a transação tem UMA conexão.
 *
 * Trava a linha do documento (`FOR UPDATE`) e RELÊ tipo/status depois da trava: duas assinaturas
 * ao mesmo tempo (Jurídico e portal, ou dois signatários) entram uma de cada vez, e a segunda já
 * encontra "assinado" — uma transição só, recebíveis uma vez. A mesma trava serializa a cadeia de
 * eventos da versão e a idempotência por pessoa.
 */
export async function assinarVersaoNoTx(tx: Prisma.TransactionClient, e: EntradaAssinatura): Promise<ResultadoAssinatura> {
  const alvo = await tx.docJuridicoVersao.findUnique({ where: { id: e.versaoId }, select: { documentoId: true } });
  if (!alvo) throw new ActionError("Versão não encontrada.");
  await tx.$queryRaw`SELECT id FROM documento_juridico WHERE id = ${alvo.documentoId} FOR UPDATE`;

  // Leituras separadas, uma de cada vez: um `select` com relações aninhadas faz o Prisma disparar
  // consultas em paralelo na conexão única da transação (o mesmo problema do `Promise.all` no `tx`).
  const doc = await tx.documentoJuridico.findUnique({
    where: { id: alvo.documentoId },
    select: {
      id: true,
      vinculoId: true,
      tipo: true,
      statusContrato: true,
      valor: true,
      // Fases G e H3 — o que a assinatura de um contrato de CLIENTE dispara.
      clienteId: true,
      parcelas: true,
      primeiroVencimento: true,
      formaCobranca: true,
      dataVencimento: true,
      projetoId: true,
      titulo: true,
    },
  });
  if (!doc) throw new ActionError("Documento não encontrado.");
  const documento = { id: doc.id, projetoId: doc.projetoId, vinculoId: doc.vinculoId, formaCobranca: doc.formaCobranca };

  // Idempotência: um aceite por (pessoa, versão). Já assinou → devolve o existente, sem escrever.
  const existente = await tx.aceiteDocumento.findFirst({
    where: { versaoId: e.versaoId, userId: e.ator.id },
    select: { id: true },
  });
  if (existente) return { aceiteId: existente.id, jaAssinado: true, transicao: false, documento };

  // Aceite + evento da trilha na MESMA transação (Fase D): aceite sem evento é assinatura sem
  // prova, evento sem aceite é prova que aponta pra nada.
  const criado = await tx.aceiteDocumento.create({
    data: {
      versaoId: e.versaoId,
      userId: e.ator.id,
      userNome: e.ator.nome,
      hashArquivo: e.hashArquivo,
      assinadoEm: new Date(),
      ip: e.ip,
      userAgent: e.userAgent,
    },
  });

  await registrarEventoAssinatura(tx, {
    versaoId: e.versaoId,
    tipo: "assinado",
    ator: e.ator.id,
    atorNome: e.ator.nome,
    ip: e.ip,
    userAgent: e.userAgent,
    hashArquivo: e.hashArquivo,
  });

  // Fecha o loop do badge "contrato pendente" (Fase I) e da alçada (H4): o próprio aceite JÁ
  // É o sinal de "assinado" — nenhuma tela extra pra mudar status à mão. Predicado único:
  // vale pra aditivo também, e não reabre "rescindido"/"vencido". Status RELIDO depois da trava.
  const transicao = devePassarParaAssinado(doc.tipo, doc.statusContrato);
  if (transicao) {
    await tx.documentoJuridico.update({
      where: { id: doc.id },
      data: { statusContrato: "assinado", assinadoEm: new Date() },
    });

    // Aditivo de equipe assinado APLICA a alteração contratual (Fase B2).
    //
    // O efeito é preso à TRANSIÇÃO de status, não ao aceite: dois signatários no mesmo
    // aditivo geram dois aceites, e aplicar por aceite reajustaria o salário duas vezes.
    // Aqui o segundo signatário já encontra `statusContrato = "assinado"` e não entra.
    const adt = await tx.aditivoEquipe.findUnique({ where: { documentoId: doc.id } });
    const userIdAlvo = doc.vinculoId
      ? (await tx.vinculo.findUnique({ where: { id: doc.vinculoId }, select: { userId: true } }))?.userId
      : undefined;
    if (adt && userIdAlvo) {
      await registrarAlteracaoContratual(
        tx,
        userIdAlvo,
        {
          // ⚠️ `?? undefined` é obrigatório: no service, `null` significa LIMPAR o campo,
          // enquanto no aditivo `null` significa "não mexe nesse eixo". Passar o null direto
          // apagaria o cargo de quem recebeu um aditivo só de reajuste.
          cargoId: adt.cargoId ?? undefined,
          remuneracao: adt.remuneracao ?? undefined,
          // Data de VIGÊNCIA do aditivo, não a de hoje: um aditivo assinado em fevereiro
          // pode valer a partir de março, e o default do service é `hoje`.
          vigenciaEm: adt.vigenciaEm,
          motivo: (adt.motivo ?? undefined) as MotivoContratual | undefined,
          observacao: adt.observacao,
        },
        e.autorFinanceiroId,
      );
    }

    // ── Fase H3: o prazo do contrato vira o prazo do projeto ────────────────────────
    // Só quando o projeto ainda não tem prazo e nenhuma disciplina já está agendada além
    // dele — ver `decidirPrazoDoProjeto` para o porquê de cada guarda.
    const projeto = doc.projetoId
      ? await tx.projeto.findUnique({ where: { id: doc.projetoId }, select: { prazoContrato: true } })
      : null;
    if (doc.projetoId && projeto) {
      const disciplinas = await tx.disciplina.findMany({ where: { projetoId: doc.projetoId }, select: { prazo: true } });
      const decisao = decidirPrazoDoProjeto(
        doc.dataVencimento,
        projeto.prazoContrato,
        disciplinas.map((d) => d.prazo),
      );
      if (decisao.define) {
        await tx.projeto.update({
          where: { id: doc.projetoId },
          data: { prazoContrato: doc.dataVencimento, prazoPlanejado: doc.dataVencimento },
        });
      }
    }

    // ── Fase G: contrato de cliente assinado gera o cronograma de recebíveis ────────
    // Exige `parcelas` e `primeiroVencimento` definidos — sem condição de pagamento não há
    // o que gerar, e inventar uma (à vista? 30 dias?) seria escrever regra financeira que
    // ninguém pediu. Contrato de EQUIPE nunca entra: é pago pela folha, não por
    // `Lancamento`.
    // F7.3: só o contrato POR DATA. O por entrega gera previsões pelo cronograma (`depoisDeAssinar`).
    if (
      doc.formaCobranca === "por_data" &&
      !doc.vinculoId &&
      doc.clienteId &&
      doc.parcelas &&
      doc.primeiroVencimento &&
      doc.valor
    ) {
      await gerarRecebiveisDoContrato(tx, {
        contratoId: doc.id,
        titulo: doc.titulo,
        clienteId: doc.clienteId,
        projetoId: doc.projetoId,
        valor: doc.valor.toNumber(),
        parcelas: doc.parcelas,
        primeiroVencimento: doc.primeiroVencimento,
        autorId: e.autorFinanceiroId,
      });
    }
  }

  return { aceiteId: criado.id, jaAssinado: false, transicao, documento };
}

/**
 * Depois do commit (nunca dentro da transação: roda o motor do cronograma). F7.2: contrato por
 * entrega assinado passa a ter previsão de recebimento (a parcela "na assinatura" já; as de marco
 * quando o cronograma estiver aprovado). Idempotente — o segundo signatário não duplica nada.
 * O `revalidarFinanceiro()` fica com quem chama (é coisa de action).
 */
export async function depoisDeAssinar(r: ResultadoAssinatura, autorFinanceiroId: string): Promise<void> {
  if (r.jaAssinado) return;
  const d = r.documento;
  if (d.formaCobranca !== "por_entrega" || d.vinculoId) return;
  await sincronizarPrevisoesDepois(d.projetoId ? { projetoId: d.projetoId } : { contratoId: d.id }, autorFinanceiroId);
}
