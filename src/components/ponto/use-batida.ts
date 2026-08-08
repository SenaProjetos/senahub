"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registrarBatida, trocarProjeto } from "@/modules/ponto/actions";
import {
  contarPendentes,
  enfileirarBatida,
  enfileirarTroca,
  estaOffline,
  sincronizar,
  type TipoBatida,
  type Geo,
} from "@/lib/ponto-offline";

/**
 * Evento local disparado após qualquer batida/troca bem-sucedida. `router.refresh()`
 * revalida os Server Components, mas a miniatura do header busca o estado por conta
 * própria (client fetch) — este evento é o que a mantém em sincronia com a tela cheia.
 */
export const EVENTO_PONTO = "ponto-atualizado";

/** Trava de módulo: só uma sincronização da fila offline por aba (ver `sincronizarFila`). */
let sincronizando = false;

export function avisarPontoAtualizado() {
  window.dispatchEvent(new Event(EVENTO_PONTO));
}

const SUCESSO: Record<TipoBatida, string> = {
  entrada: "Jornada iniciada.",
  inicio_descanso: "Descanso iniciado.",
  fim_descanso: "De volta ao trabalho.",
  saida: "Jornada encerrada.",
};

/** Captura geolocalização opcional (S6): timeout curto, falha silenciosa. */
async function capturarGeo(): Promise<Geo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<Geo>((resolve) => {
    const done = (g: Geo) => resolve(g);
    const t = setTimeout(() => done(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(t);
        done(null);
      },
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

/**
 * Registro de batidas compartilhado pela tela `/ponto` e pela miniatura do header:
 * geolocalização, fila offline, toasts e refresh moram AQUI para que os dois caminhos
 * gravem exatamente a mesma coisa (batida do header sem geo, ou perdida offline, seria
 * inconsistente com a mesma batida feita na tela cheia).
 */
export function useBatida() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendentes, setPendentes] = useState(0);

  const concluir = useCallback(
    (msg: string) => {
      toast.success(msg);
      avisarPontoAtualizado();
      router.refresh();
    },
    [router],
  );

  const bater = useCallback(
    async (tipo: TipoBatida, projetoId?: string) => {
      const geo = await capturarGeo();
      const payload = { projetoId, geo };
      const enfileirar = () => {
        enfileirarBatida(tipo, payload);
        setPendentes(contarPendentes());
        toast.info("Sem conexão — batida salva e será enviada ao reconectar.");
      };
      if (estaOffline()) {
        enfileirar();
        return;
      }
      setBusy(true);
      try {
        const r = await registrarBatida({ tipo, projetoId, geo });
        if (r.ok) concluir(SUCESSO[tipo]);
        else toast.error(r.error);
      } catch {
        enfileirar();
      } finally {
        setBusy(false);
      }
    },
    [concluir],
  );

  const trocar = useCallback(
    async (projetoId?: string) => {
      const enfileirar = () => {
        enfileirarTroca({ projetoId });
        setPendentes(contarPendentes());
        toast.info("Sem conexão — troca salva e será enviada ao reconectar.");
      };
      if (estaOffline()) {
        enfileirar();
        return;
      }
      setBusy(true);
      try {
        const r = await trocarProjeto({ projetoId });
        if (r.ok) concluir("Projeto trocado.");
        else toast.error(r.error);
      } catch {
        enfileirar();
      } finally {
        setBusy(false);
      }
    },
    [concluir],
  );

  const sincronizarFila = useCallback(async () => {
    if (contarPendentes() === 0 || sincronizando) return;
    // `sincronizar` tira um snapshot da fila e só remove item a item — dois `useBatida`
    // montados ao mesmo tempo (header + tela /ponto) reenviariam a MESMA batida em
    // paralelo. A trava é de módulo porque as instâncias do hook não se enxergam.
    sincronizando = true;
    try {
      const { sincronizados, falhas } = await sincronizar({ registrarBatida, trocar: trocarProjeto });
      setPendentes(contarPendentes());
      if (sincronizados > 0) {
        toast.success(`${sincronizados} batida(s) sincronizada(s).`);
        avisarPontoAtualizado();
        router.refresh();
      }
      for (const f of falhas) toast.error(`Batida offline rejeitada: ${f}`);
    } finally {
      sincronizando = false;
    }
  }, [router]);

  useEffect(() => {
    setPendentes(contarPendentes());
    void sincronizarFila();
    const onOnline = () => void sincronizarFila();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sincronizarFila]);

  return { bater, trocar, busy, pendentes, sincronizarFila };
}

/**
 * Cronômetro ao vivo: `baseMin` (minutos já contabilizados no servidor) + o tempo
 * decorrido desde a âncora `agora` do servidor, enquanto `ativo`. Em milissegundos.
 */
export function useCronometro(baseMin: number, agora: string | Date, ativo: boolean): number {
  const baseMs = baseMin * 60_000;
  const ancora = new Date(agora).getTime();
  const [ms, setMs] = useState(baseMs);
  useEffect(() => {
    if (!ativo) {
      setMs(baseMs);
      return;
    }
    const tick = () => setMs(baseMs + (Date.now() - ancora));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ativo, baseMs, ancora]);
  return ms;
}
