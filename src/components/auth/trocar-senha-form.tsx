"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { trocarSenha } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/auth/campo-senha";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/auth/brand-logo";
import { AuthLoadingOverlay } from "@/components/auth/auth-loading-overlay";

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

  if (pending) {
    return <AuthLoadingOverlay label="Um instante…" />;
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
          <CampoSenha id="novaSenha" name="novaSenha" label="Nova senha" />
          <CampoSenha id="confirmar" name="confirmar" label="Confirmar senha" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Salvar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
