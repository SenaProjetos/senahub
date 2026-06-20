"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { enviarAvisoGeral } from "@/modules/notificacoes/avisos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function AvisoGeralView() {
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [incluirClientes, setIncluirClientes] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  async function enviar() {
    if (!titulo.trim()) {
      toast.error("Informe o título.");
      return;
    }
    if (
      !(await confirm({
        title: "Enviar aviso geral?",
        description: "O aviso vai para todos os usuários.",
        variant: "default",
        confirmLabel: "Enviar",
      }))
    )
      return;
    start(async () => {
      const r = await enviarAvisoGeral({ titulo, corpo, incluirClientes });
      if (r.ok) {
        toast.success(`Aviso enviado para ${r.data.destinatarios} usuário(s).`);
        setTitulo("");
        setCorpo("");
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Aviso geral</h2>
        <p className="text-sm text-muted-foreground">Envia uma notificação (sino + push) para todos os usuários.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="size-4" /> Nova mensagem</CardTitle>
          <CardDescription>Use para comunicados importantes a toda a equipe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Manutenção no sistema sábado" />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem (opcional)</Label>
            <Input value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Detalhes do aviso" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-sm border p-3">
            <div>
              <Label className="text-sm font-medium">Incluir clientes (portal)</Label>
              <p className="text-xs text-muted-foreground">Por padrão envia só para a equipe interna.</p>
            </div>
            <Switch checked={incluirClientes} onCheckedChange={(v: boolean) => setIncluirClientes(v)} />
          </div>
          <Button onClick={enviar} disabled={pending}>
            <Megaphone className="size-3.5" /> {pending ? "Enviando…" : "Enviar aviso"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
