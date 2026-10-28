"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import { ultimoAvisoRecebidoEm } from "@/modules/notificacoes/avisos/actions";
import { avisoRecenteNaoVisto } from "@/modules/notificacoes/avisos/recentes";

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
  const [recebidoEm, setRecebidoEm] = useState<string | null>(null);
  const [ultimaVisitaMs, setUltimaVisitaMs] = useState<number | null>(null);

  // Estando na tela de Avisos a pessoa está vendo: registra a visita (apaga o ponto).
  useEffect(() => {
    if (ativo) {
      const agora = Date.now();
      try {
        window.localStorage.setItem(chaveVisita(chaveUsuario), String(agora));
      } catch {
        // storage indisponível (janela privada…): vale só nesta sessão da tela.
      }
      setUltimaVisitaMs(agora);
    } else {
      setUltimaVisitaMs(lerUltimaVisita(chaveUsuario));
    }
  }, [ativo, chaveUsuario, pathname]);

  // Reconsulta ao montar e a cada troca de página.
  useEffect(() => {
    let cancelado = false;
    ultimoAvisoRecebidoEm()
      .then((r) => {
        if (!cancelado) setRecebidoEm(r);
      })
      .catch(() => {
        if (!cancelado) setRecebidoEm(null);
      });
    return () => {
      cancelado = true;
    };
  }, [pathname]);

  const mostrarPonto = !ativo && avisoRecenteNaoVisto(recebidoEm, ultimaVisitaMs, new Date());

  return (
    <Link
      href="/avisos"
      aria-label="Avisos"
      title="Avisos"
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
