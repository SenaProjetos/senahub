"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import {
  type Guia,
  type PassoGuia,
  chaveGuia,
  guiaParaRota,
} from "@/components/onboarding/coachmarks";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";

type Ctx = {
  /** A rota atual tem um guia disponível (habilita o "Rever guia" no menu). */
  temGuia: boolean;
  /** Reexibe o guia da tela atual, mesmo que já visto. */
  reverGuiaDaTela: () => void;
};

const OnboardingCtx = createContext<Ctx>({ temGuia: false, reverGuiaDaTela: () => {} });

export function useOnboarding() {
  return useContext(OnboardingCtx);
}

/** Só passos cujo alvo existe e está visível agora (perfis diferentes veem telas diferentes). */
function passosVisiveis(g: Guia): PassoGuia[] {
  return g.passos.filter((p) => {
    const el = document.querySelector(p.alvo);
    return el instanceof HTMLElement && el.offsetParent !== null;
  });
}

export function OnboardingProvider({
  children,
  vistosIniciais,
}: {
  children: React.ReactNode;
  /** Chaves `tour_visto:*` já gravadas para o usuário (vindas do servidor). */
  vistosIniciais: string[];
}) {
  const pathname = usePathname();
  const vistos = useRef<Set<string>>(new Set(vistosIniciais));
  const [ativo, setAtivo] = useState<{ guia: Guia; passos: PassoGuia[] } | null>(null);

  const guiaAtual = pathname ? guiaParaRota(pathname) : null;

  const iniciar = useCallback((g: Guia) => {
    const passos = passosVisiveis(g);
    if (passos.length === 0) return false;
    setAtivo({ guia: g, passos });
    return true;
  }, []);

  // Primeiro acesso da tela: tenta abrir após o layout pintar. Não marca "visto" se
  // nenhum alvo apareceu (deixa reabrir numa próxima visita já com os elementos).
  useEffect(() => {
    if (!guiaAtual) return;
    if (vistos.current.has(chaveGuia(guiaAtual))) return;
    let vivo = true;
    const t = setTimeout(() => {
      if (vivo) iniciar(guiaAtual);
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [guiaAtual, iniciar]);

  const fechar = useCallback(
    (concluido: boolean) => {
      const g = ativo?.guia;
      setAtivo(null);
      if (concluido && g) {
        const chave = chaveGuia(g);
        vistos.current.add(chave);
        void salvarPreferencia({ chave, valor: true });
      }
    },
    [ativo],
  );

  const reverGuiaDaTela = useCallback(() => {
    if (guiaAtual) iniciar(guiaAtual);
  }, [guiaAtual, iniciar]);

  return (
    <OnboardingCtx.Provider value={{ temGuia: !!guiaAtual, reverGuiaDaTela }}>
      {children}
      {ativo && <OnboardingOverlay passos={ativo.passos} onFechar={fechar} />}
    </OnboardingCtx.Provider>
  );
}
