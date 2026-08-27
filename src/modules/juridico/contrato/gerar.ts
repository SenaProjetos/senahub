import "server-only";
import { ActionError } from "@/lib/action-error";
import { acquireExecutionSlot } from "@/lib/execution-limit";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug } from "@/lib/storage";

/**
 * Geração de versão de contrato pelo Estúdio de Documentos (spec
 * `docs/superpowers/specs/2026-08-27-contratos-no-estudio.md`, Fases E2 e E6).
 *
 * O pipeline original da Fase B (`ModeloContrato` em texto puro → `montarHtml` → PDF) foi removido
 * na Fase E6: desde a E2 a UI chama `gerarVersaoDeModelo`, e a função antiga já estava órfã.
 *
 * `gerarPdfDoHtml` e `escaparHtml` NÃO eram do pipeline antigo e continuam aqui: quem os usa é o
 * **certificado de conclusão da assinatura** (`assinatura/certificado.ts` + a rota
 * `api/juridico/versoes/[id]/certificado`), que monta o próprio HTML e é gerado ao vivo, nunca
 * arquivado. Removê-los junto com o resto quebraria a prova de assinatura.
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

export type ResultadoGeracao = { versaoId: string; numero: number; caminho: string };

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
