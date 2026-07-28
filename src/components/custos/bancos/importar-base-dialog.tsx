"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { iniciarImportacaoBase, obterImportacaoStatus } from "@/modules/custos/composicoes/actions";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

const REGIMES = [
  { valor: "sem_desoneracao", label: "Sem desoneração" },
  { valor: "com_desoneracao", label: "Com desoneração" },
  { valor: "sem_encargos", label: "Sem encargos" },
] as const;

type StatusImportacao = {
  status: string;
  progresso: number | null;
  erro: string | null;
  insumosCriados: number;
  precosCriados: number;
  composicoesCriadas: number;
  itensCriados: number;
} | null;

export function ImportarBaseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enviando, startEnvio] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dataBase, setDataBase] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [ufsSel, setUfsSel] = useState<Set<string>>(new Set());
  const [regimesSel, setRegimesSel] = useState<Set<string>>(new Set(["sem_desoneracao"]));

  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [statusAtual, setStatusAtual] = useState<StatusImportacao>(null);

  function alternarUf(uf: string) {
    setUfsSel((s) => {
      const novo = new Set(s);
      if (novo.has(uf)) novo.delete(uf);
      else novo.add(uf);
      return novo;
    });
  }
  function alternarRegime(regime: string) {
    setRegimesSel((s) => {
      const novo = new Set(s);
      if (novo.has(regime)) novo.delete(regime);
      else novo.add(regime);
      return novo;
    });
  }

  function fechar() {
    setOpen(false);
    setImportacaoId(null);
    setStatusAtual(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function enviar() {
    const arquivo = fileRef.current?.files?.[0];
    if (!arquivo) {
      toast.error("Selecione o arquivo .xlsx (workbook Referência do SINAPI).");
      return;
    }
    if (ufsSel.size === 0) {
      toast.error("Escolha ao menos uma UF.");
      return;
    }
    if (regimesSel.size === 0) {
      toast.error("Escolha ao menos um regime de encargos.");
      return;
    }
    startEnvio(async () => {
      const formData = new FormData();
      formData.set("file", arquivo);
      const up = await fetch("/api/custos/importar-base", { method: "POST", body: formData });
      const upJson = await up.json();
      if (!up.ok) {
        toast.error(upJson.error ?? "Falha ao enviar o arquivo.");
        return;
      }
      const r = await iniciarImportacaoBase({
        caminhoArquivo: upJson.caminho,
        dataBase,
        ufs: [...ufsSel] as never,
        regimes: [...regimesSel] as never,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (!r.data.enfileirado) {
        toast.error('Sem worker de jobs ativo — rode "npm run dev:server" para processar a importação.');
        return;
      }
      setImportacaoId(r.data.importacaoId);
      toast.success("Importação enfileirada — acompanhe o progresso abaixo.");
    });
  }

  useEffect(() => {
    if (!importacaoId) return;
    if (statusAtual?.status === "concluido" || statusAtual?.status === "erro") return;
    const t = setInterval(async () => {
      const r = await obterImportacaoStatus({ id: importacaoId });
      if (r.ok && r.data) {
        setStatusAtual(r.data);
        if (r.data.status === "concluido") {
          toast.success("Importação concluída.");
          router.refresh();
        } else if (r.data.status === "erro") {
          toast.error(r.data.erro ?? "Falha na importação.");
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [importacaoId, statusAtual?.status, router]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Importar base
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar base SINAPI</DialogTitle>
          <DialogDescription>Envie o workbook &ldquo;Referência&rdquo; (.xlsx) do mês desejado.</DialogDescription>
        </DialogHeader>

        {!importacaoId ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Arquivo (.xlsx)</Label>
              <Input id="import-file" type="file" accept=".xlsx" ref={fileRef} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-data-base">Data-base</Label>
              <Input id="import-data-base" type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Regimes de encargos</Label>
              <div className="flex flex-wrap gap-3">
                {REGIMES.map((r) => (
                  <label key={r.valor} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={regimesSel.has(r.valor)} onCheckedChange={() => alternarRegime(r.valor)} />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>UFs</Label>
              <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-6">
                {UFS.map((uf) => (
                  <label key={uf} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={ufsSel.has(uf)} onCheckedChange={() => alternarUf(uf)} />
                    {uf}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${statusAtual?.progresso ?? 0}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Status: <span className="font-medium">{statusAtual?.status ?? "fila"}</span> ·{" "}
              {statusAtual?.progresso ?? 0}%
            </p>
            {statusAtual && (
              <p className="text-xs text-muted-foreground">
                {statusAtual.insumosCriados} insumo(s) · {statusAtual.precosCriados} preço(s) ·{" "}
                {statusAtual.composicoesCriadas} composição(ões) · {statusAtual.itensCriados} item(ns)
              </p>
            )}
            {statusAtual?.status === "erro" && <p className="text-sm text-destructive">{statusAtual.erro}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={enviando}>
            {importacaoId ? "Fechar" : "Cancelar"}
          </Button>
          {!importacaoId && (
            <Button onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando…" : "Importar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
