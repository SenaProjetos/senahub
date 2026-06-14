"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { adicionarDependente, removerDependente, salvarSalario } from "@/modules/rh/funcionarios/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Dep = { id: string; nome: string; nascimento: string | null; parentesco: string | null };
type Func = { id: string; name: string; role: string; salarioBase: number | null; dependentes: Dep[] };

function FuncCard({ f }: { f: Func }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [salario, setSalario] = useState(f.salarioBase != null ? String(f.salarioBase) : "");

  function salvarSal() {
    start(async () => {
      const r = await salvarSalario({ userId: f.id, salarioBase: Number(salario) || 0 });
      if (r.ok) {
        toast.success("Salário salvo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function add() {
    if (!nome.trim()) return;
    start(async () => {
      const r = await adicionarDependente({ userId: f.id, nome, nascimento, parentesco: "" });
      if (r.ok) {
        toast.success("Dependente adicionado.");
        setNome("");
        setNascimento("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rm(id: string) {
    start(async () => {
      const r = await removerDependente({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{f.name}</CardTitle>
        <CardDescription>
          {ROLE_LABELS[f.role as Role] ?? f.role} · {f.dependentes.length} dependente(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Salário base (R$)</Label>
            <Input type="number" step="0.01" min="0" value={salario} onChange={(e) => setSalario(e.target.value)} className="w-40" />
          </div>
          <Button size="sm" variant="outline" onClick={salvarSal} disabled={pending}>
            Salvar
          </Button>
        </div>
        {f.dependentes.length > 0 && (
          <ul className="divide-y text-sm">
            {f.dependentes.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {d.nome}
                  {d.nascimento && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {new Date(d.nascimento + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </span>
                <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => rm(d.id)} disabled={pending}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Nome do dependente" value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1 min-w-40" />
          <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className="w-40" />
          <Button size="sm" variant="outline" onClick={add} disabled={pending || !nome.trim()}>
            <Plus className="size-3.5" /> Dependente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FuncionariosView({ funcionarios }: { funcionarios: Func[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Funcionários</h2>
        <p className="text-sm text-muted-foreground">
          Dependentes dos colaboradores CLT/estagiário (usados na dedução de IRRF da folha).
        </p>
      </div>
      {funcionarios.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Users className="size-4" /> Nenhum funcionário CLT/estagiário ativo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {funcionarios.map((f) => (
            <FuncCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
