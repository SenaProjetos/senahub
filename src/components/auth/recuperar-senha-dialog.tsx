"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { solicitarResetSenha } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RecuperarSenhaDialog() {
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) setErro(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // O dialog fica dentro do <form> do login na árvore React: sem isto o submit sobe até ele e
    // dispara um "Entrar" com e-mail e senha vazios (o portal não corta o evento sintético).
    e.stopPropagation();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      try {
        const res = await solicitarResetSenha(formData);
        if (res.ok) {
          toast.success(res.message, { duration: 8000 });
          setOpen(false);
        } else {
          setErro(res.message);
        }
      } catch {
        setErro("Não foi possível enviar o link agora. Tente de novo em instantes.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <button type="button" className="text-primary hover:underline">
            Esqueci minha senha
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>
            Informe o e-mail que você usa para entrar. Vamos enviar um link para você criar uma nova senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">E-mail</Label>
            {/* campo-ok: e-mail de login (better-auth) */}
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              disabled={pending}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? "reset-erro reset-ajuda" : "reset-ajuda"}
            />
          </div>
          <p id="reset-erro" role="alert" className="text-sm text-destructive empty:hidden">
            {erro}
          </p>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enviando…" : "Enviar link"}
          </Button>
          <p id="reset-ajuda" className="text-xs text-muted-foreground">
            Sem acesso a esse e-mail? Peça à administração para redefinir sua senha.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
