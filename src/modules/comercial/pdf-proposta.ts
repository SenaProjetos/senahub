/**
 * PDF da proposta: geração ao vivo e arquivamento imutável por versão (F5.13).
 *
 * ── Por que existe um arquivo só para isto ──────────────────────────────────────────────────
 * A geração morava inline em `/api/t/proposta/[token]/pdf/route.ts`. Agora ela tem DOIS
 * chamadores — a rota pública e o arquivamento no envio — e um deles precisa rodar de dentro de
 * uma Server Action. Duplicar o `puppeteer.launch` nos dois lugares deixaria as configurações de
 * página (margens, `printBackground`) divergirem sem ninguém notar, e o PDF arquivado ficaria
 * diferente do que o cliente baixa.
 *
 * ── O gerador é INJETÁVEL, e isso não é excesso de zelo ─────────────────────────────────────
 * `gerarPdfDaPaginaPublica` faz `page.goto("http://localhost:PORT/a/proposta/…")`: exige o Next
 * NO AR. Um smoke roda sob `tsx` puro, sem servidor — então testar o arquivamento exigiria
 * subir a aplicação inteira, ou não testar. Com o gerador injetado, o smoke prova o que de fato
 * importa (grava o arquivo, carimba o caminho, o download devolve o byte antigo depois de a
 * proposta mudar) sem depender do Chrome. Mesmo padrão do `spawn` injetável de
 * `modules/coordenacao/conversao.ts`.
 */
import "server-only";
import { acquireExecutionSlot } from "@/lib/execution-limit";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, lerArquivo, existeArquivo } from "@/lib/storage";
import { versaoVigente } from "@/modules/comercial/versoes";

/** Gera o PDF a partir da página pública, ao vivo. Exige `CHROME_PATH` e o servidor no ar. */
export async function gerarPdfDaPaginaPublica(token: string): Promise<Buffer> {
  const chrome = process.env.CHROME_PATH;
  if (!chrome) throw new Error("CHROME_PATH não configurado no servidor.");

  const puppeteer = (await import("puppeteer-core")).default;
  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}/a/proposta/${token}`;

  const liberar = await acquireExecutionSlot({ name: "puppeteer-pdf", maximum: 2, maximumQueue: 8, queueTimeoutMs: 45_000 });
  try {
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
      await page.emulateMediaType("print");
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } finally {
    liberar();
  }
}

export type ResultadoArquivamento =
  | { arquivado: true; versao: number; caminho: string; tamanho: number }
  | { arquivado: false; motivo: string };

/**
 * Congela o PDF da versão VIGENTE de uma proposta. Chamado no ENVIO — os dois caminhos
 * (`mudarStatusProposta` para "enviada" e `enviarPropostaEmail`) passam por aqui.
 *
 * **Nunca lança.** Um PDF que não gerou não pode impedir o envio de uma proposta: o e-mail já
 * saiu, ou o status já mudou, e derrubar a operação por causa do arquivo deixaria o usuário sem
 * entender o que aconteceu. Devolve o motivo para quem quiser registrar — mesmo princípio de
 * `registrarAtividade`, que também engole a própria falha de propósito.
 *
 * **Idempotente:** versão que já tem PDF não regera. Reenviar a mesma versão devolve
 * `arquivado: false` com motivo — o documento que o cliente recebeu da primeira vez continua
 * sendo o que está guardado, que é justamente o ponto de ser imutável.
 */
export async function arquivarPdfDaVersao(
  propostaId: string,
  opts: { gerar?: (token: string) => Promise<Buffer> } = {},
): Promise<ResultadoArquivamento> {
  const gerar = opts.gerar ?? gerarPdfDaPaginaPublica;
  try {
    const p = await prisma.proposta.findUnique({
      where: { id: propostaId },
      select: {
        token: true,
        versoes: { select: { id: true, numero: true, pdfPath: true } },
      },
    });
    if (!p) return { arquivado: false, motivo: "Proposta não encontrada." };

    const vigente = versaoVigente(p.versoes);
    if (!vigente) return { arquivado: false, motivo: "Proposta ainda não tem versão salva." };
    if (vigente.pdfPath) {
      return { arquivado: false, motivo: `A versão ${vigente.numero} já tem PDF arquivado.` };
    }

    const buffer = await gerar(p.token);
    // Caminho por VERSÃO, não por proposta: duas versões da mesma proposta são dois documentos
    // diferentes e precisam coexistir. O id da versão evita colisão sem depender do número.
    const caminho = `comercial/propostas/${propostaId}/v${vigente.numero}-${vigente.id}.pdf`;
    const salvo = await salvarArquivo(caminho, buffer);

    await prisma.propostaVersao.update({
      where: { id: vigente.id },
      data: {
        pdfPath: salvo.caminho,
        pdfHashSha256: salvo.hashSha256,
        pdfTamanho: salvo.tamanho,
      },
    });

    return { arquivado: true, versao: vigente.numero, caminho: salvo.caminho, tamanho: salvo.tamanho };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Falha ao arquivar o PDF.";
    console.error(`[proposta] falha ao arquivar PDF de ${propostaId}:`, e);
    return { arquivado: false, motivo };
  }
}

/**
 * O PDF que deve ser servido no link PÚBLICO: o arquivado **da versão vigente**, quando ela
 * tiver um.
 *
 * ⚠️ A ordem importa, e a primeira versão desta função errava nela: escolher a vigente **entre
 * as que têm PDF** faria uma proposta enviada na v1 e depois editada (v2, ainda não enviada)
 * servir o PDF da v1 enquanto a PÁGINA pública mostra a v2. O cliente veria um preço na tela e
 * outro no documento — pior que qualquer um dos dois sozinho. Foi o smoke que pegou isso.
 *
 * Regra correta: pega a vigente de verdade (maior número, tendo PDF ou não) e só devolve se ELA
 * estiver arquivada. Assim o PDF nunca discorda da tela: ou é o congelado da versão que está no
 * ar, ou é a renderização ao vivo dela.
 *
 * `null` = cai no ao-vivo, como sempre funcionou. É esse fallback que mantém propostas
 * anteriores à F5.13 (e as nunca enviadas) idênticas, sem backfill. Também devolve `null` se o
 * arquivo sumiu do disco: preferir o ao-vivo a um 500 é o certo — o cliente quer o documento,
 * não um erro sobre storage.
 */
export async function pdfArquivadoDaProposta(
  propostaId: string,
): Promise<{ buffer: Buffer; versao: number } | null> {
  const versoes = await prisma.propostaVersao.findMany({
    where: { propostaId },
    select: { numero: true, pdfPath: true },
  });
  const vigente = versaoVigente(versoes);
  if (!vigente?.pdfPath) return null;
  if (!(await existeArquivo(vigente.pdfPath))) return null;
  return { buffer: await lerArquivo(vigente.pdfPath), versao: vigente.numero };
}

/** O PDF arquivado de UMA versão específica (tela interna de comparação de versões). */
export async function pdfArquivadoDaVersao(
  propostaId: string,
  numero: number,
): Promise<{ buffer: Buffer; versao: number } | null> {
  const v = await prisma.propostaVersao.findFirst({
    where: { propostaId, numero },
    select: { numero: true, pdfPath: true },
  });
  if (!v?.pdfPath || !(await existeArquivo(v.pdfPath))) return null;
  return { buffer: await lerArquivo(v.pdfPath), versao: v.numero };
}
