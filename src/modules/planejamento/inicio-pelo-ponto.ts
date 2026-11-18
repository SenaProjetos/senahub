/**
 * Início real pelo ponto (2026-11-17): o dia da PRIMEIRA hora apontada numa tarefa da EAP (pelo card gerado dela) é o
 * início real dela. Puro, sem I/O — a gravação é `inicio-pelo-ponto-service.ts`, chamada depois de cada caminho que abre
 * sessão de ponto com tarefa.
 *
 * O ponto só PREENCHE o vazio: com início real já informado (pela coordenação ou por uma hora anterior), não mexe — a
 * data digitada vence sempre. As recusas são as do "Atualizar tarefa" (`aplicarExecucao`): agrupamento (as datas vêm de
 * dentro), suspensa/cancelada/arquivada e data no futuro. Ficam de fora também:
 *  - marco: tem uma data só, a do término, e hora apontada não diz que ele aconteceu;
 *  - concluída sem término real (estado que a integridade acusa): não é o ponto quem a conserta.
 * O status segue a regra de lá: não iniciada vira em andamento; aguardando, revisão, aprovação e bloqueada ficam.
 * O % não muda (D19: quem informa o % é a coordenação).
 */
import type { StatusEap } from "@/generated/prisma/client";
import { aplicarExecucao, type LinhaParaExecucao } from "./execucao";

type Dia = string;

export function inicioPeloPonto(
  linha: LinhaParaExecucao & { inicioReal: Dia | null; fimReal: Dia | null },
  primeiroDiaDePonto: Dia,
  hoje: Dia,
): { inicioReal: Dia; status: StatusEap } | null {
  if (linha.inicioReal != null || linha.fimReal != null) return null;
  if (linha.tipoEap === "mrc" || linha.status === "con") return null;
  const r = aplicarExecucao(linha, { inicioReal: primeiroDiaDePonto, fimReal: null }, hoje);
  if (!r.ok || r.inicioReal == null) return null;
  return { inicioReal: r.inicioReal, status: r.status };
}
