"use client";

import { useEffect, useState } from "react";
import { Bell, Download, Share, X } from "lucide-react";
import { toast } from "sonner";
import { habilitarPush } from "@/components/notificacoes/push-manager";
import {
  aoMudarInstalacao,
  ehIos,
  esperarInstalacao,
  instalacaoDisponivel,
  rodandoInstalado,
} from "@/components/pwa/instalacao";
import { Button } from "@/components/ui/button";

const CHAVE_INSTALAR = "instalar-app-dispensado";
const CHAVE_NOTIF = "notif-app-dispensado";

function lerDispensa(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}
function gravarDispensa(chave: string) {
  try {
    localStorage.setItem(chave, "1");
  } catch {
    // Sem armazenamento: o convite volta na próxima visita.
  }
}

type Modo = "nada" | "instalar" | "ios" | "notificacao";

/**
 * Convite do celular no Início (plano 2026-09-25, 3.5). No navegador: botão de instalar (Android) ou
 * o passo a passo do Safari (iPhone, onde não existe prompt). Já instalado: convite para ligar as
 * notificações — no iPhone, push só funciona com o app instalado, então este é o momento certo.
 * Cada convite some ao ser dispensado e não volta.
 */
export function InstalarApp() {
  const [modo, setModo] = useState<Modo>("nada");

  useEffect(() => {
    const calcular = () => {
      if (!window.matchMedia("(max-width: 47.99rem)").matches) return setModo("nada");
      if (rodandoInstalado()) {
        const podeNotificar = "Notification" in window && "serviceWorker" in navigator && window.isSecureContext;
        return setModo(podeNotificar && Notification.permission === "default" && !lerDispensa(CHAVE_NOTIF) ? "notificacao" : "nada");
      }
      if (lerDispensa(CHAVE_INSTALAR)) return setModo("nada");
      if (instalacaoDisponivel()) return setModo("instalar");
      setModo(ehIos() ? "ios" : "nada");
    };
    calcular();
    return aoMudarInstalacao(calcular);
  }, []);

  if (modo === "nada") return null;

  const dispensar = (chave: string) => {
    gravarDispensa(chave);
    setModo("nada");
  };

  async function instalar() {
    const ev = instalacaoDisponivel();
    if (!ev) return;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    esperarInstalacao();
    if (outcome === "accepted") toast.success("App instalado. Abra pelo ícone na tela inicial.");
  }

  async function ativarNotificacoes() {
    const ok = await habilitarPush();
    if (ok) toast.success("Notificações ativadas neste dispositivo.");
    else toast.error("Não foi possível ativar — verifique a permissão de notificações.");
    setModo("nada");
  }

  const chave = modo === "notificacao" ? CHAVE_NOTIF : CHAVE_INSTALAR;
  return (
    <section aria-label="Instalar o app" className="flex items-start gap-3 rounded-md border bg-primary/5 p-3 md:hidden">
      {modo === "notificacao" ? <Bell className="mt-0.5 size-5 shrink-0 text-primary" /> : <Download className="mt-0.5 size-5 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1 space-y-2">
        {modo === "instalar" && (
          <>
            <p className="text-[15px] font-medium">Instale o SenaHub no celular</p>
            <p className="text-sm text-muted-foreground">Abre em tela cheia, direto do ícone, como um aplicativo.</p>
            <Button onClick={() => void instalar()}>Instalar</Button>
          </>
        )}
        {modo === "ios" && (
          <>
            <p className="text-[15px] font-medium">Instale o SenaHub no iPhone</p>
            <p className="text-sm text-muted-foreground">
              No Safari, toque em <Share className="mx-0.5 inline size-4 align-text-bottom" aria-label="Compartilhar" /> e depois em
              “Adicionar à Tela de Início”. Só assim as notificações funcionam no iPhone.
            </p>
          </>
        )}
        {modo === "notificacao" && (
          <>
            <p className="text-[15px] font-medium">Receba avisos com o app fechado</p>
            <p className="text-sm text-muted-foreground">Mensagens do chat, prazos e aprovações chegam como notificação.</p>
            <Button onClick={() => void ativarNotificacoes()}>Ativar notificações</Button>
          </>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label="Dispensar" className="shrink-0" onClick={() => dispensar(chave)}>
        <X className="size-4" />
      </Button>
    </section>
  );
}
