"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import { definirMembros } from "@/modules/projetos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

type Interno = { id: string; name: string; role: string };

/**
 * Gerencia os membros MANUAIS da equipe (equipe externa). Os responsáveis das
 * disciplinas entram na equipe automaticamente e não aparecem aqui.
 */
export function EquipeManager({
  projetoId,
  internos,
  membrosAtuais,
}: {
  projetoId: string;
  internos: Interno[];
  membrosAtuais: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<string[]>(membrosAtuais);

  function toggle(userId: string) {
    setSel((s) => (s.includes(userId) ? s.filter((x) => x !== userId) : [...s, userId]));
  }

  function abrir() {
    setSel(membrosAtuais);
    setOpen(true);
  }

  function salvar() {
    start(async () => {
      const res = await definirMembros({ projetoId, membrosIds: sel });
      if (res.ok) {
        toast.success("Equipe atualizada.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <UserPlus className="size-4" /> Adicionar membro
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Equipe do projeto</DialogTitle>
            <DialogDescription>
              Adicione membros manualmente. Responsáveis de disciplinas já entram na equipe
              automaticamente.
            </DialogDescription>
          </DialogHeader>

          {internos.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário interno disponível" />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {internos.map((u) => {
                const ativo = sel.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                      ativo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar equipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
