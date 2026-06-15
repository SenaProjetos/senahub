"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PreferenciasView({
  somChat: somChatInicial,
  mostrarRecibos: recibosInicial,
}: {
  somChat: boolean;
  mostrarRecibos: boolean;
}) {
  const [somChat, setSomChat] = useState(somChatInicial);
  const [mostrarRecibos, setMostrarRecibos] = useState(recibosInicial);
  const [, start] = useTransition();

  function salvar(chave: string, valor: boolean) {
    start(async () => {
      const r = await salvarPreferencia({ chave, valor });
      if (r.ok) toast.success("Preferência salva.");
      else toast.error(r.error);
    });
  }

  const opcoes = [
    {
      chave: "somChat",
      titulo: "Som de notificação do chat",
      descricao: "Tocar um som ao receber novas mensagens.",
      valor: somChat,
      set: setSomChat,
    },
    {
      chave: "mostrarRecibos",
      titulo: "Mostrar recibos de leitura",
      descricao: "Exibir ✓✓ quando suas mensagens forem lidas.",
      valor: mostrarRecibos,
      set: setMostrarRecibos,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Preferências</h2>
        <p className="text-sm text-muted-foreground">Ajustes pessoais — salvos na sua conta.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chat</CardTitle>
          <CardDescription>Notificações e recibos de leitura.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {opcoes.map((o) => (
            <div key={o.chave} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label className="text-sm font-medium">{o.titulo}</Label>
                <p className="text-xs text-muted-foreground">{o.descricao}</p>
              </div>
              <Switch
                checked={o.valor}
                onCheckedChange={(v: boolean) => {
                  o.set(v);
                  salvar(o.chave, v);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
