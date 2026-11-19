"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatarData } from "@/lib/utils";
import { salvarResumoPortal } from "@/modules/portal/resumo-actions";

/** Configurações → Portal do cliente: liga e desliga o resumo diário por e-mail. */
export function PortalConfigView({ ativo, desde }: { ativo: boolean; desde: string | null }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(ativo);
  const [pendente, startTransition] = useTransition();

  function alternar(valor: boolean) {
    setLigado(valor);
    startTransition(async () => {
      const r = await salvarResumoPortal({ ativo: valor });
      if (r.ok) {
        toast.success(valor ? "Resumo diário ligado." : "Resumo diário desligado.");
        router.refresh();
      } else {
        setLigado(!valor);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Portal do cliente" descricao="Avisos enviados aos clientes do portal." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Resumo diário por e-mail</CardTitle>
          <CardDescription>
            Às 7h, cada conta do portal recebe um e-mail por projeto que andou no dia anterior (pranchas compartilhadas,
            liberadas para obra, fases concluídas). Dia sem novidade não manda nada. O cliente pode desligar em Meus
            projetos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch id="resumo-portal" checked={ligado} disabled={pendente} onCheckedChange={(v: boolean) => alternar(v)} />
            <Label htmlFor="resumo-portal">{ligado ? "Ligado" : "Desligado"}</Label>
          </div>
          {ligado && desde && <p className="text-sm text-muted-foreground">Ligado desde {formatarData(desde)}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
