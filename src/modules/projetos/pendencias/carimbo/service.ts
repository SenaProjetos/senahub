import "server-only";
import fs from "node:fs/promises";
import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { resolverCaminho } from "@/lib/storage";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
import {
  lerMarcacao,
  caminhoNuvem,
  abasSeta,
  HEX_COR_RABISCO,
  type CorFixaRabisco,
  type Marcacao,
} from "@/modules/projetos/pendencias/marcacao";
import { formatarMedida } from "@/modules/projetos/pendencias/medicao";
import { SEVERIDADE_LABEL, contaComoTrabalho, type Severidade } from "@/modules/projetos/pendencias/helpers";
import { anguloTextoEmPe, caixaPdf, normalizarRotacao, paraPdf, posicaoRotuloCota } from "@/modules/projetos/pendencias/carimbo/coords";

/**
 * PDF carimbado (itens 20 e 25) — desenha os apontamentos SOBRE o PDF original e acrescenta o
 * bloco de "análise" que R10 pediu, para a obra não executar a revisão errada.
 *
 * É a única capacidade do sistema que EDITA um PDF existente: o `puppeteer-core` das outras
 * ~13 rotas gera PDF novo a partir de HTML, que não serve aqui. Daí a dependência `pdf-lib`.
 *
 * **As posições vêm do CLIENTE, de propósito.** O viewer relocaliza pinos herdados pela âncora
 * textual (item 3) usando o texto extraído pelo pdf.js — cálculo que só existe no navegador. Se
 * o servidor carimbasse o `x`/`y` cru do banco, a folha impressa mostraria o pino num lugar e a
 * tela em outro: justamente a divergência que este item existe pra evitar. O cliente manda só a
 * POSIÇÃO; texto, número, status e classificação continuam vindo do banco, e cada id é conferido
 * contra o documento antes de entrar.
 */

const COR_STATUS: Record<string, ReturnType<typeof rgb>> = {
  aberta: rgb(0.85, 0.47, 0.03),
  resolvida: rgb(0.15, 0.45, 0.85),
  fechada: rgb(0.09, 0.55, 0.28),
  descartada: rgb(0.45, 0.45, 0.45),
};
const PRETO = rgb(0.1, 0.1, 0.1);

