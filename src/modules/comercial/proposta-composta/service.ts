import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import type { Prisma, SecaoProposta } from "@/generated/prisma/client";
import { proximoNumeroProposta, registrarAtividade } from "../service";
import { calcularValoresVersao, percentualDesconto, proximoNumeroVersao } from "../versoes";
import { isoParaDataValidade } from "../validade";
import { getConfigComercial } from "../config/queries";
import { exigeJustificativaDesconto } from "../config/padroes";
import { escolherClausula } from "./clausulas";
import { lerPagamentoDoModelo, resolverSecoesDoModelo, ROTULO_SECAO } from "./modelos";
import { calcularParcelas, somaPercentuais } from "./parcelas";

/**
 * Proposta composta (ADR-0006, G4): montada no sistema a partir de modelo + biblioteca, com o
 * plano de pagamento em percentual.
 *
 * Mora ao lado das regras puras, mas é a camada COM I/O — `actions.ts` e (na G5) a renderização
 * chamam daqui. O que é decisão de negócio pura (parcelas, escolha de cláusula, extenso) está
 * nos módulos vizinhos e é testado sem banco.
 *
 * **Reaproveita o que já governa proposta neste módulo**, em vez de criar regra paralela:
 * `calcularValoresVersao` (o mesmo trio valorOriginal/desconto/valorVersao do editor e da
 * externa), a exigência de justificativa de desconto, `proximoNumeroProposta` (a composta
 * consome o sequencial como qualquer proposta) e `registrarAtividade` para a timeline.
 */

export type ItemComposta = { disciplina: string; valor: number };
export type SecaoComposta = { secao: SecaoProposta; titulo?: string; texto: string; disciplinaId?: string | null; clausulaId?: string | null };
export type ParcelaComposta = { descricao: string; percentual: number; prazo?: string };

/**
 * Cria a proposta a partir do modelo: copia as cláusulas (resolvendo variante por UF e por
 * disciplina) e o plano sugerido, e consome o número sequencial.
 *
 * As cláusulas são COPIADAS aqui e agora: editar a biblioteca depois não mexe nesta proposta.
 */
