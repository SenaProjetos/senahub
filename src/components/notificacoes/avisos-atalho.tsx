"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import { ultimoAvisoRecebidoEm } from "@/modules/notificacoes/avisos/actions";
import { avisoRecenteNaoVisto, marcaDaVisita } from "@/modules/notificacoes/avisos/recentes";

const chaveVisita = (chaveUsuario: string) => `senahub.avisos-visto.${chaveUsuario}`;

function lerUltimaVisita(chaveUsuario: string): number | null {
  try {
    const bruto = window.localStorage.getItem(chaveVisita(chaveUsuario));
    if (!bruto) return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Atalho dos Avisos ao lado do sino. O ponto acende com aviso recente que a pessoa ainda não viu. */
export function AvisosAtalho({ chaveUsuario }: { chaveUsuario: string }) {
  const pathname = usePathname();
  const ativo = pathname.startsWith("/avisos");
  // `undefined` = ainda não consultado; `null` = nenhum aviso (ou a consulta falhou).
  const [recebidoEm, setRecebidoEm] = useState<string | null | undefined>(undefined);
  const [ultimaVisitaMs, setUltimaVisitaMs] = useState<number | null>(null);
  const consultado = useRef(false);

  // Estando na tela de Avisos a pessoa está vendo: registra a visita (apaga o ponto). A marca nunca
  // fica antes do último aviso, senão um relógio atrasado no computador reacenderia o ponto.
  useEffect(() => {
    if (ativo) {
      const marca = marcaDaVisita(Date.now(), recebidoEm);
      try {
        window.localStorage.setItem(chaveVisita(chaveUsuario), String(marca));
      } catch {
        // storage indisponível (janela privada…): vale só nesta sessão da tela.
      }
      setUltimaVisitaMs(marca);
    } else {
      setUltimaVisitaMs(lerUltimaVisita(chaveUsuario));
    }
  }, [ativo, chaveUsuario, pathname, recebidoEm]);

  // Reconsulta ao montar e a cada troca de página. Na tela de Avisos o ponto não aparece: só
  // consulta lá se ainda não se sabe o último aviso (a marca da visita depende dele).
  useEffect(() => {
    if (ativo && consultado.current) return;
    let cancelado = false;
    ultimoAvisoRecebidoEm()
      .then((r) => {
        if (cancelado) return;
        consultado.current = true;
        setRecebidoEm(r);
      })
      .catch(() => {
        if (!cancelado) setRecebidoEm(null);
      });
    return () => {
      cancelado = true;
    };
  }, [ativo, pathname]);

  const mostrarPonto = !ativo && avisoRecenteNaoVisto(recebidoEm ?? null, ultimaVisitaMs, new Date());
  const rotulo = mostrarPonto ? "Avisos, há aviso novo" : "Avisos";

  return (
    <Link
      href="/avisos"
      aria-label={rotulo}
      title={rotulo}
      className={
        ativo
          ? "relative hidden size-8 place-items-center rounded-sm bg-muted text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid"
          : "relative hidden size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:grid"
      }
    >
      <Megaphone className="size-4" />
      {mostrarPonto && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 size-2 rounded-full bg-destructive"
        />
      )}
    </Link>
  );
}
