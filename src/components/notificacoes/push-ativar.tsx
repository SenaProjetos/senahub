"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { habilitarPush } from "@/components/notificacoes/push-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Estado do Web Push NESTE dispositivo/navegador (não é preferência de conta):
 * - nao_suportado: navegador sem push OU página fora de contexto seguro (http em IP
 *   da rede não registra Service Worker) OU iOS sem o app instalado na tela de início.
 * - bloqueado: usuário negou a permissão — só destrava nas configurações do site.
 * - inativo: permissão nunca pedida (é aqui que o banner/botão agem).
 * - ativo: permissão concedida; o PushManager do layout mantém a inscrição.
 */
type EstadoPush = "carregando" | "nao_suportado" | "bloqueado" | "inativo" | "ativo";

function estadoAtual(): EstadoPush {
  if (typeof window === "undefined") return "carregando";
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window) ||
    !("PushManager" in window)
  ) {
    return "nao_suportado";
  }
  if (Notification.permission === "granted") return "ativo";
  if (Notification.permission === "denied") return "bloqueado";
  return "inativo";
}

function usePushEstado() {
  const [estado, setEstado] = useState<EstadoPush>("carregando");
  useEffect(() => setEstado(estadoAtual()), []);

  async function ativar() {
    const ok = await habilitarPush();
    setEstado(estadoAtual());
    if (ok) toast.success("Notificações ativadas neste dispositivo.");
    else toast.error("Não foi possível ativar — verifique a permissão de notificações do navegador.");
    return ok;
  }

  return { estado, ativar };
}

const DISPENSA_KEY = "push-banner-dispensado";

/** Banner compacto (chat): aparece só enquanto a permissão nunca foi pedida. */
export function PushBanner() {
  const { estado, ativar } = usePushEstado();
  const [dispensado, setDispensado] = useState(true);

  useEffect(() => {
    setDispensado(localStorage.getItem(DISPENSA_KEY) === "1");
  }, []);

  if (estado !== "inativo" || dispensado) return null;

  return (
    <div className="flex items-center gap-2 border-b bg-primary/5 px-2 py-1.5">
      <Bell className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-xs">
        Ative as notificações para receber mensagens mesmo com o app fechado.
      </p>
      <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => void ativar()}>
        Ativar
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label="Dispensar aviso de notificações"
        onClick={() => {
          localStorage.setItem(DISPENSA_KEY, "1");
          setDispensado(true);
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

const ESTADO_INFO: Record<
  Exclude<EstadoPush, "carregando">,
  { icone: typeof Bell; titulo: string; detalhe: string }
> = {
  ativo: {
    icone: BellRing,
    titulo: "Ativadas",
    detalhe: "Você recebe mensagens do chat e alertas do sistema mesmo com o app fechado.",
  },
  inativo: {
    icone: Bell,
    titulo: "Desativadas",
    detalhe: "Ative para receber mensagens do chat e alertas mesmo com o app fechado.",
  },
  bloqueado: {
    icone: BellOff,
    titulo: "Bloqueadas pelo navegador",
    detalhe: "Libere as notificações nas permissões deste site (ícone de cadeado na barra de endereço).",
  },
  nao_suportado: {
    icone: BellOff,
    titulo: "Indisponíveis neste navegador",
    detalhe:
      "Este navegador não suporta push (ou o acesso não é HTTPS). No iPhone/iPad, instale o app pela opção “Adicionar à Tela de Início” do Safari.",
  },
};

/** Card de /preferencias: status do push neste dispositivo + botão de ativação. */
export function PushDispositivoCard() {
  const { estado, ativar } = usePushEstado();

  if (estado === "carregando") return null;
  const info = ESTADO_INFO[estado];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Notificações neste dispositivo</CardTitle>
        <CardDescription>
          Permissão do navegador para avisar com o app fechado — vale só para este
          dispositivo, diferente das preferências acima.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <info.icone className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{info.titulo}</p>
              <p className="text-xs text-muted-foreground">{info.detalhe}</p>
            </div>
          </div>
          {estado === "inativo" && (
            <Button size="sm" className="shrink-0" onClick={() => void ativar()}>
              Ativar notificações
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
