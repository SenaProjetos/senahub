import "server-only";
import { ActionError } from "@/lib/action-error";
import { acquireExecutionSlot } from "@/lib/execution-limit";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug } from "@/lib/storage";
import { resolverTexto } from "@/modules/documentos/tokens";
import {
  camposDaProposta,
  camposDoVinculo,
  catalogo,
  mensagemTokensNaoResolvidos,
  montarEnderecoCliente,
  tokensNaoResolvidos,
} from "./campos";

/**
 * Geração de versão de contrato a partir de um `ModeloContrato` (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase B).
 *
 * Fluxo: dados → escalar puro (`campos.ts`) → `resolverTexto` (motor do Estúdio) → validação de
 * tokens → HTML → PDF → arquivo → `DocJuridicoVersao`.
 *
 * ## O gerador é injetável
 * Mesmo motivo declarado em `modules/comercial/pdf-proposta.ts`: puppeteer exige `CHROME_PATH` e
 * um binário de verdade, então sem injeção não dá para exercitar o resto (mapeamento de campos,
 * criação de versão, mudança de status) sem Chrome instalado.
 *
 * ## Diferença para o PDF da proposta: `setContent`, não `page.goto`
 * O PDF da proposta renderiza a PÁGINA PÚBLICA e por isso precisa do Next no ar. Contrato gerado
 * de modelo não tem página nenhuma — o HTML nasce aqui, então `setContent` resolve e o gerador
 * não herda a dependência do servidor.
 */

