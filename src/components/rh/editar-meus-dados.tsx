"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Clock } from "lucide-react";
import { proporAlteracaoCadastro } from "@/modules/rh/cadastro/actions";
import { CAMPOS_AUTOEDITAVEIS, LABEL_CAMPO, type CampoAutoeditavel } from "@/modules/rh/cadastro/whitelist";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Valores = Partial<Record<CampoAutoeditavel, string | null>>;
type Pendente = { alteracoes: Record<string, string>; propostoEm: string } | null;

const GRUPOS = ["Contato", "Emergência", "Endereço", "Dados bancários"] as const;

export function EditarMeusDados({ atual, pendente }: { atual: Valores; pendente: Pendente }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const inicial = useMemo(() => {
    const o: Record<string, string> = {};
    for (const c of CAMPOS_AUTOEDITAVEIS) o[c.campo] = (atual[c.campo] as string | null) ?? "";
    return o;
  }, [atual]);
  const [form, setForm] = useState<Record<string, string>>(inicial);

  function abrir() {
    setForm(inicial);
    setAberto(true);
  }

  function enviar() {
    // Só os campos alterados vão na proposta.
    const alteracoes: Record<string, string> = {};
    for (const c of CAMPOS_AUTOEDITAVEIS) {
      if ((form[c.campo] ?? "") !== (inicial[c.campo] ?? "")) alteracoes[c.campo] = form[c.campo] ?? "";
    }
    if (Object.keys(alteracoes).length === 0) {
      toast.info("Nada foi alterado.");
      return;
    }
    start(async () => {
      const res = await proporAlteracaoCadastro({ alteracoes });
      if (res.ok) {
        toast.success("Enviado para validação do RH.");
        setAberto(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  if (pendente) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <Clock className="size-4" /> Alterações aguardando validação do RH
          </p>
          <p className="text-xs text-muted-foreground">Enviado em {formatarData(pendente.propostoEm)}. Você poderá editar de novo após o RH validar.</p>
          <ul className="mt-1 space-y-1 text-sm">
            {Object.entries(pendente.alteracoes).map(([campo, valor]) => (
              <li key={campo}>
                <span className="text-muted-foreground">{LABEL_CAMPO[campo] ?? campo}:</span> {valor || <span className="text-muted-foreground">(vazio)</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={abrir}>
          <Pencil className="size-4" /> Editar meus dados
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar meus dados</DialogTitle>
            <DialogDescription>
              Você propõe as alterações; elas só entram após o RH validar. Salário, cargo e CPF não são editáveis aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {GRUPOS.map((grupo) => (
              <div key={grupo} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</p>
                {grupo === "Dados bancários" && (
                  <p className="text-xs text-warning">Mudança de conta bancária passa por validação reforçada do RH.</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {CAMPOS_AUTOEDITAVEIS.filter((c) => c.grupo === grupo).map((c) => (
                    <div key={c.campo} className="space-y-1.5">
                      <Label htmlFor={`f-${c.campo}`} className="text-xs">{c.label}</Label>
                      <Input
                        id={`f-${c.campo}`}
                        value={form[c.campo] ?? ""}
                        onChange={(e) => setForm({ ...form, [c.campo]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={pending}>{pending ? "Enviando…" : "Enviar para validação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
