import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_NAO_DISPENSAVEL, type TipoPendencia } from "./pendencias";

/**
 * Itens do menu de uma linha de pendência documental — **puro** (ADR-0002). O mesmo array alimenta o menu
 * de contexto e o `...`. O gate da tela e o das ações são o mesmo, então não há item omitido por perfil;
 * o que o ESTADO impede vem desabilitado com a MESMA frase do servidor.
 */
export function itensDePendenciaCiclo(p: {
  tipo: TipoPendencia | "corrigida";
  dispensada: boolean;
  hrefDocumento: string;
  hrefLixeira: string;
}): AcaoItem[] {
  const itens: AcaoItem[] = [{ tipo: "link", id: "abrir-documento", rotulo: "Abrir documento", href: p.hrefDocumento }];
  if (p.tipo === "publicada_com_lixeira") {
    itens.push({ tipo: "link", id: "abrir-lixeira", rotulo: "Abrir lixeira do projeto", href: p.hrefLixeira });
  }
  itens.push({ tipo: "separador", id: "sep-dispensa" });
  if (p.dispensada) itens.push({ tipo: "acao", id: "desfazer-dispensa", rotulo: "Desfazer dispensa" });
  else if (p.tipo === "corrigida") itens.push({ tipo: "acao", id: "dispensar", rotulo: "Dispensar…", desabilitado: MOTIVO_NAO_DISPENSAVEL });
  else itens.push({ tipo: "acao", id: "dispensar", rotulo: "Dispensar…" });
  return limparSeparadores(itens);
}

/** A barra de lote só dispensa (a seleção só aceita pendências abertas). O diálogo de motivo é a confirmação. */
export function itensDaSelecaoDePendencias(): AcaoItem[] {
  return [{ tipo: "acao", id: "dispensar", rotulo: "Dispensar…" }];
}
