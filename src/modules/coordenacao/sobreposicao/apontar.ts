// Regras puras do "Apontar interferência" na sobreposição 2D. Sem I/O: roda no navegador.
// O apontamento é um `Pendencia` normal no PDF vigente da prancha escolhida, criado pela action
// `criarPendencia` — aqui só se decide SE dá para apontar e ONDE o pino cai na folha.
import type { Formato } from "./regras";
import { pinoParaMundo, pontoParaPino } from "./regras";
import type { Alinhamento, Ponto } from "./transformacao";

export const MOTIVO_SEM_PDF_APONTAR = "Esta prancha não tem PDF vigente para receber o apontamento.";
export const MOTIVO_USAR_PDF = "Para apontar, use o PDF desta prancha.";
export const MOTIVO_ALINHAR_PDF = "Alinhe o PDF desta prancha antes de apontar.";
export const MOTIVO_PDF_ANTIGO =
  "O PDF desta prancha é anterior ao último arquivo enviado no documento. Peça o PDF atualizado para apontar.";

/** Recorte da sobreposição anexado ao apontamento, em px. */
export const RECORTE_CONTEXTO = { largura: 800, altura: 600 } as const;

type PinoDaCamada = {
  id: string;
  numero: number;
  status: string;
  x: number;
  y: number;
  uploadId: string;
  rascunho: boolean;
  meu: boolean;
};

/** O que estas regras leem de uma camada da cena (`CamadaDaCena` serve). */
export type CamadaParaApontar = {
  id: string;
  disciplina: string;
  titulo: string;
  formato: Formato;
  visivel: boolean;
  cor: string;
  pagina: number;
  /** `obsoleto`: outro arquivo do documento tem versão maior (`pdfObsoleto`). */
  pdf: { uploadId: string; obsoleto?: boolean } | null;
  alinhamentos: Partial<Record<Formato, { alinhamento: Alinhamento }>>;
  pinos: PinoDaCamada[];
};

/** Tamanho da página do PDF em pontos, com o `/Rotate` dela (`rotacaoDaFolha`). */
export type TamanhoPagina = { largura: number; altura: number };

/**
 * Por que esta camada não recebe o apontamento agora. `trocarParaPdf` = a tela oferece "Usar o PDF"
 * (o pino só cai no PDF; posição de DWG nunca é convertida por adivinhação).
 */
export function motivoParaNaoApontar(c: CamadaParaApontar): { erro: string; trocarParaPdf: boolean } | null {
  if (!c.pdf) return { erro: MOTIVO_SEM_PDF_APONTAR, trocarParaPdf: false };
  if (c.pdf.obsoleto) return { erro: MOTIVO_PDF_ANTIGO, trocarParaPdf: false };
  if (c.formato !== "pdf") return { erro: MOTIVO_USAR_PDF, trocarParaPdf: true };
  if (!c.alinhamentos.pdf) return { erro: MOTIVO_ALINHAR_PDF, trocarParaPdf: false };
  return null;
}

/** Onde o pino cai na folha (0..1) — `null` do ponto fora da folha vira a recusa com o nome da disciplina. */
export function pinoDoApontamento(
  c: CamadaParaApontar,
  alinhamentoPdf: Alinhamento,
  mundo: Ponto,
  pagina: TamanhoPagina,
): { ok: true; uploadId: string; pagina: number; x: number; y: number } | { ok: false; erro: string } {
  if (!c.pdf) return { ok: false, erro: MOTIVO_SEM_PDF_APONTAR };
  const pino = pontoParaPino(mundo, alinhamentoPdf, pagina);
  if (!pino) return { ok: false, erro: `O ponto fica fora da prancha de ${c.disciplina}.` };
  return { ok: true, uploadId: c.pdf.uploadId, pagina: c.pagina, x: pino.x, y: pino.y };
}

export type PinoNoMundo = {
  id: string;
  numero: number;
  mundo: Ponto;
  rascunho: boolean;
  cor: string;
  uploadId: string;
  pagina: number;
  camadaId: string;
};

/**
 * Pinos abertos das camadas ligadas, no mundo, pelo alinhamento do PDF de cada uma (também quando
 * a camada está em DWG). Sem alinhamento do PDF ou sem o tamanho da página, a camada não mostra pino.
 */
export function pinosNoMundo(
  camadas: readonly CamadaParaApontar[],
  tamanhos: Readonly<Record<string, TamanhoPagina>>,
): PinoNoMundo[] {
  const out: PinoNoMundo[] = [];
  for (const c of camadas) {
    const al = c.alinhamentos.pdf?.alinhamento;
    const tamanho = tamanhos[c.id];
    if (!c.visivel || !al || !tamanho) continue;
    for (const p of c.pinos) {
      out.push({
        id: p.id,
        numero: p.numero,
        mundo: pinoParaMundo(p, al, tamanho),
        rascunho: p.rascunho,
        cor: c.cor,
        uploadId: p.uploadId,
        pagina: c.pagina,
        camadaId: c.id,
      });
    }
  }
  return out;
}

/** O pino mais perto de `p` a no máximo `raio` (mesma unidade do mundo). */
export function pinoMaisProximo<T extends { mundo: Ponto }>(pinos: readonly T[], p: Ponto, raio: number): T | null {
  let melhor: T | null = null;
  let menor = raio;
  for (const q of pinos) {
    const d = Math.hypot(q.mundo.x - p.x, q.mundo.y - p.y);
    if (d <= menor) {
      menor = d;
      melhor = q;
    }
  }
  return melhor;
}

/** Meus rascunhos, um grupo por prancha (o PDF vigente da camada), para "Enviar apontamentos". */
export function rascunhosPorPrancha(
  camadas: readonly CamadaParaApontar[],
): { uploadId: string; disciplina: string; titulo: string; numeros: number[] }[] {
  const out: { uploadId: string; disciplina: string; titulo: string; numeros: number[] }[] = [];
  for (const c of camadas) {
    if (!c.pdf) continue;
    const numeros = c.pinos.filter((p) => p.rascunho && p.meu).map((p) => p.numero);
    if (numeros.length > 0) out.push({ uploadId: c.pdf.uploadId, disciplina: c.disciplina, titulo: c.titulo, numeros });
  }
  return out;
}

/** O apontamento aberto no visualizador da prancha (mesmo formato dos links das notificações). */
export function hrefDoPino(projetoId: string, p: { uploadId: string; pagina: number; numero: number }): string {
  return `/projetos/${projetoId}/arquivos/${p.uploadId}/visualizar?pagina=${p.pagina}&pin=${p.numero}`;
}
