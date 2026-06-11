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
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await solicitarResetSenha(formData);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Informe seu e-mail. A administração será notificada para redefinir sua senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">E-mail</Label>
            <Input id="reset-email" name="email" type="email" required autoFocus />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enviando…" : "Solicitar redefinição"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
