"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { salvarPadraoDocumento } from "@/modules/documentos/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none";

type Fonte = {
  id: string;
  label: string;
  modelos: { id: string; nome: string }[];
  padrao: string;
};

export function PadroesDocumentoView({ fontes }: { fontes: Fonte[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function salvar(fonte: string, modeloId: string) {
    start(async () => {
      const r = await salvarPadraoDocumento({ fonte, modeloId: modeloId === NONE ? "" : modeloId });
      if (r.ok) {
        toast.success("Modelo padrão atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/configuracoes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Documentos padrão</h2>
        <p className="text-sm text-muted-foreground">
          Modelo do Estúdio usado por padrão em cada fonte (ex.: proposta usa o modelo X). O botão
          “Gerar documento” mostra o padrão em primeiro lugar.
        </p>
      </div>

      {fontes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum modelo vinculado a uma fonte ainda. Crie modelos no Estúdio de Documentos.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por fonte de dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fontes.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm font-medium">{f.label}</Label>
                <Select
                  value={f.padrao || NONE}
                  onValueChange={(v) => salvar(f.id, v ?? NONE)}
                  disabled={pending}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— sem padrão</SelectItem>
                    {f.modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