/** Hex `#rrggbb` → cor do pdf-lib. Só para `HEX_COR_RABISCO` (espelho do globals.css). */
function rgbDeHex(hex: string): ReturnType<typeof rgb> {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Cores fixas do rabisco no PDF — as mesmas da tela (`--marcacao-*`). */
const COR_RABISCO_PDF = Object.fromEntries(
  Object.entries(HEX_COR_RABISCO).map(([k, hex]) => [k, rgbDeHex(hex)]),
) as Record<CorFixaRabisco, ReturnType<typeof rgb>>;
const BRANCO = rgb(1, 1, 1);
/** Aberto E impeditivo sai em vermelho — na folha que vai pra obra, é o que não pode passar batido. */
const COR_IMPEDITIVO = rgb(0.79, 0.09, 0.12);

/**
 * As fontes padrão do PDF (Helvetica) usam WinAnsi, que cobre o português acentuado mas não
 * o universo inteiro do Unicode — e `drawText` LANÇA em caractere fora da tabela. Nome de
 * projeto/pessoa/arquivo vem de dado do usuário, então passa por aqui: acento fica, o que não
 * couber vira "?" em vez de derrubar a exportação inteira.
 */
function seguroWinAnsi(s: string): string {
  return [...s].map((ch) => (ch.charCodeAt(0) <= 0xff || "‘’“”–—•€".includes(ch) ? ch : "?")).join("");
}

export type PosicaoPin = { id: string; pagina: number; x: number; y: number };

export type ResultadoCarimbo = { pdf: Uint8Array; nomeArquivo: string; total: number } | { erro: string };

/**
 * Fator de escala do desenho em função do tamanho da folha. Um pino de 9pt é razoável num A4
 * e some numa prancha A1 (1684pt de lado curto) — na tela ele ocupa ~2,7% da largura, no papel
 * ocuparia 0,4%. Escala pelo lado CURTO (o que limita a leitura) com piso e teto, pra não ficar
 * ridículo em nenhum dos dois extremos.
 */
function escalaFolha(largura: number, altura: number): number {
  const curto = Math.min(largura, altura);
  return Math.min(2.6, Math.max(1, curto / 620));
}

/** Uma linha do bloco de carimbo — separado do desenho pra caber sem estourar a moldura. */
function desenharBloco(
  pagina: PDFPage,
  linhasBrutas: { texto: string; negrito?: boolean; cor?: ReturnType<typeof rgb> }[],
  fontes: { normal: PDFFont; negrito: PDFFont },
  rot: number,
) {
  const linhas = linhasBrutas.map((l) => ({ ...l, texto: seguroWinAnsi(l.texto) }));
  const { width: W, height: H } = pagina.getSize();
  const k = escalaFolha(W, H);
  const CORPO = 8 * k;
  const TITULO = 9 * k;
  const ENTRE = 11 * k;
  const PAD = 8 * k;
  const larguraTexto = Math.max(
    ...linhas.map((l) => (l.negrito ? fontes.negrito : fontes.normal).widthOfTextAtSize(l.texto, l.negrito ? TITULO : CORPO)),
  );
  const bw = larguraTexto + PAD * 2;
  const bh = linhas.length * ENTRE + PAD * 2 - 3 * k;
  const MARGEM = 14 * k;

  // Canto inferior ESQUERDO visual, não o direito: o direito é onde mora o selo do próprio
  // CAD (título, revisão, escala) em praticamente toda prancha de projeto — carimbar ali
  // taparia justamente a informação que este bloco quer corroborar. Verificado numa A1 real.
  // Como o desenho acontece no espaço não rotacionado, o canto vem da mesma função dos pinos
  // em vez de assumir o canto da MediaBox: numa prancha /Rotate 270 os dois não coincidem.
  const cantoVisual = paraPdf(0, 1, W, H, normalizarRotacao(rot));
  const anguloGraus = anguloTextoEmPe(normalizarRotacao(rot));
  const ang = (anguloGraus * Math.PI) / 180;
  // Vetores unitários dos eixos VISUAIS já expressos no espaço da página (dirY aponta pra BAIXO).
  const dirX = { x: Math.cos(ang), y: Math.sin(ang) };
  const dirY = { x: Math.sin(ang), y: -Math.cos(ang) };
  // Origem = canto inferior-esquerdo do bloco: anda pra dentro no eixo X e pra cima no Y.
  const ox = cantoVisual.x + dirX.x * MARGEM - dirY.x * MARGEM;
  const oy = cantoVisual.y + dirX.y * MARGEM - dirY.y * MARGEM;

  pagina.drawRectangle({
    x: ox,
    y: oy,
    width: bw,
    height: bh,
    color: BRANCO,
    opacity: 0.93,
    borderColor: PRETO,
    borderWidth: 0.8 * k,
    rotate: degrees(anguloGraus),
  });

  linhas.forEach((l, i) => {
    const tamanho = l.negrito ? TITULO : CORPO;
    // Desce a partir do topo do bloco, no eixo VISUAL (por isso soma em dirY, não em -y).
    const dy = bh - PAD - tamanho - i * ENTRE;
    pagina.drawText(l.texto, {
      x: ox + dirX.x * PAD + dirY.x * -dy,
      y: oy + dirX.y * PAD + dirY.y * -dy,
      size: tamanho,
      font: l.negrito ? fontes.negrito : fontes.normal,
      color: l.cor ?? PRETO,
      rotate: degrees(anguloGraus),
    });
  });
}

/**
 * Desenha uma marcação vetorial (item 9) no espaço do PDF. Exportada para poder ser conferida
 * isolada (uma página em branco, sem banco nem storage) — o eixo Y invertido do PDF é o erro
 * clássico aqui, e só aparece olhando o resultado.
 */
export function desenharMarcacao(
  pagina: PDFPage,
  m: Marcacao,
  x: number,
  y: number,
  cor: ReturnType<typeof rgb>,
  rot: number,
  extras?: { medidaMm?: number | null; fonte?: PDFFont },
) {
  const { width: W, height: H } = pagina.getSize();
  const r = normalizarRotacao(rot);
  const k = escalaFolha(W, H);
  const traco = 1.8 * k;

  if (m.tipo === "livre") {
    // Rabisco: cada traço vira um caminho. `drawSvgPath` lê em convenção SVG (y para baixo) a
    // partir da âncora dada; ancorando em (0, H) e escrevendo H − y, o ponto sai onde `paraPdf`
    // o colocou — o mesmo espaço (com /Rotate) das outras formas.
    // Cor e espessura de cada traço: "situação" segue a cor do apontamento; a espessura (px de
    // tela, 2 = a das outras formas) vira a mesma proporção do traço padrão da folha.
    (m.tracos ?? []).forEach((t, i) => {
      const pts = t.map((o) => paraPdf(x + o.dx, y + o.dy, W, H, r));
      if (pts.length < 2) return;
      const estilo = m.estilos?.[i];
      const corTraco = estilo && estilo.cor !== "situacao" ? COR_RABISCO_PDF[estilo.cor] : cor;
      const d = pts.map((q, j) => `${j === 0 ? "M" : "L"}${q.x.toFixed(2)} ${(H - q.y).toFixed(2)}`).join(" ");
      pagina.drawSvgPath(d, {
        x: 0,
        y: H,
        borderColor: corTraco,
        borderWidth: traco * ((estilo?.espessura ?? 2) / 2),
        borderLineCap: LineCapStyle.Round,
        color: undefined,
      });
    });
    return;
  }

  // Várias medidas: cada uma é uma cota com o seu valor (desenhadas pelo ramo de medida única).
  if (m.tipo === "medida" && m.medidas && m.medidas.length > 0) {
    for (const s of m.medidas) {
      desenharMarcacao(
        pagina,
        { tipo: "medida", pontos: [{ dx: s.ate.dx - s.de.dx, dy: s.ate.dy - s.de.dy }] },
        x + s.de.dx,
        y + s.de.dy,
        cor,
        rot,
        { medidaMm: s.mm, fonte: extras?.fonte },
      );
    }
    return;
  }

  const p = m.pontos[0];
  if (!p) return;

  if (m.tipo === "medida") {
    // Linha de cota + travessões nas pontas + o valor. Precisa de ramo próprio: sem ele a
    // medição cairia no `drawRectangle` do fim da função e sairia carimbada como um retângulo,
    // o que compila e imprime errado.
    const a = paraPdf(x, y, W, H, r);
    const b = paraPdf(x + p.dx, y + p.dy, W, H, r);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(ang) * 6 * k;
    const ny = Math.cos(ang) * 6 * k;
    pagina.drawLine({ start: a, end: b, color: cor, thickness: traco });
    pagina.drawLine({ start: { x: a.x - nx, y: a.y - ny }, end: { x: a.x + nx, y: a.y + ny }, color: cor, thickness: traco });
    pagina.drawLine({ start: { x: b.x - nx, y: b.y - ny }, end: { x: b.x + nx, y: b.y + ny }, color: cor, thickness: traco });
    if (extras?.fonte && extras.medidaMm != null) {
      const rotulo = seguroWinAnsi(formatarMedida(extras.medidaMm));
      const corpo = 9 * k;
      const largura = extras.fonte.widthOfTextAtSize(rotulo, corpo);
      // O rótulo sai SEMPRE em pé na orientação de leitura da folha (como os números dos
      // pinos), não alinhado à cota: numa prancha /Rotate 270 acompanhar a linha deixaria o
      // número deitado.
      // Ao lado da linha, nunca em cima: numa cota vertical o texto em pé cruzava o traço.
      const graus = anguloTextoEmPe(r);
      const inicio = posicaoRotuloCota(a, b, largura, corpo, graus, 3 * k);
      pagina.drawText(rotulo, {
        x: inicio.x,
        y: inicio.y,
        size: corpo,
        font: extras.fonte,
        color: cor,
        rotate: degrees(graus),
      });
    }
    return;
  }

  if (m.tipo === "seta") {
    const cauda = paraPdf(x, y, W, H, r);
    const ponta = paraPdf(x + p.dx, y + p.dy, W, H, r);
    const comprimento = Math.hypot(ponta.x - cauda.x, ponta.y - cauda.y);
    const [a, b] = abasSeta(cauda, ponta, Math.min(30 * k, Math.max(9 * k, comprimento * 0.18)));
    pagina.drawLine({ start: cauda, end: ponta, color: cor, thickness: traco });
    pagina.drawLine({ start: a, end: ponta, color: cor, thickness: traco });
    pagina.drawLine({ start: b, end: ponta, color: cor, thickness: traco });
    return;
  }

  const caixa = caixaPdf(x, y, x + p.dx, y + p.dy, W, H, r);
  if (caixa.width <= 0 || caixa.height <= 0) return;

  if (m.tipo === "nuvem") {
    const raio = Math.min(22 * k, Math.max(7 * k, Math.min(caixa.width, caixa.height) / 6));
    // `drawSvgPath` interpreta o caminho em convenção SVG (y pra baixo) e ancora pelo TOPO —
    // por isso soma a altura ao y do PDF. Reusa o MESMO gerador do viewer, então a nuvem
    // impressa é geometricamente a que estava na tela.
    pagina.drawSvgPath(caminhoNuvem(caixa.width, caixa.height, raio), {
      x: caixa.x,
      y: caixa.y + caixa.height,
      borderColor: cor,
      borderWidth: traco,
      color: undefined,
    });
    return;
  }

  pagina.drawRectangle({
    x: caixa.x,
    y: caixa.y,
    width: caixa.width,
    height: caixa.height,
    borderColor: cor,
    borderWidth: traco,
    opacity: 0,
  });
}

/**
 * Gera o PDF carimbado de uma prancha. `posicoes` vem do viewer (ver nota do topo); quando
 * ausente, cai no `x`/`y` do banco — o que é o certo pra um pino que nunca foi relocalizado.
 */
export async function carimbarPrancha(uploadId: string, posicoes: PosicaoPin[] = []): Promise<ResultadoCarimbo> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      caminho: true,
      mimeType: true,
      versao: true,
      validado: true,
      validadoEm: true,
      documentoId: true,
      validadoPor: { select: { name: true } },
      disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } } },
    },
  });
  if (!upload) return { erro: "Prancha não encontrada." };
  if (upload.mimeType !== "application/pdf" && !upload.nomeArquivo.toLowerCase().endsWith(".pdf")) {
    return { erro: "Só é possível carimbar arquivos PDF." };
  }

  const pendencias = await prisma.pendencia.findMany({
    where: {
      ...(upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id }),
      excluidoEm: null,
      // Rascunho NUNCA sai carimbado (item 31): esta é a folha que vai pro canteiro, e vazar
      // uma análise a meio caminho aqui é a pior versão desse erro.
      publicadoEm: { not: null },
    },
    orderBy: { numero: "asc" },
  });

  let origem: Buffer;
  try {
    origem = await fs.readFile(resolverCaminho(upload.caminho));
  } catch {
    return { erro: "Arquivo original não encontrado no armazenamento." };
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(origem);
  } catch {
    // Existe pelo menos um PDF assim no acervo (mesmo arquivo que já falhou no censo do item
    // 3). Melhor uma mensagem acionável do que um 500 sem explicação.
    return { erro: "Este PDF não pôde ser carimbado — o arquivo está corrompido ou usa um formato não suportado." };
  }

  const fontes = { normal: await doc.embedFont(StandardFonts.Helvetica), negrito: await doc.embedFont(StandardFonts.HelveticaBold) };
  const paginas = doc.getPages();
  const porId = new Map(posicoes.map((p) => [p.id, p]));

  let desenhados = 0;
  for (const p of pendencias) {
    const pagina = paginas[p.pagina - 1];
    if (!pagina) continue; // pino de página que não existe mais nesta revisão: ignora em silêncio
    const rot = normalizarRotacao(pagina.getRotation().angle);
    const { width: W, height: H } = pagina.getSize();
    // Impeditivo ainda aberto tem cor própria: no papel que vai pro canteiro, ele precisa
    // saltar mesmo de longe, e a diferença entre "aberta" e "aberta impeditiva" é justamente
    // o que decide se a prancha pode ser executada.
    const cor = contaComoTrabalho(p) && p.severidade === "impeditivo" ? COR_IMPEDITIVO : (COR_STATUS[p.status] ?? COR_STATUS.aberta);

    // Posição relocalizada pelo viewer quando houver; senão, a do banco.
    const pos = porId.get(p.id);
    const x = pos ? pos.x : p.x;
    const y = pos ? pos.y : p.y;

    const marcacao = lerMarcacao(p.marcacaoTipo, p.marcacaoGeo);
    if (marcacao) desenharMarcacao(pagina, marcacao, x, y, cor, rot, { medidaMm: p.medidaMm, fonte: fontes.negrito });

    const k = escalaFolha(W, H);
    const raioPino = 9 * k;
    const corpo = 9 * k;
    const centro = paraPdf(x, y, W, H, rot);
    pagina.drawCircle({ x: centro.x, y: centro.y, size: raioPino, color: cor, borderColor: BRANCO, borderWidth: 1.2 * k });
    const rotulo = String(p.numero);
    const largura = fontes.negrito.widthOfTextAtSize(rotulo, corpo);
    const ang = (anguloTextoEmPe(rot) * Math.PI) / 180;
    pagina.drawText(rotulo, {
      // Centraliza o número no círculo ao longo dos eixos VISUAIS — em página rotacionada o
      // deslocamento não é em x/y da página.
      x: centro.x - (Math.cos(ang) * largura) / 2 - Math.sin(ang) * 3.2 * k,
      y: centro.y - (Math.sin(ang) * largura) / 2 + Math.cos(ang) * 3.2 * k,
      size: corpo,
      font: fontes.negrito,
      color: BRANCO,
      rotate: degrees(anguloTextoEmPe(rot)),
    });
    desenhados++;
  }

  // ── Bloco de análise (item 25), só na 1ª página ──
  const abertas = pendencias.filter((p) => contaComoTrabalho(p)).length;
  const impeditivas = pendencias.filter((p) => contaComoTrabalho(p) && p.severidade === "impeditivo").length;
  const codigo = formatarCodigo(upload.disciplina.projeto.codigo);
  const linhas: { texto: string; negrito?: boolean; cor?: ReturnType<typeof rgb> }[] = [
    { texto: "ANÁLISE DE PROJETO — SENAHUB", negrito: true },
    { texto: `${codigo} · ${upload.disciplina.projeto.nome}`.slice(0, 70) },
    { texto: `${upload.disciplina.disciplinaTextoLegado} · ${upload.nomeArquivo}`.slice(0, 70) },
    {
      texto: upload.validado
        ? `Liberado por ${upload.validadoPor?.name ?? "—"} em ${formatarDataHora(upload.validadoEm)}`
        : "NÃO LIBERADO — documento ainda em análise",
      cor: upload.validado ? undefined : COR_IMPEDITIVO,
    },
    {
      texto:
        `Revisão ${rotuloRevisao(upload.versao)} · ${pendencias.length} apontamento(s), ${abertas} em aberto` +
        (impeditivas > 0 ? `, ${impeditivas} impeditivo(s)` : ""),
    },
    { texto: `Carimbado em ${formatarDataHora(new Date())}` },
  ];
  // A linha de liberação sozinha engana quando existe impeditivo aberto: alguém lê "Liberado
  // por Fulano" e leva a prancha pro canteiro. O aviso explícito é o ponto do item 25.
  if (impeditivas > 0) {
    linhas.splice(4, 0, { texto: "ATENÇÃO: há apontamento IMPEDITIVO em aberto", negrito: true, cor: COR_IMPEDITIVO });
  }
  if (paginas[0]) desenharBloco(paginas[0], linhas, fontes, normalizarRotacao(paginas[0].getRotation().angle));

  const bytes = await doc.save();
  const nome = upload.nomeArquivo.replace(/\.pdf$/i, "") + "-carimbado.pdf";
  return { pdf: bytes, nomeArquivo: nome, total: desenhados };
}

/** Rótulo pt-BR da severidade para o relatório (item 20) — "—" quando não classificada. */
export function rotuloSeveridade(s: string | null): string {
  return s ? (SEVERIDADE_LABEL[s as Severidade] ?? s) : "—";
}
