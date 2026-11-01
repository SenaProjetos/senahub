"use client";

import { PAPEIS_PROJETO, ROTULO_PAPEL, type PapelProjeto } from "@/modules/projetos/papeis";
import type { Contratacao } from "@/generated/prisma/enums";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Interno = { id: string; name: string; contratacao: Contratacao | null; cargo: string | null };
/** `papel` vazio = "Sem papel". */
type MembroLocal = { userId: string; papel: string };
const SEM_PAPEL = "__sem_papel";

export function EquipeManager({
  projetoId,
  internos,
  membrosAtuais,
  compacto = false,
}: {
  projetoId: string;
  internos: Interno[];
  membrosAtuais: { userId: string; papel: string | null }[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [membros, setMembros] = useState<MembroLocal[]>([]);
  const [busca, setBusca] = useState("");

  function abrir() {
    // Papel fora da lista fixa (dado antigo) aparece como "Sem papel" e é regravado como tal ao salvar.
    setMembros(membrosAtuais.map((m) => ({ userId: m.userId, papel: m.papel && (PAPEIS_PROJETO as readonly string[]).includes(m.papel) ? m.papel : "" })));
    setBusca("");
    setOpen(true);
  }

  function toggle(userId: string) {
    setMembros((prev) => {
      if (prev.some((m) => m.userId === userId)) return prev.filter((m) => m.userId !== userId);
      return [...prev, { userId, papel: "" }];
    });
  }

  function setPapel(userId: string, papel: string) {
    setMembros((prev) => prev.map((m) => (m.userId === userId ? { ...m, papel } : m)));
  }

  function salvar() {
    start(async () => {
      const res = await definirMembros({
        projetoId,
        membros: membros.map((m) => ({ userId: m.userId, papel: (PAPEIS_PROJETO as readonly string[]).includes(m.papel) ? (m.papel as PapelProjeto) : null })),
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
      {compacto ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon-sm" onClick={abrir} aria-label="Adicionar membro">
                <UserPlus className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Adicionar membro</TooltipContent>
        </Tooltip>
      ) : (
        <Button variant="outline" size="sm" onClick={abrir}>
          <UserPlus className="size-4" /> Adicionar membro
        </Button>
      )}

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
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome…"
                className="h-8 text-sm"
              />
              <div className="max-h-40 divide-y overflow-y-auto rounded-sm border">
                {internos
                  .filter((u) => !selecionados.has(u.id) && u.name.toLowerCase().includes(busca.trim().toLowerCase()))
                  .map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => toggle(u.id)}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <span>{u.name}</span>
                      <span className="text-primary">+ adicionar</span>
                    </button>
                  ))}
                {internos.filter((u) => !selecionados.has(u.id) && u.name.toLowerCase().includes(busca.trim().toLowerCase())).length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    {membros.length > 0 ? "Todos os internos adicionados." : "Nenhum usuário encontrado."}
                  </p>
                )}
              </div>

              {membros.length > 0 && (
                <div className="divide-y rounded-sm border">
                  {membros.map((m) => {
                    const u = internos.find((x) => x.id === m.userId);
                    return (
                      <div key={m.userId} className="flex items-center gap-2 p-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{u?.name ?? m.userId}</span>
                        <Select value={m.papel || SEM_PAPEL} onValueChange={(v) => setPapel(m.userId, !v || v === SEM_PAPEL ? "" : v)}>
                          <SelectTrigger size="sm" className="w-44" aria-label={`Papel de ${u?.name ?? "membro"}`}>
                            <SelectValue placeholder="Papel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_PAPEL}>Sem papel</SelectItem>
                            {PAPEIS_PROJETO.map((p) => (
                              <SelectItem key={p} value={p}>
                                {ROTULO_PAPEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button type="button" onClick={() => toggle(m.userId)} aria-label={`Remover ${u?.name ?? "membro"} da equipe`} className="text-muted-foreground hover:text-destructive">
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
