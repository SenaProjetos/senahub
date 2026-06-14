"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Users, Download, FileText } from "lucide-react";
import {
  adicionarDependente,
  removerDependente,
  salvarSalario,
  adicionarDocumentoFuncionario,
  removerDocumentoFuncionario,
} from "@/modules/rh/funcionarios/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIPOS_DOC = ["contrato", "rg", "cpf", "aso", "diploma", "comprovante", "outro"] as const;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Dep = { id: string; nome: string; nascimento: string | null; parentesco: string | null };
type Doc = { id: string; tipo: string; nome: string; nomeArquivo: string; tamanho: number; criadoEm: string };
type Func = { id: string; name: string; role: string; salarioBase: number | null; dependentes: Dep[]; documentos: Doc[] };

function FuncCard({ f }: { f: Func }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [salario, setSalario] = useState(f.salarioBase != null ? String(f.salarioBase) : "");
  const [docTipo, setDocTipo] = useState("contrato");
  const [docNome, setDocNome] = useState("");
  const [busyDoc, setBusyDoc] = useState(false);
  const fileDoc = useRef<HTMLInputElement>(null);

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

  async function enviarDoc() {
    const file = fileDoc.current?.files?.[0];
    if (!docNome.trim() || !file) {
      toast.error("Informe o nome e selecione um arquivo.");
      return;
    }
    setBusyDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rh/funcionarios/documentos", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarDocumentoFuncionario({
        userId: f.id,
        tipo: docTipo as (typeof TIPOS_DOC)[number],
        nome: docNome,
        meta,
      });
      if (r.ok) {
        toast.success("Documento anexado.");
        setDocNome("");
        if (fileDoc.current) fileDoc.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyDoc(false);
    }
  }

  function rmDoc(id: string) {
    start(async () => {
      const r = await removerDocumentoFuncionario({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{f.name}</CardTitle>
        <CardDescription>
          {ROLE_LABELS[f.role as Role] ?? f.role} · {f.dependentes.length} dependente(s) · {f.documentos.length} documento(s)
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

        <div className="border-t pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Documentos</p>
          {f.documentos.length > 0 && (
            <ul className="mb-2 divide-y text-sm">
              {f.documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.nome}</span>
                    <Badge variant="outline" className="capitalize">{d.tipo}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{fmtBytes(d.tamanho)}</span>
                  </span>
                  <span className="flex shrink-0 items-center">
                    <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/rh/funcionarios/documentos/${d.id}/download`} />}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => rmDoc(d.id)} disabled={pending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Select value={docTipo} onValueChange={(v) => setDocTipo(v ?? "contrato")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_DOC.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Nome do documento" value={docNome} onChange={(e) => setDocNome(e.target.value)} className="flex-1 min-w-32" />
            <Input ref={fileDoc} type="file" className="w-44" />
            <Button size="sm" variant="outline" onClick={enviarDoc} disabled={busyDoc}>
              <Plus className="size-3.5" /> {busyDoc ? "Enviando…" : "Anexar"}
            </Button>
          </div>
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
