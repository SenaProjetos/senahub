import { lerMarcacao } from "@/modules/projetos/pendencias/marcacao";
import { MODOS_CALIBRACAO, medirMm, type ModoCalibracao } from "@/modules/projetos/pendencias/medicao";
import type { MarcacaoEntrada, MedidaEntrada } from "@/modules/projetos/pendencias/marcacao-schema";
import type { DadosPendencia } from "@/modules/projetos/pendencias/criar-service";
import { textoDoRascunho } from "./regras";

/**
 * Marcação do cliente → dados do apontamento (puro). Duas etapas: ao CRIAR o pedido a cota é recalculada no servidor
 * pela calibração da prancha (o valor do navegador é só exibição) e congelada; ao ACEITAR, a marcação gravada vira
 * rascunho no mesmo ponto, com a mesma geometria — o formato é o da `Pendencia`, então nada é convertido de espaço.
 */

export const MOTIVO_SEM_ESCALA = "A escala desta prancha ainda não foi definida pela equipe.";
export const MOTIVO_DESENHO_INVALIDO = "Desenho inválido.";

/** O limite do texto do apontamento (`criarPendencia`/`editarPendencia`). */
export const LIMITE_TEXTO_PENDENCIA = 1000;

export type MarcacaoDoPedido = { pagina: number; x: number; y: number; texto: string; marcacao: MarcacaoEntrada | null };
export type CalibracaoDaPagina = { mmPorPonto: number; modo: ModoCalibracao };
export type MarcacaoCongelada = MarcacaoDoPedido & { medida: MedidaEntrada | null };

/**
 * Congela a marcação do pedido. Cota (`medida`) exige a calibração da página e as dimensões da página em pontos; cada
 * segmento é medido aqui (`medirMm`) e o fator/modo vêm da calibração. As outras formas passam como vieram.
 */
export function congelarMarcacao(
  m: MarcacaoDoPedido,
  p: { calibracao: CalibracaoDaPagina | null; paginaPt: { w: number; h: number } | null },
): MarcacaoCongelada | { erro: string } {
  if (m.marcacao?.tipo !== "medida") return { ...m, medida: null };
  if (!p.calibracao) return { erro: MOTIVO_SEM_ESCALA };
  if (!p.paginaPt) return { erro: MOTIVO_DESENHO_INVALIDO };
  const { w, h } = p.paginaPt;
  const { mmPorPonto, modo } = p.calibracao;
  const segmentos = m.marcacao.medidas ?? [{ de: { dx: 0, dy: 0 }, ate: m.marcacao.pontos[0], mm: 0 }];
  if (!segmentos[0]?.ate) return { erro: MOTIVO_DESENHO_INVALIDO };
  const medidas: { de: { dx: number; dy: number }; ate: { dx: number; dy: number }; mm: number }[] = [];
  for (const s of segmentos) {
    const mm = medirMm(
      { x: m.x + s.de.dx, y: m.y + s.de.dy },
      { x: m.x + s.ate.dx, y: m.y + s.ate.dy },
      w,
      h,
      mmPorPonto,
    );
    if (mm === null) return { erro: MOTIVO_DESENHO_INVALIDO };
    medidas.push({ de: s.de, ate: s.ate, mm });
  }
  const marcacao: MarcacaoEntrada = m.marcacao.medidas ? { ...m.marcacao, medidas } : { ...m.marcacao };
  return { ...m, marcacao, medida: { mm: medidas[0].mm, fator: mmPorPonto, modo } };
}

/** Linha de `MarcacaoPedidoCliente` (mesmas colunas da `Pendencia`). */
export type MarcacaoGravada = {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  marcacaoTipo: string | null;
  marcacaoGeo: unknown;
  medidaMm: number | null;
  medidaFator: number | null;
  medidaModo: string | null;
};

/** A marcação gravada vira os dados do rascunho de apontamento: mesmo ponto, mesma geometria, medida congelada. */
export function dadosDoRascunho(m: MarcacaoGravada, p: { nomeAutor: string; temAnexos: boolean }): DadosPendencia {
  const modo = MODOS_CALIBRACAO.find((x) => x === m.medidaModo);
  const medida = m.medidaMm !== null && m.medidaFator !== null && modo ? { mm: m.medidaMm, fator: m.medidaFator, modo } : null;
  let texto = textoDoRascunho({ nomeAutor: p.nomeAutor, texto: m.texto, temAnexos: p.temAnexos });
  if (texto.length > LIMITE_TEXTO_PENDENCIA) texto = `${texto.slice(0, LIMITE_TEXTO_PENDENCIA - 1)}…`;
  return {
    pagina: m.pagina,
    x: m.x,
    y: m.y,
    texto,
    marcacao: lerMarcacao(m.marcacaoTipo, m.marcacaoGeo),
    medida,
  };
}
