"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  criarOnboarding,
  toggleOnboardingItem,
  removerOnboarding,
} from "@/modules/rh/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Processo = {
  id: string;
  user: { name: string; role: string };
  itens: { id: string; descricao: string; concluido: boolean }[];
};

export function OnboardingAdmin({
  processos,
  templates,
  usuarios,
}: {
  processos: Processo[];
  templates: { id: string; nome: string }[];
  usuarios: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  function criar() {
    if (!userId || !templateId) {
      toast.error("Selecione colaborador e template.");
      return;
    }
    start(async () => {
      const r = await criarOnboarding({ userId, templateId });
      if (r.ok) {
        toast.success("Onboarding iniciado.");
        setUserId("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function toggle(id: string, concluido: boolean) {
    start(async () => {
      const r = await toggleOnboardingItem({ id, concluido });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await removerOnboarding({ id });
      if (r.ok) {
        toast.success("Onboarding removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Onboarding</CardTitle>
        <CardDescription>Checklists de admissão por colaborador.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Colaborador…" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={criar} disabled={pending}>
            <Plus className="size-3.5" /> Iniciar
          </Button>
        </div>

        {processos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum onboarding em andamento.</p>
        ) : (
          <div className="space-y-3">
            {processos.map((p) => {
              const done = p.itens.filter((i) => i.concluido).length;
              return (
                <div key={p.id} className="space-y-2 rounded-sm border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {p.user.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {done}/{p.itens.length}
                      </span>
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remover(p.id)}
                      aria-label="Remover"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <ul className="space-y-1">
                    {p.itens.map((it) => (
                      <li key={it.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={it.concluido}
                            onChange={(e) => toggle(it.id, e.target.checked)}
                          />
                          <span className={it.concluido ? "text-muted-foreground line-through" : ""}>
                            {it.descricao}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
