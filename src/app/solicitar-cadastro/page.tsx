"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { solicitarCadastro } from "@/modules/auth/cadastro/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OPCOES_VINCULO_PRETENDIDO, type VinculoPretendido } from "@/modules/auth/cadastro/vinculos";

export default function SolicitarCadastroPage() {
  const [form, setForm] = useState<{ nome: string; email: string; telefone: string; vinculo: VinculoPretendido; mensagem: string }>({
    nome: "",
    email: "",
    telefone: "",
    vinculo: "externo",
    mensagem: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    if (!form.nome.trim() || !form.email.trim()) {
      toast.error("Informe nome e e-mail.");
      return;
    }
    setEnviando(true);
    try {
      const r = await solicitarCadastro(form);
      if (r.ok) setEnviado(true);
      else toast.error(r.error);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Solicitar acesso</CardTitle>
          <CardDescription>Envie seus dados — o administrador avaliará o pedido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {enviado ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-success">Pedido enviado! Você será contatado após a avaliação.</p>
              <Button variant="outline" render={<Link href="/login" />}>Voltar ao login</Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo / vínculo</Label>
                <Select value={form.vinculo} onValueChange={(v) => v && setForm({ ...form, vinculo: v as VinculoPretendido })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_VINCULO_PRETENDIDO.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Como você pretende usar o sistema. O administrador confirma o vínculo ao aprovar.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Telefone (opcional)</Label>
                <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Mensagem (opcional)</Label>
                <Input value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">Voltar ao login</Link>
                <Button onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
