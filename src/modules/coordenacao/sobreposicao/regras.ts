// Regras puras da sobreposição 2D. Sem I/O, sem Prisma/Next/node:* — roda também no navegador.
import type { Primitiva } from "@/modules/dwg/parse";
import { aplicar, inverter, type Alinhamento, type Ponto } from "./transformacao";

export type Formato = "pdf" | "dwg";

/** Layer da arquitetura de fundo: só a camada base a desenha; nas demais é descartada. */
export const LAYER_ARQUITETURA = "SENA_ARQ";

export function formatoDoArquivo(nomeArquivo: string): Formato | null {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith(".pdf")) return "pdf";
  if (nome.endsWith(".dwg")) return "dwg";
  return null;
}

/** Maior `versao` do formato entre os arquivos fora da lixeira. */
export function arquivoVigente<
  T extends { id: string; nomeArquivo: string; versao: number; excluidoEm: Date | null },
>(uploads: T[], formato: Formato): T | null {
  let melhor: T | null = null;
  for (const u of uploads) {
    if (u.excluidoEm !== null) continue;
    if (formatoDoArquivo(u.nomeArquivo) !== formato) continue;
    if (melhor === null || u.versao > melhor.versao) melhor = u;
  }
  return melhor;
}

export type EstadoAlinhamento = "sem_alinhamento" | "alinhada" | "revisao_anterior";

export function estadoDoAlinhamento(
  al: { uploadConferidoId: string | null } | null,
  uploadVigenteId: string | null,
): EstadoAlinhamento {
  if (!al) return "sem_alinhamento";
  return al.uploadConferidoId === uploadVigenteId ? "alinhada" : "revisao_anterior";
}

export function ehLayerArquitetura(nome: string): boolean {
  return nome.toLowerCase() === LAYER_ARQUITETURA.toLowerCase();
}

/** Fora da base, tira as primitivas do layer da arquitetura. */
export function primitivasDaCamada(
  primitivas: readonly Primitiva[],
  ehBase: boolean,
): { primitivas: Primitiva[]; achouArquitetura: boolean } {
  if (ehBase) return { primitivas: [...primitivas], achouArquitetura: false };
  const mantidas: Primitiva[] = [];
  let achouArquitetura = false;
  for (const p of primitivas) {
    if (ehLayerArquitetura(p.camada)) achouArquitetura = true;
    else mantidas.push(p);
  }
  return { primitivas: mantidas, achouArquitetura };
}

/** DXF tem Y para cima; o espaço nativo da camada é Y para baixo. */
export function nativoDwg(p: Ponto): Ponto {
  return { x: p.x, y: -p.y };
}

type Pagina = { largura: number; altura: number };

/** Ponto do mundo → pino normalizado (0..1) na página do PDF; `null` fora da folha. */
export function pontoParaPino(
  mundo: Ponto,
  alinhamentoPdf: Alinhamento,
  pagina: Pagina,
): { x: number; y: number } | null {
  const nativo = aplicar(inverter(alinhamentoPdf), mundo);
  const x = nativo.x / pagina.largura;
  const y = nativo.y / pagina.altura;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  return { x, y };
}

export function pinoParaMundo(
  pino: { x: number; y: number },
  alinhamentoPdf: Alinhamento,
  pagina: Pagina,
): Ponto {
  return aplicar(alinhamentoPdf, { x: pino.x * pagina.largura, y: pino.y * pagina.altura });
}

/** Cor da camada base. */
export const COR_BASE = "#374151";

/** Cores das demais camadas (tailwind-600), legíveis sobre branco. */
export const PALETA_CAMADAS: readonly string[] = [
  "#2563eb", // azul
  "#16a34a", // verde
  "#ea580c", // laranja
  "#9333ea", // roxo
  "#dc2626", // vermelho
  "#0d9488", // verde-água
  "#d97706", // âmbar
  "#db2777", // rosa
];

/** Primeira cor da paleta ainda não usada; todas usadas → a menos repetida (empate: ordem da paleta). */
export function corSugerida(usadas: readonly string[]): string {
  const contagem = new Map<string, number>();
  for (const u of usadas) {
    const k = u.toLowerCase();
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  let melhor = PALETA_CAMADAS[0];
  let menor = Infinity;
  for (const cor of PALETA_CAMADAS) {
    const n = contagem.get(cor.toLowerCase()) ?? 0;
    if (n === 0) return cor;
    if (n < menor) {
      menor = n;
      melhor = cor;
    }
  }
  return melhor;
}

export function motivoParaNaoRemover(camada: { base: boolean }, totalCamadas: number): string | null {
  if (camada.base && totalCamadas > 1) {
    return "Defina outra camada como base antes de remover esta.";
  }
  return null;
}
