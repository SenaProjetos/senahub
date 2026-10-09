/**
 * Itens de menu do ciclo documental (ADR-0002): descritor PURO, sem React. O mesmo array alimenta
 * o `...` da linha e o menu de contexto. O que o perfil não permite é OMITIDO; o que o estado não
 * permite fica DESABILITADO com a mesma frase do `ActionError` do servidor (`transicoes.ts`).
 */
import { ArrowRightLeft, Archive, Ban, BadgeCheck, HardHat, Lock, Send, ShieldAlert, Undo2, Unlock, UserRoundCheck, UserRoundX } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";
import { ROTULO_CONTROLE, type EstadoRevisao, type TipoControle } from "./estados";
import { motivoParaNaoAplicar, motivoParaNaoRemover, motivoParaNaoTransicionar, type AcaoCiclo } from "./transicoes";

/** O que a linha da aba Arquivos sabe do ciclo da revisão que mostra. */
export type ControleDaLinha = {
  id: string;
  tipo: TipoControle;
  motivo: string;
  escopos: string[];
  automatico: boolean;
  origem: string | null;
};

export type CicloDaLinha = {
  participa: boolean;
  revisaoId: string | null;
  /** Número interno da revisão (1 = R00). */
  numero: number | null;
  estado: EstadoRevisao | null;
  /** Versão interna atual da revisão (R01 · v3). */
  versao: number | null;
  descricao: string | null;
  controles: ControleDaLinha[];
  /** A5: revisão recebida e ainda não aberta por quem olha (derivado, nunca gravado). */
  novo: boolean;
  podeEnviar: boolean;
  podePublicar: boolean;
  podeAlterarPasta: boolean;
  podeBloquear: boolean;
};

export const PREFIXO_CICLO = "ciclo:";
export const PREFIXO_APLICAR = "ciclo:aplicar:";
export const PREFIXO_REMOVER = "ciclo:remover:";

export type EscolhaCiclo =
  | { tipo: "transicao"; acao: Exclude<AcaoCiclo, "substituir"> }
  | { tipo: "aplicar"; controle: TipoControle }
  | { tipo: "remover"; controleId: string };

/** Lê o id de um item do ciclo; `null` = não é deste descritor. */
export function escolhaDoCiclo(id: string): EscolhaCiclo | null {
  if (id.startsWith(PREFIXO_APLICAR)) return { tipo: "aplicar", controle: id.slice(PREFIXO_APLICAR.length) as TipoControle };
  if (id.startsWith(PREFIXO_REMOVER)) return { tipo: "remover", controleId: id.slice(PREFIXO_REMOVER.length) };
  if (id.startsWith(PREFIXO_CICLO)) return { tipo: "transicao", acao: id.slice(PREFIXO_CICLO.length) as Exclude<AcaoCiclo, "substituir"> };
  return null;
}

const ROTULO_REMOVER: Record<TipoControle, string> = {
  liberado_obra: "Revogar liberação para obra",
  enviado_cliente: "Tirar do cliente",
  bloqueio: "Remover bloqueio",
  restricao: "Remover restrição",
};

export function itensDoCiclo(c: CicloDaLinha, travado?: string): AcaoItem[] {
  if (!c.participa || !c.revisaoId || !c.estado) return [];
  const base = { estado: c.estado, participa: true, bloqueada: c.controles.some((x) => x.tipo === "bloqueio") };
  const ativos = c.controles.map((x) => ({ tipo: x.tipo, origem: x.origem }));
  // O motivo é pedido no diálogo — aqui só interessa se o ESTADO permite.
  const pode = (acao: AcaoCiclo) => travado ?? motivoParaNaoTransicionar(acao, base, { ator: "pessoa", motivo: "x" }) ?? undefined;
  const podeAplicar = (tipo: TipoControle) =>
    travado ?? motivoParaNaoAplicar(tipo, { ...base, ativos }, { motivo: "x", escopos: ["download"] }) ?? undefined;

  const itens: AcaoItem[] = [];
  if (c.podeEnviar && c.estado === "em_andamento") {
    itens.push({ tipo: "acao", id: `${PREFIXO_CICLO}enviar_analise`, rotulo: "Enviar para análise", icone: Send, desabilitado: pode("enviar_analise") });
  }
  if (c.podePublicar && c.estado === "compartilhado") {
    itens.push({ tipo: "acao", id: `${PREFIXO_CICLO}publicar`, rotulo: "Publicar", icone: BadgeCheck, desabilitado: pode("publicar") });
    itens.push({ tipo: "acao", id: `${PREFIXO_CICLO}devolver`, rotulo: "Devolver para ajustes", icone: Undo2, desabilitado: pode("devolver") });
  }
  if (c.podeAlterarPasta && c.estado === "publicado") {
    for (const tipo of ["liberado_obra", "enviado_cliente"] as const) {
      if (c.controles.some((x) => x.tipo === tipo)) continue;
      itens.push({
        tipo: "acao",
        id: `${PREFIXO_APLICAR}${tipo}`,
        rotulo: tipo === "liberado_obra" ? "Liberar para obra" : "Enviar ao cliente",
        icone: tipo === "liberado_obra" ? HardHat : UserRoundCheck,
        desabilitado: podeAplicar(tipo),
      });
    }
  }
  if (c.podeBloquear && c.estado !== "arquivado") {
    itens.push({ tipo: "acao", id: `${PREFIXO_APLICAR}bloqueio`, rotulo: "Bloquear…", icone: Lock, desabilitado: podeAplicar("bloqueio") });
    itens.push({ tipo: "acao", id: `${PREFIXO_APLICAR}restricao`, rotulo: "Aplicar restrição…", icone: ShieldAlert, desabilitado: podeAplicar("restricao") });
  }
  // Remover: um item por controle ativo que a pessoa pode tirar.
  for (const ctl of c.controles) {
    const permitido = ctl.tipo === "liberado_obra" || ctl.tipo === "enviado_cliente" ? c.podeAlterarPasta : c.podeBloquear;
    if (!permitido) continue;
    itens.push({
      tipo: "acao",
      id: `${PREFIXO_REMOVER}${ctl.id}`,
      rotulo: ROTULO_REMOVER[ctl.tipo],
      icone: ctl.tipo === "bloqueio" ? Unlock : ctl.tipo === "enviado_cliente" ? UserRoundX : ctl.tipo === "restricao" ? Ban : ArrowRightLeft,
      desabilitado: travado ?? motivoParaNaoRemover({ tipo: ctl.tipo, origem: ctl.origem }, { ator: "pessoa", motivo: "x" }) ?? undefined,
    });
  }
  if (c.podePublicar && c.estado === "publicado") {
    itens.push({ tipo: "acao", id: `${PREFIXO_CICLO}arquivar`, rotulo: "Arquivar revisão…", icone: Archive, variant: "destructive", desabilitado: pode("arquivar") });
  }
  return itens;
}

/** Dica curta do controle para o selo (motivo + quem aplicou). */
export function dicaDoControle(c: ControleDaLinha): string {
  const escopo = c.tipo === "bloqueio" && c.escopos.length ? ` (${c.escopos.join(", ")})` : "";
  return `${ROTULO_CONTROLE[c.tipo]}${escopo}: ${c.motivo}${c.automatico ? " · automático" : ""}`;
}
