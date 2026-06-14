"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Download } from "lucide-react";
import { salvarFeriado, excluirFeriado, importarFeriadosNacionais } from "@/modules/rh/feriados/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Feriado = { id: string; data: string; nome: string; tipo: string };

export function FeriadosView({ ano, feriados }: { ano: number; feriados: Feriado[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const atual = new Date().getFullYear();
  const anos = [atual + 1, atual, atual - 1];

  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  function adicionar() {
    if (!data || !nome.trim()) return;
    start(async () => {
      const r = await salvarFeriado({ data, nome, tipo: "municipal" });
      if (r.ok) {
        toast.success("Feriado salvo.");
        setData("");
        setNome("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function remover(id: string) {
    start(async () => {
      const r = await excluirFeriado({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function importar() {
    start(async () => {
      const r = await importarFeriadosNacionais({ ano });
      if (r.ok) {
        toast.success(`${r.data.total} feriados nacionais importados.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Feriados</h2>
        <p className="text-sm text-muted-foreground">
          Usados no ponto/escala (descontam do esperado de horas no banco de horas).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={String(ano)} onValueChange={(v) => router.push(`/configuracoes/feriados?ano=${v ?? ano}`)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={importar} disabled={pending}>
          <Download className="size-3.5" /> Importar nacionais {ano}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adicionar feriado</CardTitle>
          <CardDescription>Para feriados estaduais/municipais.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-44" />
            <Input placeholder="Nome do feriado" value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1 min-w-48" />
            <Button size="sm" onClick={adicionar} disabled={pending || !data || !nome.trim()}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{feriados.length} feriado(s) em {ano}</CardTitle>
        </CardHeader>
        <CardContent>
          {feriados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum feriado. Importe os nacionais acima.</p>
          ) : (
            <ul className="divide-y text-sm">
              {feriados.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-28 font-mono text-xs capitalize text-muted-foreground">{fmt(f.data)}</span>
                    <span>{f.nome}</span>
                    <Badge variant="outline" className="capitalize">{f.tipo}</Badge>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(f.id)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
