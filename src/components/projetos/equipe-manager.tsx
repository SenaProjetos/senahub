"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Users, X } from "lucide-react";
import { definirMembros } from "@/modules/projetos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type MembroLocal = { userId: string; papel: string };

export function EquipeManager({
  projetoId,
  internos,
  membrosAtuais,
}: {
  projetoId: string;
  internos: Interno[];
  membrosAtuais: { userId: string; papel: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [membros, setMembros] = useState<MembroLocal[]>([]);

  function abrir() {
    setMembros(membrosAtuais.map((m) => ({ userId: m.userId, papel: m.papel ?? "" })));
    setOpen(true);
  }

  function toggle(userId: string) {
    setMembros((prev) =>
      prev.some((m) => m.userId === userId)
        ? prev.filter((m) => m.userId !== userId)
        : [...prev, { userId, papel: "" }],
    );
  }

  function setPapel(userId: string, papel: string) {
    setMembros((prev) => prev.map((m) => (m.userId === userId ? { ...m, papel } : m)));
  }

  function salvar() {
    start(async () => {
      const res = await definirMembros({
        projetoId,
        membros: membros.map((m) => ({ userId: m.userId, papel: m.papel || null })),
      });
      if (res.ok) {
        toast.success("Equipe atualizada.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const selecionados = new Set(membros.map((m) => m.userId));

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
              Adicione membros e defina o papel de cada um. Responsáveis de disciplinas
              entram na equipe automaticamente.
            </DialogDescription>
          </DialogHeader>

          {internos.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário interno disponível" />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {internos
                  .filter((u) => !selecionados.has(u.id))
                  .map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => toggle(u.id)}
                      className="rounded-sm border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      + {u.name}
                    </button>
                  ))}
                {internos.filter((u) => !selecionados.has(u.id)).length === 0 && membros.length > 0 && (
                  <p className="text-xs text-muted-foreground">Todos os internos adicionados.</p>
                )}
              </div>

              {membros.length > 0 && (
                <div className="divide-y rounded-sm border">
                  {membros.map((m) => {
                    const u = internos.find((x) => x.id === m.userId);
                    return (
                      <div key={m.userId} className="flex items-center gap-2 p-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{u?.name ?? m.userId}</span>
                        <Input
                          value={m.papel}
                          onChange={(e) => setPapel(m.userId, e.target.value)}
                          placeholder="Papel (ex.: BIM Manager)"
                          className="h-7 w-40 text-xs"
                        />
                        <button type="button" onClick={() => toggle(m.userId)} className="text-muted-foreground hover:text-destructive">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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
