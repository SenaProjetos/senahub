import "server-only";
import { prisma } from "@/lib/prisma";
import { dadosEmpresa } from "@/modules/configuracoes/empresa/queries";
import { docSchemaZ, type DocSchema } from "@/modules/documentos/schema";
import { resolverTexto, type Escalar, type Linha } from "@/modules/documentos/tokens";
import { camposVaziosCitadosPeloModelo, montarDocumento } from "./documento";
import { modeloDocumentoProposta, NOME_MODELO_DOCUMENTO } from "./modelo-documento";
import { tokensNaoResolvidosProposta } from "./campos";
import { mensagemTokensNaoResolvidos } from "@/modules/juridico/contrato/campos";

/**
 * Carrega a proposta composta pronta para o Estúdio renderizar (ADR-0006, G5).
 *
 * ## Por que NÃO passa por `resolverModelo`/`podeVerFonte`
 *
 * A resolução de fontes do Estúdio exige um `viewer` e autoriza por fonte — desenhada para quem
 * monta relatório escolhendo qualquer fonte do sistema. Aqui não há usuário: o cliente abre pelo
 * TOKEN, e o token já é a autorização, para exatamente uma proposta. Inventar um viewer falso
 * seria abrir o gate por dentro; então esta função lê só a proposta do id recebido e monta o
 * contexto à mão. Quem chama é responsável por ter provado o direito (token ou permissão).
 *
 * ## Tokens dentro da cláusula
 *
 * O motor resolve `[Texto]` para o texto da seção, mas NÃO resolve de novo os tokens que vêm
 * dentro dele. Então a cláusula é resolvida aqui, com o bloqueio da G1: token sem valor não sai
 * em branco — vira impedimento e o documento não é publicado.
 */

export type DocumentoCarregado = {
  schema: DocSchema;
  escalar: Escalar;
  linhas: Linha[];
  porFonte: Record<string, { escalar: Escalar; linhas: Linha[] }>;
  /** Vazio = pode publicar. Com item = a página pública recusa e a prévia interna lista. */
  impedimentos: string[];
  numero: string;
  titulo: string;
  /** Modelo do Estúdio salvo não pôde ser lido e caiu no de fábrica (não impede publicar). */
  modeloDeFabrica: boolean;
};

export async function carregarDocumentoProposta(propostaId: string): Promise<DocumentoCarregado | null> {
  const p = await prisma.proposta.findUnique({
    where: { id: propostaId },
    include: {
      cliente: { select: { nome: true, documento: true } },
      itens: { orderBy: { ordem: "asc" }, include: { disciplina: { select: { nome: true } } } },
      secoes: { orderBy: { ordem: "asc" } },
      parcelas: { orderBy: { ordem: "asc" } },
      versoes: { orderBy: { numero: "desc" }, take: 1, select: { valorVersao: true, desconto: true } },
    },
  });
  if (!p || p.formato !== "composta") return null;

  const empresa = await dadosEmpresa();
  const vigente = p.versoes[0];
  const total =
    vigente?.valorVersao != null
      ? Number(vigente.valorVersao)
      : p.itens.reduce((s, i) => s + Number(i.valor), 0);

  const doc = montarDocumento(
    {
      numero: p.numero,
      titulo: p.titulo,
      clienteNome: p.cliente.nome,
      clienteDocumento: p.cliente.documento,
      obraEndereco: p.obraEndereco,
      obraCidade: p.obraCidade,
      obraUF: p.obraUF,
      areaM2: p.areaM2 != null ? Number(p.areaM2) : null,
      validade: p.validade,
      itens: p.itens.map((i) => ({
        disciplina: i.disciplina?.nome ?? i.disciplinaTextoLegado,
        valor: Number(i.valor),
      })),
      secoes: p.secoes.map((s) => ({ secao: s.secao, titulo: s.titulo, texto: s.texto })),
      parcelas: p.parcelas.map((x) => ({
        descricao: x.descricao,
        percentual: Number(x.percentual),
        prazo: x.prazo ?? undefined,
      })),
      total,
      desconto: vigente?.desconto != null ? Number(vigente.desconto) : null,
    },
    empresa,
    new Date(),
  );

  const impedimentos = [...doc.impedimentos];
  if (p.secoes.length === 0) impedimentos.push("A proposta está sem nenhuma seção de texto.");

  // Resolve os tokens DENTRO de cada cláusula, e bloqueia o que não resolve.
  const secoesResolvidas = doc.secoes.map((s, i) => {
    const texto = String(s.Texto ?? "");
    const problemas = tokensNaoResolvidosProposta(texto, doc.escalar);
    if (problemas.length > 0) {
      impedimentos.push(`Seção "${String(s.Titulo)}": ${mensagemTokensNaoResolvidos(problemas)}`);
      return { ...s, Texto: texto };
    }
    return { ...s, Texto: resolverTexto(texto, { escalar: doc.escalar, linhas: [] }), _i: i };
  });

  const salvo = await prisma.documentoModelo.findFirst({
    where: { nome: NOME_MODELO_DOCUMENTO, ativo: true },
    select: { schemaJson: true },
  });
  const parsed = salvo ? docSchemaZ.safeParse(salvo.schemaJson) : null;
  // Modelo salvo ilegível cai no de fábrica em vez de sair em branco — mesmo defeito que o
  // `docVazio()` do Estúdio produzia. A prévia interna diz que isso aconteceu.
  const schema = parsed?.success ? parsed.data : modeloDocumentoProposta();

  // O modelo também cita campos direto no layout (`Obra: [ObraEndereco] — [Cidade]/[UF]`). Sem
  // esta checagem o documento publicava "Obra:  — /" — a mesma lacuna do bloqueio de cláusula,
  // entrando pela porta do layout.
  const vaziosDoModelo = camposVaziosCitadosPeloModelo(schema, { ...doc, secoes: secoesResolvidas });
  if (vaziosDoModelo.length > 0) {
    impedimentos.push(`O documento cita campos que estão em branco: ${vaziosDoModelo.join(", ")}.`);
  }

  return {
    schema,
    escalar: doc.escalar,
    linhas: doc.linhas,
    porFonte: { "proposta-secoes": { escalar: {}, linhas: secoesResolvidas } },
    impedimentos,
    numero: p.numero,
    titulo: p.titulo,
    modeloDeFabrica: !parsed?.success,
  };
}
