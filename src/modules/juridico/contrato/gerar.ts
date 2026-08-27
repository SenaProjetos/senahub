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
 * Geração de versão de contrato — DUAS gerações convivendo (spec
 * `docs/superpowers/specs/2026-08-27-contratos-no-estudio.md`, Fase E2):
 *
 *  - `gerarVersaoDeModelo` (ATIVA): usa o Estúdio de Documentos — layout visual, timbrado,
 *    formatação, bloco de assinatura. É o que a UI chama desde a Fase E2.
 *  - `gerarVersaoDeModeloTextoPuro` (DEPRECADA): o pipeline original da Fase B —
 *    `ModeloContrato` em texto puro → `montarHtml` → `gerarPdfDoHtml`. Fica só até a Fase E6
 *    (migração destrutiva, conferida contra produção antes de remover). `escaparHtml` e
 *    `montarHtml` continuam exportados porque `assinatura/certificado.ts` os reusa — não são
 *    exclusivos do pipeline antigo.
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
 * DEPRECADA (Fase E6 remove) — pipeline original da Fase B: `ModeloContrato` em texto puro.
 * Mantida só para não quebrar `ModeloContrato` enquanto ele não for removido do banco.
 *
 * Quem chama já garantiu a permissão — inclusive o gate de RH, que precisa vir ANTES daqui,
 * porque o escalar de um contrato de equipe carrega CPF, RG e salário.
 */
