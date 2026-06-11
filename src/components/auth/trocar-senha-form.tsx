"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { trocarSenha } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/auth/brand-logo";

export function TrocarSenhaForm({ primeiroAcesso }: { primeiroAcesso: boolean }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await trocarSenha(formData);
      // Em sucesso a action redireciona; só chega aqui em erro.
      if (res && !res.ok) toast.error(res.message);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <BrandLogo className="mb-2 h-14 w-auto" />
        <CardTitle className="text-xl">
          {primeiroAcesso ? "Defina sua senha" : "Trocar senha"}
        </CardTitle>
        <CardDescription>
          {primeiroAcesso
            ? "Primeiro acesso — crie uma senha pessoal para continuar."
            : "Escolha uma nova senha de acesso."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="novaSenha">Nova senha</Label>
            <Input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar">Confirmar senha</Label>
            <Input id="confirmar" name="confirmar" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Salvar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
