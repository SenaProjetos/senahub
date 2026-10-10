"use client";

import { useCallback, useEffect, useState } from "react";
import { buscarResumoJornada } from "@/modules/ponto/actions";
import type { ResumoHeader } from "@/modules/ponto/queries";
import { selecaoDaAlocacaoPonto, type TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { EVENTO_PONTO, useCronometro } from "@/components/ponto/use-batida";

const POLL_MS = 60_000;
/** Âncora estável enquanto não há resumo (cronômetro parado) — evita recriar a data a cada render. */
const EPOCH = new Date(0);

/**
 * Estado da jornada corrente, lido do servidor por conta própria (não por prop do RSC, para não
 * pesar toda navegação) e mantido em dia por polling de 60s + o evento `EVENTO_PONTO`, que toda
 * batida/troca dispara. Compartilhado pela miniatura do header e pelo card de ponto do Início:
 * as duas superfícies mostram a mesma jornada, então derivam dela do mesmo jeito.
 *
 * `resumo`: `undefined` = carregando · `null` = perfil sem jornada (cliente) — nesse caso o
 * polling para de vez (o papel não muda no meio da sessão).
 *
 * `ativo: false` não busca nada — para superfícies escondidas pelo CSS (o card do Início só
 * aparece no celular), que senão dobrariam o polling do header no computador.
 */
export function useJornada({ ativo = true }: { ativo?: boolean } = {}) {
  const [resumo, setResumo] = useState<ResumoHeader | null | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      setResumo(await buscarResumoJornada());
    } catch {
      // Offline/erro de rede: mantém o último estado conhecido em vez de sumir com o relógio.
    }
  }, []);

  const semJornada = resumo === null;

  useEffect(() => {
    if (semJornada || !ativo) return;
    void carregar();
    // Aba em segundo plano não precisa de poll — `visibilitychange` recarrega na volta.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, POLL_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    const aoAtualizar = () => void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_PONTO, aoAtualizar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_PONTO, aoAtualizar);
    };
  }, [carregar, semJornada, ativo]);

  const rodando = resumo
    ? resumo.modo === "ponto"
      ? resumo.estado === "trabalhando"
      : resumo.aberto !== null
    : false;
  const baseMin = resumo ? (resumo.modo === "ponto" ? resumo.trabalhadoMin : resumo.hojeMin) : 0;
  const ms = useCronometro(baseMin, resumo?.agora ?? EPOCH, rodando);

  /**
   * Alocação que o servidor considera corrente — a da sessão aberta ou, em descanso, a da última
   * sessão (para retomar nela). Seletores acompanham ESTE valor, e só quando ele muda: senão um
   * poll de 60s apagaria a escolha que a pessoa acabou de fazer.
   */
  const projetoCorrenteId = !resumo
    ? null
    : resumo.modo === "ponto"
      ? (resumo.projetoAtivo?.id ?? resumo.retomarProjeto?.id ?? null)
      : (resumo.aberto?.projetoId ?? null);
  const tipoAlocacaoCorrente: TipoAlocacaoPonto = !resumo
    ? "sem_projeto"
    : resumo.modo === "ponto"
      ? (resumo.tipoAlocacaoAtiva ?? resumo.retomarTipoAlocacao ?? "sem_projeto")
      : (resumo.aberto?.tipoAlocacao ?? "sem_projeto");

  /** Tarefa (F6) da sessão em curso ou, em descanso, a da última — o seletor a mantém ao voltar. */
  const tarefaCorrente = !resumo
    ? null
    : resumo.modo === "ponto"
      ? (resumo.tarefaAtiva ?? resumo.retomarTarefa ?? null)
      : (resumo.aberto?.tarefa ?? null);

  /**
   * Parado e sem alocação corrente: o projeto e a atividade de hoje no cronograma
   * (`sugestaoParaPonto`). Os seletores começam nela em vez de "Sem projeto"; a pessoa troca à
   * vontade. `null` com sessão aberta ou sem nada para hoje.
   */
  const sugestao =
    resumo && !rodando && resumo.sugestao
      ? { selecao: resumo.sugestao.projeto.id, projeto: resumo.sugestao.projeto, tarefa: resumo.sugestao.tarefa }
      : null;

  return {
    resumo,
    carregar,
    sugestao,
    rodando,
    ms,
    projetoCorrenteId,
    tipoAlocacaoCorrente,
    selecaoCorrente: selecaoDaAlocacaoPonto(projetoCorrenteId, tipoAlocacaoCorrente),
    tarefaCorrente,
  };
}
