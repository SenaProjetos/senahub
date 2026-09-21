import type { PrismaClient } from "../src/generated/prisma/client";
import { CLAUSULAS_INICIAIS, MODELOS_INICIAIS } from "../src/modules/comercial/proposta-composta/biblioteca-inicial";
import {
  modeloDocumentoProposta,
  NOME_MODELO_DOCUMENTO,
} from "../src/modules/comercial/proposta-composta/modelo-documento";

/**
 * Semeia a biblioteca de cláusulas e os modelos de proposta (ADR-0006, G3).
 *
 * **CREATE-ONLY POR SLUG**, pela mesma razão de `seedPerfisAcesso`: o `db:seed` roda em todo
 * deploy, e a gestão edita o texto das cláusulas na tela. Um `update` aqui desfaria a edição do
 * dono no deploy seguinte, em silêncio. Então: existe pelo slug → não toca em nada.
 *
 * **Como corrigir uma cláusula já publicada:** não é editando o texto em
 * `biblioteca-inicial.ts` — isso não teria efeito nenhum em quem já tem a linha. É slug novo
 * (`...-v2`), e a antiga é desativada na tela (ou por migration de dados, se for urgente).
 *
 * A disciplina é resolvida pelo NOME do catálogo. Catálogo sem aquela disciplina → a cláusula
 * entra sem FK (vale para a seção inteira) e o fato é relatado: é melhor uma cláusula genérica
 * a mais do que a semente falhar o deploy inteiro por causa de um nome de catálogo.
 */
export async function seedPropostaComposta(prisma: PrismaClient): Promise<{
  clausulasCriadas: number;
  clausulasExistentes: number;
  modelosCriados: number;
  modelosExistentes: number;
  documentoCriado: boolean;
  disciplinasNaoEncontradas: string[];
}> {
  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  const idPorNome = new Map(catalogo.map((d) => [d.nome, d.id]));
  const disciplinasNaoEncontradas: string[] = [];

  let clausulasCriadas = 0;
  let clausulasExistentes = 0;
  for (const c of CLAUSULAS_INICIAIS) {
    const existente = await prisma.clausulaProposta.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (existente) {
      clausulasExistentes++;
      continue;
    }
    let disciplinaId: string | null = null;
    if (c.disciplina) {
      disciplinaId = idPorNome.get(c.disciplina) ?? null;
      if (!disciplinaId && !disciplinasNaoEncontradas.includes(c.disciplina)) {
        disciplinasNaoEncontradas.push(c.disciplina);
      }
    }
    await prisma.clausulaProposta.create({
      data: {
        slug: c.slug,
        secao: c.secao,
        titulo: c.titulo,
        texto: c.texto,
        disciplinaId,
        uf: c.uf ?? null,
        ordem: c.ordem,
      },
    });
    clausulasCriadas++;
  }

  let modelosCriados = 0;
  let modelosExistentes = 0;
  for (const m of MODELOS_INICIAIS) {
    const existente = await prisma.modeloProposta.findUnique({ where: { slug: m.slug }, select: { id: true } });
    if (existente) {
      modelosExistentes++;
      continue;
    }
    await prisma.modeloProposta.create({
      data: {
        slug: m.slug,
        nome: m.nome,
        familia: m.familia,
        descricao: m.descricao,
        secoesJson: m.secoes,
        pagamentoJson: m.pagamento,
        validadeDias: m.validadeDias,
      },
    });
    modelosCriados++;
  }

  // Layout do documento no Estúdio. Create-only pelo NOME (o `DocumentoModelo` não tem slug):
  // quem ajustar o layout no canvas não perde o ajuste no deploy seguinte.
  const jaTem = await prisma.documentoModelo.findFirst({ where: { nome: NOME_MODELO_DOCUMENTO }, select: { id: true } });
  let documentoCriado = false;
  if (!jaTem) {
    await prisma.documentoModelo.create({
      data: {
        nome: NOME_MODELO_DOCUMENTO,
        descricao: "Layout da proposta composta (ADR-0006). Faixas em fluxo: a cláusula longa não é cortada.",
        tipo: "proposta",
        fonte: "proposta",
        schemaJson: modeloDocumentoProposta() as unknown as object,
      },
    });
    documentoCriado = true;
  }

  return { clausulasCriadas, clausulasExistentes, modelosCriados, modelosExistentes, disciplinasNaoEncontradas, documentoCriado };
}
