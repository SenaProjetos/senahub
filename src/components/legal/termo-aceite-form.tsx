"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aceitarTermo } from "@/modules/legal/actions";
import type { TipoTermo } from "@/modules/legal/termos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TermoAceiteForm({
  tipo,
  versao,
  titulo,
  conteudo,
}: {
  tipo: TipoTermo;
  versao: string;
  titulo: string;
  conteudo: string;
}) {
  const router = useRouter();
  const [aceito, setAceito] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    if (!aceito) return;
    startTransition(async () => {
      const res = await aceitarTermo({ tipo, versao });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Aceite registrado: o gate do layout libera o acesso no próximo render.
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">{titulo}</CardTitle>
        <CardDescription>
          Versão {versao} — leia o termo abaixo e confirme para continuar usando o sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {conteudo}
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Label className="flex items-start gap-2 font-normal">
          <Checkbox
            checked={aceito}
            onCheckedChange={(checked) => setAceito(checked === true)}
            className="mt-0.5"
          />
          <span>Li e aceito o Termo de Uso e Consentimento.</span>
        </Label>
        <Button onClick={onSubmit} disabled={!aceito || pending} className="w-full">
          {pending ? "Registrando…" : "Aceitar e continuar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
