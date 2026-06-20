"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Link2, Plus, X, ArrowLeftRight } from "lucide-react";
import {
  conciliarComLancamento,
  criarLancamentoDaTransacao,
  ignorarTransacao,
} from "@/modules/financeiro/conciliacao/actions";
import type { TransacaoPendente } from "@/modules/financeiro/conciliacao/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

export function ConciliacaoView({
  transacoes,
  contas,
  categorias,
}: {
  transacoes: TransacaoPendente[];
  contas: { id: string; nome: string }[];
  categorias: { id: string; codigo: string; nome: string; tipo: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [contaImport, setContaImport] = useState("");
  const [importando, setImportando] = useState(false);

  async function importar(file: File | null) {
    if (!file || !contaImport) {
      toast.error("Selecione a conta e o arquivo OFX.");
      return;
    }
    setImportando(true);
    try {
      const fd = new FormData();
      fd.set("contaId", contaImport);
      fd.set("file", file);
      const res = await fetch("/api/financeiro/extratos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao importar.");
        return;
      }
      toast.success(
        `${data.importadas} importada(s), ${data.conciliadas} auto-conciliada(s), ${data.duplicadas} duplicada(s).`,
      );
      router.refresh();
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Conciliação bancária</h2>
        <p className="text-sm text-muted-foreground">
          Importe o extrato OFX; o sistema concilia automaticamente os valores que batem.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Importar extrato (.ofx)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={contaImport} onValueChange={(v) => setContaImport(v ?? "")}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Conta bancária" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => inputRef.current?.click()} disabled={importando || !contaImport}>
            <Upload className="size-4" /> {importando ? "Importando…" : "Selecionar OFX"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.OFX"
            className="hidden"
            onChange={(e) => importar(e.target.files?.[0] ?? null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Pendentes de conciliação ({transacoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transacoes.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Nenhuma transação pendente." />
          ) : (
            transacoes.map((t) => (
              <TransacaoRow key={t.id} t={t} categorias={categorias} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TransacaoRow({
  t,
  categorias,
}: {
  t: TransacaoPendente;
  categorias: { id: string; codigo: string; nome: string; tipo: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [catId, setCatId] = useState(t.categoriaSugerida?.id ?? "");
  const cats = categorias.filter((c) => (t.ehReceita ? c.tipo === "receita" : c.tipo === "despesa"));

  function conciliar(lancamentoId: string) {
    start(async () => {
      const r = await conciliarComLancamento({ transacaoId: t.id, lancamentoId });
      if (r.ok) {
        toast.success("Conciliado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function criar() {
    if (!catId) {
      toast.error("Selecione a categoria.");
      return;
    }
    start(async () => {
      const r = await criarLancamentoDaTransacao({ transacaoId: t.id, categoriaId: catId });
      if (r.ok) {
        toast.success("Lançamento criado e conciliado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function ignorar() {
    start(async () => {
      const r = await ignorarTransacao({ transacaoId: t.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 rounded-sm border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {formatarData(t.data)} · {t.conta}
          </p>
        </div>
        <span className={`font-mono text-sm ${t.ehReceita ? "text-success" : "text-foreground"}`}>
          {t.ehReceita ? "+" : ""}
          {brl(t.valor)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {t.sugestoes.length > 0 &&
          t.sugestoes.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => conciliar(s.id)}
            >
              <Link2 className="size-3.5" /> {s.descricao}
            </Button>
          ))}
        <div className="flex items-center gap-1.5">
          <Select value={catId} onValueChange={(v) => setCatId(v ?? "")}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Categoria…" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={pending} onClick={criar}>
            <Plus className="size-3.5" /> Criar
          </Button>
        </div>
        <Button size="sm" variant="ghost" disabled={pending} onClick={ignorar}>
          <X className="size-3.5" /> Ignorar
        </Button>
      </div>
    </div>
  );
}