export async function criarPropostaComposta(
  input: {
    negociacaoId: string;
    modeloId: string;
    titulo: string;
    obraEndereco?: string;
    obraCidade?: string;
    obraUF?: string;
    areaM2?: number | null;
    itens: ItemComposta[];
  },
  autorId: string,
): Promise<{ propostaId: string; numero: string; avisos: string[] }> {
  const negociacao = await prisma.negociacao.findUnique({
    where: { id: input.negociacaoId },
    select: { id: true, clienteId: true, leadId: true, estagio: true },
  });
  if (!negociacao) throw new ActionError("Negociação não encontrada.");
  if (negociacao.estagio === "CONTRATADO") {
    throw new ActionError("Negociação já contratada — não recebe nova proposta.");
  }

  const modelo = await prisma.modeloProposta.findUnique({ where: { id: input.modeloId } });
  if (!modelo) throw new ActionError("Modelo de proposta não encontrado.");
  if (!modelo.ativo) throw new ActionError("Este modelo está desativado.");

  const uf = input.obraUF?.trim().toUpperCase() || null;
  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  const idsPorNome = new Map(catalogo.map((d) => [d.nome, d.id]));
  const disciplinasDaProposta = input.itens
    .map((i) => idsPorNome.get(i.disciplina))
    .filter((id): id is string => Boolean(id));

  const clausulas = await prisma.clausulaProposta.findMany({
    where: { ativo: true },
    select: { id: true, slug: true, secao: true, titulo: true, texto: true, disciplinaId: true, uf: true, ordem: true, ativo: true },
  });
  const resolucao = resolverSecoesDoModelo(modelo.secoesJson, clausulas);
  const avisos = resolucao.problemas.map(
    (p) => `A seção "${ROTULO_SECAO[p.secao]}" ficou em branco: cláusula ${p.clausulaSlug} ${p.motivo === "inativa" ? "está desativada" : "não existe"}.`,
  );
  const porSlug = new Map(clausulas.map((c) => [c.slug, c]));

  const secoes: (SecaoComposta & { ordem: number })[] = [];
  for (const s of resolucao.secoes) {
    if (s.secao === "escopo") {
      // ESCOPO é por disciplina: uma seção para cada disciplina contratada, com a variante certa
      // (da disciplina e da UF da obra). Sem disciplina contratada, entra a genérica do modelo.
      const escopos = disciplinasDaProposta
        .map((disciplinaId) => ({ disciplinaId, c: escolherClausula(clausulas, "escopo", disciplinaId, uf) }))
        .filter((x) => x.c);
      if (escopos.length > 0) {
        for (const [i, e] of escopos.entries()) {
          secoes.push({
            secao: "escopo",
            titulo: `${ROTULO_SECAO.escopo} — ${catalogo.find((d) => d.id === e.disciplinaId)?.nome ?? ""}`.trim(),
            texto: e.c!.texto,
            disciplinaId: e.disciplinaId,
            clausulaId: e.c!.id,
            ordem: s.ordem + i,
          });
        }
        continue;
      }
    }
    const origem = s.clausulaSlug ? porSlug.get(s.clausulaSlug) : undefined;
    secoes.push({
      secao: s.secao,
      titulo: s.titulo,
      texto: s.texto,
      disciplinaId: null,
      clausulaId: origem?.id ?? null,
      ordem: s.ordem,
    });
  }

  const parcelas = lerPagamentoDoModelo(modelo.pagamentoJson);
  const valores = calcularValoresVersao(input.itens, null);
  const validade = new Date();
  validade.setUTCDate(validade.getUTCDate() + modelo.validadeDias);

  const r = await prisma.$transaction(async (tx) => {
    const seq = await proximoNumeroProposta(tx);
    const criada = await tx.proposta.create({
      data: {
        ano: seq.ano,
        sequencial: seq.sequencial,
        numero: seq.numero,
        titulo: input.titulo.trim(),
        formato: "composta",
        modeloId: modelo.id,
        clienteId: negociacao.clienteId,
        negociacaoId: negociacao.id,
        leadId: negociacao.leadId,
        obraEndereco: input.obraEndereco?.trim() || null,
        obraCidade: input.obraCidade?.trim() || null,
        obraUF: uf,
        areaM2: input.areaM2 ?? null,
        validade: isoParaDataValidade(validade.toISOString().slice(0, 10)),
        token: randomBytes(18).toString("hex"),
        autorId,
      },
      select: { id: true, numero: true },
    });

    await tx.propostaItem.createMany({
      data: input.itens.map((it, idx) => ({
        propostaId: criada.id,
        disciplinaTextoLegado: it.disciplina,
        disciplinaId: idsPorNome.get(it.disciplina) ?? null,
        valor: it.valor,
        ordem: idx,
      })),
    });
    if (secoes.length > 0) {
      await tx.propostaSecao.createMany({
        data: secoes.map((s, idx) => ({
          propostaId: criada.id,
          secao: s.secao,
          titulo: s.titulo ?? null,
          texto: s.texto,
          disciplinaId: s.disciplinaId ?? null,
          clausulaId: s.clausulaId ?? null,
          ordem: idx,
        })),
      });
    }
    if (parcelas.length > 0) {
      await tx.propostaParcela.createMany({
        data: parcelas.map((p, idx) => ({
          propostaId: criada.id,
          descricao: p.descricao,
          percentual: p.percentual,
          prazo: p.prazo ?? null,
          ordem: idx,
        })),
      });
    }
    await tx.propostaVersao.create({
      data: {
        propostaId: criada.id,
        numero: 1,
        snapshot: snapshotComposta({
          titulo: input.titulo.trim(),
          itens: input.itens,
          secoes,
          parcelas,
        }),
        autorId,
        valorOriginal: valores.valorOriginal,
        valorVersao: valores.valorVersao,
        desconto: valores.desconto,
        status: "rascunho",
      },
    });
    return criada;
  });

  await registrarAtividade(
    { evento: "PROPOSTA_CRIADA", numero: r.numero, titulo: input.titulo.trim() },
    { autorId, clienteId: negociacao.clienteId, propostaId: r.id },
  );
  return { propostaId: r.id, numero: r.numero, avisos };
}

