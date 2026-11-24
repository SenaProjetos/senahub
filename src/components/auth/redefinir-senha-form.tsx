"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redefinirSenhaPeloLink } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/auth/brand-logo";
import { CampoSenha } from "@/components/auth/campo-senha";
import { LinkRedefinicaoInvalido } from "@/components/auth/link-redefinicao-invalido";

/** Formulário da senha nova aberto pelo link do e-mail ("Esqueci minha senha"). */
export function RedefinirSenhaForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linkMorto, setLinkMorto] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      try {
        const res = await redefinirSenhaPeloLink(formData);
        if (res.ok) {
          router.replace("/login?senha=redefinida");
          return;
        }
        if (res.linkInvalido) {
          setLinkMorto(res.message);
          return;
        }
        setErro(res.message);
      } catch {
        setErro("Não foi possível salvar a senha agora. Tente de novo em instantes.");
      }
      formRef.current?.querySelector<HTMLInputElement>("#novaSenha")?.focus();
    });
  }

  if (linkMorto) return <LinkRedefinicaoInvalido mensagem={linkMorto} />;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <BrandLogo className="mb-2 h-14 w-auto" />
        <CardTitle role="heading" aria-level={1} className="text-xl">
          Crie sua nova senha
        </CardTitle>
        <CardDescription id="dica-senha">
          Use pelo menos 8 caracteres. Depois de salvar, você entra de novo com a senha nova em todos os aparelhos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
          <input type="hidden" name="token" value={token} />
          <fieldset disabled={pending} className="space-y-4">
            <CampoSenha
              id="novaSenha"
              name="novaSenha"
              label="Nova senha"
              descricaoId={erro ? "dica-senha erro-senha" : "dica-senha"}
              invalido={!!erro}
            />
            <CampoSenha
              id="confirmar"
              name="confirmar"
              label="Confirmar senha"
              descricaoId={erro ? "erro-senha" : undefined}
              invalido={!!erro}
            />
          </fieldset>
          <p id="erro-senha" role="alert" className="text-sm text-destructive empty:hidden">
            {erro}
          </p>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
