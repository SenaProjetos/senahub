"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "@/lib/auth-client";
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
import { RecuperarSenhaDialog } from "@/components/auth/recuperar-senha-dialog";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entrando, setEntrando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn.email({ email, password });

    if (error) {
      setLoading(false);
      toast.error(
        error.status === 401 || error.status === 403
          ? "E-mail ou senha incorretos."
          : error?.message || "Não foi possível entrar. Tente novamente.",
      );
      return;
    }
    setEntrando(true);
    router.push(params.get("from") ?? "/");
    router.refresh();
  }

  if (entrando) {
    return <AuthLoadingOverlay label="Entrando…" />;
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <BrandLogo className="mb-2 h-14 w-auto" />
        <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
        <CardDescription>Acesse a plataforma de gestão integrada</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.14em]">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.14em]">
              Senha
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
          <div className="flex justify-between pt-1 text-xs text-muted-foreground">
            <RecuperarSenhaDialog />
            <a href="/solicitar-cadastro" className="hover:text-foreground">Solicitar acesso</a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
