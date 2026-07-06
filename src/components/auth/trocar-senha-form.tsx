"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
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
import { AuthLoadingOverlay } from "@/components/auth/auth-loading-overlay";

/** Campo de senha com botão de exibir/ocultar próprio. */
function CampoSenha({ id, name, label }: { id: string; name: string; label: string }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={mostrar}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

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