function snapshotComposta(dados: {
  titulo: string;
  itens: ItemComposta[];
  secoes: { secao: SecaoProposta; titulo?: string | null; texto: string }[];
  parcelas: ParcelaComposta[];
  desconto?: number | null;
  justificativaDesconto?: string | null;
}): Prisma.InputJsonValue {
  return {
    formato: "composta",
    titulo: dados.titulo,
    itens: dados.itens,
    secoes: dados.secoes.map((s) => ({ secao: s.secao, titulo: s.titulo ?? null, texto: s.texto })),
    parcelas: dados.parcelas,
    desconto: dados.desconto ?? null,
    justificativaDesconto: dados.justificativaDesconto ?? null,
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Salva a composta inteira (dados da obra, itens, seções e parcelas) e cria uma versão.
 *
 * **Rascunho pode não fechar 100%**: quem está montando adiciona uma parcela de cada vez, e
 * recusar no meio impediria salvar o trabalho. O plano é validado onde o número vira documento —
 * `garantirPropostaEnviavel`, chamada antes de enviar e antes de renderizar.
 */
export async function salvarPropostaComposta(
  input: {
    id: string;
    titulo: string;
    obraEndereco?: string;
    obraCidade?: string;
    obraUF?: string;
    areaM2?: number | null;
    validade?: string;
    observacoes?: string;
    itens: ItemComposta[];
    secoes: { secao: SecaoProposta; titulo?: string; texto: string; disciplinaId?: string | null; clausulaId?: string | null }[];
    parcelas: ParcelaComposta[];
    desconto?: number | null;
    justificativaDesconto?: string;
  },
  autorId: string,
): Promise<{ versao: number; somaPercentuais: number }> {
  const p = await prisma.proposta.findUnique({
    where: { id: input.id },
    select: { id: true, numero: true, formato: true, status: true, clienteId: true, versoes: { select: { numero: true } } },
  });
  if (!p) throw new ActionError("Proposta não encontrada.");
  if (p.formato !== "composta") throw new ActionError("Esta proposta não é composta — edite-a pelo caminho dela.");
  if (p.status === "aceita") throw new ActionError("Proposta aceita não pode ser editada.");
  if (input.itens.length === 0) throw new ActionError("Informe ao menos uma disciplina com valor.");

  const valores = calcularValoresVersao(input.itens, input.desconto ?? null);
  if (valores.valorVersao < 0) throw new ActionError("O desconto é maior que o valor da proposta.");
  const percentual = percentualDesconto(valores);
  const justificativa = input.justificativaDesconto?.trim() || null;
  if (percentual !== null) {
    const config = await getConfigComercial();
    if (exigeJustificativaDesconto(percentual, config) && !justificativa) {
      throw new ActionError(
        `Desconto de ${percentual.toFixed(1)}% acima do limite de ${config.descontoMaxSemJustificativa}% exige justificativa.`,
      );
    }
  }

  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  const idsPorNome = new Map(catalogo.map((d) => [d.nome, d.id]));
  const versao = proximoNumeroVersao(p.versoes);

  await prisma.$transaction(async (tx) => {
    await tx.proposta.update({
      where: { id: p.id },
      data: {
        titulo: input.titulo.trim(),
        obraEndereco: input.obraEndereco?.trim() || null,
        obraCidade: input.obraCidade?.trim() || null,
        obraUF: input.obraUF?.trim().toUpperCase() || null,
        areaM2: input.areaM2 ?? null,
        validade: isoParaDataValidade(input.validade ?? ""),
        observacoes: input.observacoes?.trim() || null,
      },
    });

    // Substituição completa das filhas: é o mesmo padrão de `salvarProposta` para itens — a tela
    // manda a lista inteira, e diferenciar linha a linha só criaria caminho para divergir.
    await tx.propostaItem.deleteMany({ where: { propostaId: p.id } });
    await tx.propostaItem.createMany({
      data: input.itens.map((it, idx) => ({
        propostaId: p.id,
        disciplinaTextoLegado: it.disciplina,
        disciplinaId: idsPorNome.get(it.disciplina) ?? null,
        valor: it.valor,
        ordem: idx,
      })),
    });
    await tx.propostaSecao.deleteMany({ where: { propostaId: p.id } });
    if (input.secoes.length > 0) {
      await tx.propostaSecao.createMany({
        data: input.secoes.map((s, idx) => ({
          propostaId: p.id,
          secao: s.secao,
          titulo: s.titulo?.trim() || null,
          texto: s.texto,
          disciplinaId: s.disciplinaId ?? null,
          clausulaId: s.clausulaId ?? null,
          ordem: idx,
        })),
      });
    }
    await tx.propostaParcela.deleteMany({ where: { propostaId: p.id } });
    if (input.parcelas.length > 0) {
      await tx.propostaParcela.createMany({
        data: input.parcelas.map((x, idx) => ({
          propostaId: p.id,
          descricao: x.descricao,
          percentual: x.percentual,
          prazo: x.prazo?.trim() || null,
          ordem: idx,
        })),
      });
    }

    await tx.propostaVersao.create({
      data: {
        propostaId: p.id,
        numero: versao,
        snapshot: snapshotComposta({
          titulo: input.titulo.trim(),
          itens: input.itens,
          secoes: input.secoes,
          parcelas: input.parcelas,
          desconto: valores.desconto,
          justificativaDesconto: justificativa,
        }),
        autorId,
        valorOriginal: valores.valorOriginal,
        valorVersao: valores.valorVersao,
        desconto: valores.desconto,
        status: p.status,
        validade: isoParaDataValidade(input.validade ?? ""),
        observacao: input.observacoes?.trim() || null,
      },
    });
  });

  return { versao, somaPercentuais: somaPercentuais(input.parcelas) };
}

/**
 * Porta única entre "rascunho" e "documento": recusa o que não pode virar proposta enviada.
 *
 * Chamada antes de enviar e antes de renderizar o documento. É aqui que o plano de pagamento
 * PRECISA fechar 100% — foi o plano que não fechava que cobrou R$ 4.750 a mais de um cliente.
 */
export async function garantirPropostaEnviavel(propostaId: string): Promise<void> {
  const p = await prisma.proposta.findUnique({
    where: { id: propostaId },
    select: {
      formato: true,
      itens: { select: { valor: true } },
      parcelas: { select: { descricao: true, percentual: true, prazo: true }, orderBy: { ordem: "asc" } },
      versoes: { orderBy: { numero: "desc" }, take: 1, select: { valorVersao: true } },
    },
  });
  if (!p) throw new ActionError("Proposta não encontrada.");
  if (p.formato !== "composta") return;
  if (p.itens.length === 0) throw new ActionError("A proposta não tem nenhuma disciplina com valor.");

  const total = p.versoes[0]?.valorVersao != null ? Number(p.versoes[0].valorVersao) : null;
  if (total === null || total <= 0) throw new ActionError("A proposta está sem valor total.");
  if (p.parcelas.length === 0) throw new ActionError("A proposta está sem plano de pagamento.");

  const r = calcularParcelas(
    total,
    p.parcelas.map((x) => ({ descricao: x.descricao, percentual: Number(x.percentual), prazo: x.prazo ?? undefined })),
  );
  if (!r.ok) throw new ActionError(r.mensagem);
}
