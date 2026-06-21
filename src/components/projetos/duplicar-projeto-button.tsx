"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { duplicarProjeto } from "@/modules/projetos/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const OPCOES = [
  { key: "copiarResponsaveis", label: "Responsáveis das disciplinas", defaultChecked: true },
  { key: "copiarMembros", label: "Membros da equipe", defaultChecked: true },
  { key: "copiarEap", label: "EAP (tarefas e dependências)", defaultChecked: false },
  { key: "copiarComposicao", label: "Composição de preço", defaultChecked: false },
] as const;

type OpcaoKey = (typeof OPCOES)[number]["key"];

export function DuplicarProjetoButton({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [flags, setFlags] = useState<Record<OpcaoKey, boolean>>({
    copiarResponsaveis: true,
    copiarMembros: true,
    copiarEap: false,
    copiarComposicao: false,
  });

  function toggle(key: OpcaoKey, value: boolean) {
    setFlags((prev) => ({ ...prev, [key]: value }));
  }

  function confirmar() {
    start(async () => {
      const res = await duplicarProjeto({ id: projetoId, ...flags });
      if (res.ok) {
        toast.success("Projeto duplicado.");
        setOpen(false);
        router.push(`/projetos/${res.data.id}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="size-4" /> Duplicar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicar projeto</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Selecione o que deseja copiar para o novo projeto. Disciplinas (nome, prazo, valor) são
            sempre copiadas.
          </p>

          <div className="space-y-3">
            {OPCOES.map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={flags[key]}
                  onCheckedChange={(v) => toggle(key, v as boolean)}
                />
                {label}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={pending}>
              {pending ? "Duplicando…" : "Duplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