export async function gerarVersaoDeModeloTextoPuro(
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
    clausulasAdicionais: doc.clausulasAdicionais,
    // Pipeline deprecado (texto puro) não busca a trilha de assinatura — `[UltimaAssinaturaResumo]`
    // (Fase E7b/M3) só existe no caminho novo, via `resolverFonteContrato`.
    ultimaAssinaturaResumo: null,
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

// ── Fase E2: geração via Estúdio de Documentos ──────────────────────────────────────────────

export type CriarDocumentoGerado = (
  modeloId: string,
  params: Record<string, string>,
) => Promise<{ id: string; numero: string }>;

export type ObterPdfDoGerado = (documentoGeradoId: string) => Promise<Buffer>;

/**
 * `registrarDocumentoGerado` (Server Action de `documentos/actions.ts`) chamada como função — não
 * refeita aqui. Ela já faz TUDO que este passo precisa: resolve a fonte com o gate por registro
 * (`resolverFonte` → `fonte.ts`), monta o snapshot imutável e numera. Reescrever essa lógica seria
 * a mesma duplicação que a Fase E1 evitou ao delegar o escalar para `campos.ts`.
 *
 * `getSession()` (chamado dentro dela) é `cache()` por request — chamar de dentro de outra Server
 * Action no MESMO request não paga uma consulta de sessão extra.
 */
const criarDocumentoGeradoPadrao: CriarDocumentoGerado = async (modeloId, params) => {
  const { registrarDocumentoGerado } = await import("@/modules/documentos/actions");
  const r = await registrarDocumentoGerado({ modeloId, params });
  if (!r.ok) throw new ActionError(r.error);
  return r.data;
};

/**
 * Aciona a geração do PDF do `DocumentoGerado` e devolve os BYTES da resposta — não o
 * `arquivoPath` gravado no banco.
 *
 * ⚠️ Duas razões para usar o corpo da resposta, não reler o arquivo depois:
 *
 * 1. **A persistência é best-effort.** A rota (`api/documentos/gerados/[id]/pdf`) só grava
 *    `arquivoPath` "se `STORAGE_BASE_PATH` estiver configurado" e ENGOLE a falha de escrita
 *    ("Falha ao salvar não impede download") — ler o campo depois arriscaria `null` mesmo com o
 *    PDF gerado com sucesso.
 * 2. **O caminho que ela grava é ABSOLUTO** (`path.join(STORAGE_BASE_PATH, "documentos", ...)`
 *    via `fs` cru), enquanto todo o resto do sistema — inclusive `lerArquivo`/`salvarArquivo` que
 *    a cadeia de assinatura usa — trabalha com caminho RELATIVO validado por `resolverCaminho()`.
 *    Misturar as duas convenções é dívida (M4, Fase E7a); aqui ela é contornada copiando os bytes
 *    para a convenção do jurídico, sem depender do caminho que a rota gravou.
 *
 * Mesmo padrão de auto-fetch com cookie repassado que `enviarDocumentoPorEmail`
 * (`documentos/actions.ts`) já usa para chegar num PDF a partir de uma Server Action.
 */
const obterPdfDoGeradoPadrao: ObterPdfDoGerado = async (documentoGeradoId) => {
  const { headers } = await import("next/headers");
  const cookie = (await headers()).get("cookie") ?? "";
  const port = process.env.PORT || "3000";
  const resp = await fetch(`http://localhost:${port}/api/documentos/gerados/${documentoGeradoId}/pdf`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  if (resp.status === 503) throw new ActionError("Geração de PDF indisponível: CHROME_PATH não configurado no servidor.");
  if (!resp.ok) throw new ActionError("Falha ao gerar o PDF do contrato.");
  return Buffer.from(await resp.arrayBuffer());
};

/**
 * Gera uma nova versão do contrato a partir de um `DocumentoModelo` do Estúdio (fonte `contrato`).
 *
 * Quem chama já garantiu a permissão — inclusive o gate de RH, que precisa vir ANTES daqui, porque
 * o escalar de um contrato de equipe carrega CPF, RG e salário. `resolverFonteContrato` roda de
 * novo aqui como SEGUNDA camada (o mesmo gate que `registrarDocumentoGerado` já aplica por dentro):
 * redundante de propósito — é exatamente a defesa em profundidade que a Fase E1 justificou para
 * `resolverFonte` exigir `viewer` obrigatório.
 */
export async function gerarVersaoDeModelo(
  entrada: { documentoId: string; modeloId: string; viewer: { id: string; role: string } },
  opts: { criarDocumentoGerado?: CriarDocumentoGerado; obterPdf?: ObterPdfDoGerado } = {},
): Promise<ResultadoGeracao> {
  const criarDocumentoGerado = opts.criarDocumentoGerado ?? criarDocumentoGeradoPadrao;
  const obterPdf = opts.obterPdf ?? obterPdfDoGeradoPadrao;

  const doc = await prisma.documentoJuridico.findUnique({
    where: { id: entrada.documentoId },
    select: { id: true, titulo: true, statusContrato: true, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } },
  });
  if (!doc) throw new ActionError("Documento não encontrado.");

  const modelo = await prisma.documentoModelo.findUnique({
    where: { id: entrada.modeloId },
    select: { id: true, tipo: true, fonte: true, ativo: true },
  });
  if (!modelo) throw new ActionError("Modelo não encontrado.");
  if (modelo.tipo !== "contrato") throw new ActionError("Este modelo não é do tipo contrato.");
  if (!modelo.ativo) throw new ActionError("Este modelo está arquivado.");
  if (modelo.fonte !== "contrato") {
    throw new ActionError('Este modelo precisa ter "Contrato" como fonte primária no Estúdio.');
  }

  // Falha fechado ANTES de criar qualquer coisa: contrato bloqueado (equipe + não-RH) ou sem
  // âncora nenhuma não deve nem chegar a gerar um `DocumentoGerado`.
  const { resolverFonteContrato, contratoTemDados } = await import("./fonte");
  const dadosFonte = await resolverFonteContrato(entrada.documentoId, entrada.viewer);
  if (!contratoTemDados(dadosFonte)) {
    throw new ActionError("Não há dados para preencher este contrato — verifique se ele está ligado a um vínculo, proposta ou cliente.");
  }

  const gerado = await criarDocumentoGerado(modelo.id, { contratoId: entrada.documentoId });
  const pdf = await obterPdf(gerado.id);

  const numero = (doc.versoes[0]?.numero ?? 0) + 1;
  const nomeArquivo = `${slug(doc.titulo)}-v${numero}.pdf`;
  const salvo = await salvarArquivo(
    // Mesma convenção do upload manual e do pipeline antigo — download da versão depende disto.
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
        autorId: entrada.viewer.id,
        documentoGeradoId: gerado.id,
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