/** PDF de um HTML pronto. Exige `CHROME_PATH`; NÃO exige o servidor no ar. */
export async function gerarPdfDoHtml(html: string): Promise<Buffer> {
  const chrome = process.env.CHROME_PATH;
  // Mensagem de negócio: quem clicou "gerar contrato" não deve receber stack trace de env.
  if (!chrome) throw new ActionError("Geração de PDF indisponível: CHROME_PATH não configurado no servidor.");

  const puppeteer = (await import("puppeteer-core")).default;
  // Mesmo limite do PDF da proposta — um segundo ponto de launch sem limite anularia o primeiro.
  const liberar = await acquireExecutionSlot({
    name: "puppeteer-pdf",
    maximum: 2,
    maximumQueue: 8,
    queueTimeoutMs: 45_000,
  });
  try {
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await page.emulateMediaType("print");
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } finally {
    liberar();
  }
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Empacota o texto já resolvido num HTML de impressão.
 *
 * ORDEM IMPORTA: resolver tokens → escapar → montar. O `conteudo` do `ModeloContrato` é digitado
 * num textarea, texto puro — uma cláusula com "&" ou "<", ou uma razão social com "&", viraria
 * markup quebrado se fosse injetada crua. Escapar ANTES de resolver seria igualmente errado:
 * escaparia os colchetes dos tokens.
 */
export function montarHtml(titulo: string, corpoResolvido: string): string {
  const paragrafos = corpoResolvido
    .split(/\n{2,}/)
    .map((bloco) => bloco.trim())
    .filter(Boolean)
    .map((bloco) => `<p>${escaparHtml(bloco).replace(/\n/g, "<br />")}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escaparHtml(titulo)}</title>
<style>
  @page { size: A4; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.6; color: #111; }
  h1 { font-size: 14pt; text-align: center; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 24px; }
  p { margin: 0 0 12px; text-align: justify; }
</style>
</head>
<body>
<h1>${escaparHtml(titulo)}</h1>
${paragrafos}
</body>
</html>`;
}

export type ResultadoGeracao = { versaoId: string; numero: number; caminho: string };

/**
 * Gera uma nova versão do contrato preenchendo o modelo com os dados do próprio documento.
 *
 * Quem chama já garantiu a permissão — inclusive o gate de RH, que precisa vir ANTES daqui,
 * porque o escalar de um contrato de equipe carrega CPF, RG e salário.
 */
export async function gerarVersaoDeModelo(
  entrada: { documentoId: string; modeloId: string; autorId: string },
  opts: { gerar?: (html: string) => Promise<Buffer> } = {},
): Promise<ResultadoGeracao> {
  const gerar = opts.gerar ?? gerarPdfDoHtml;

  const doc = await prisma.documentoJuridico.findUnique({
    where: { id: entrada.documentoId },
    include: {
      versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } },
      vinculo: { include: { user: true, pj: true } },
      proposta: { include: { cliente: true, projeto: { select: { codigo: true } } } },
    },
  });
  if (!doc) throw new ActionError("Documento não encontrado.");

  const modelo = await prisma.modeloContrato.findUnique({ where: { id: entrada.modeloId } });
  if (!modelo) throw new ActionError("Modelo não encontrado.");
  if (!modelo.conteudo.trim()) throw new ActionError("O modelo está vazio — escreva as cláusulas antes de gerar.");

  const dadosContrato = {
    titulo: doc.titulo,
    valor: doc.valor ? doc.valor.toNumber() : null,
    dataVencimento: doc.dataVencimento,
  };

  let escalar;
  let tipo: "equipe" | "cliente";
  if (doc.vinculo) {
    tipo = "equipe";
    const v = doc.vinculo;
    escalar = camposDoVinculo(
      {
        contratacao: v.contratacao,
        setor: v.setor,
        cargo: v.cargo,
        // Decimal do Prisma nunca entra no motor de formatação — vira número na fronteira.
        cargaSemanal: v.cargaSemanal ? v.cargaSemanal.toNumber() : null,
        remuneracao: v.remuneracao ? v.remuneracao.toNumber() : null,
        dataInicio: v.dataInicio,
        dataFim: v.dataFim,
        user: {
          ...v.user,
          // Cache contratual vigente — ver o comentário em `camposDoVinculo`. Decimal vira número
          // aqui, na fronteira, como todo o resto.
          salarioBase: v.user.salarioBase ? v.user.salarioBase.toNumber() : null,
          cargo: v.user.cargo,
        },
        pj: v.pj ? { razaoSocial: v.pj.razaoSocial, cnpj: v.pj.cnpj, nomeFantasia: v.pj.nomeFantasia } : null,
      },
      dadosContrato,
    );
  } else if (doc.proposta) {
    tipo = "cliente";
    const p = doc.proposta;
    escalar = camposDaProposta(
      {
        numero: p.numero,
        titulo: p.titulo,
        valor: doc.valor ? doc.valor.toNumber() : null,
        areaM2: p.areaM2 ? p.areaM2.toNumber() : null,
        cliente: {
          nome: p.cliente.nome,
          documento: p.cliente.documento,
          email: p.cliente.email,
          telefone: p.cliente.telefone,
          endereco: montarEnderecoCliente(p.cliente),
        },
        projetoCodigo: p.projeto?.codigo ?? null,
      },
      dadosContrato,
    );
  } else {
    throw new ActionError("Este documento não está ligado a um vínculo nem a uma proposta — não há dados para preencher.");
  }

  // Bloqueia ANTES de gerar arquivo: contrato com cláusula em branco é pior que erro, porque é
  // entregável. Ver o comentário de `tokensNaoResolvidos`.
  const pendentes = tokensNaoResolvidos(modelo.conteudo, escalar, catalogo(tipo));
  if (pendentes.length > 0) {
    throw new ActionError(`Não dá para gerar o contrato. ${mensagemTokensNaoResolvidos(pendentes)}`);
  }

  const corpo = resolverTexto(modelo.conteudo, { escalar, linhas: [] });
  const pdf = await gerar(montarHtml(doc.titulo, corpo));

  const numero = (doc.versoes[0]?.numero ?? 0) + 1;
  const nomeArquivo = `${slug(doc.titulo)}-v${numero}.pdf`;
  const salvo = await salvarArquivo(
    // Mesma convenção de caminho do upload manual, senão o download da versão não acha o arquivo.
    `juridico/${slug(doc.titulo)}_${doc.id.slice(0, 6)}/v${numero}_${nomeArquivo}`,
    pdf,
  );

  const versao = await prisma.$transaction(async (tx) => {
    const criada = await tx.docJuridicoVersao.create({
      data: {
        documentoId: doc.id,
        numero,
        arquivoPath: salvo.caminho,
        arquivoNome: nomeArquivo,
        autorId: entrada.autorId,
      },
    });

    // Versão nova SUPERSEDE a assinada: o aceite e a trilha da versão anterior continuam
    // intactos (são por versão, não por documento), mas o documento não pode seguir dizendo
    // "assinado" enquanto a versão vigente não tem assinatura nenhuma. Volta a aguardar.
    if (doc.statusContrato === "assinado") {
      await tx.documentoJuridico.update({
        where: { id: doc.id },
        data: { statusContrato: "aguardando_assinatura" },
      });
    }

    return criada;
  });

  return { versaoId: versao.id, numero, caminho: salvo.caminho };
}
