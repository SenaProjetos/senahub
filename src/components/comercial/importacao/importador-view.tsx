"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, ArrowRight, ArrowLeft, Check, FileSpreadsheet } from "lucide-react";
import { CAMPOS_CRM, CAMPOS_OBRIGATORIOS_CRM, type CampoCrm } from "@/lib/import/mapeamento-crm";
import { validarImportacaoCrm, commitImportacaoCrm } from "@/modules/comercial/importacao/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Preview = {
  nomeArquivo: string;
  caminho: string;
  headers: string[];
  totalLinhas: number;
  sample: string[][];
  autoMap: Partial<Record<CampoCrm, number>>;
};

type StatusLinha = "criar" | "vincular" | "ignorar" | "erro";

type DryRun = {
  contagens: { total: number; criados: number; vinculados: number; ignorados: number; erros: number };
  amostra: { idx: number; empresa: string; contato: string; email: string; status: StatusLinha; motivo: string | null }[];
  problemas: { idx: number; empresa: string; contato: string; status: StatusLinha; motivo: string }[];
};

const SEM_COLUNA = "__nenhuma__";
const SEM_CAMPANHA = "nenhuma";

const STATUS_LABEL: Record<StatusLinha, string> = {
  criar: "Prospecção nova",
  vincular: "Já existe — vincula",
  ignorar: "Ignorada",
  erro: "Erro",
};

export function ImportadorComercialView({ campanhas }: { campanhas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [enviando, setEnviando] = useState(false);
  const [pending, start] = useTransition();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [campanhaId, setCampanhaId] = useState(SEM_CAMPANHA);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  async function enviarArquivo(file: File | null) {
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/comercial/importacao", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao ler o arquivo.");
        return;
      }
      setPreview(data);
      setMapa({ ...(data.autoMap as Record<string, number>) });
      setDry(null);
      setStep(2);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const faltamObrigatorios = CAMPOS_OBRIGATORIOS_CRM.filter((c) => mapa[c] == null);

  function rodarDryRun() {
    if (!preview) return;
    start(async () => {
      const r = await validarImportacaoCrm({ caminho: preview.caminho, nomeArquivo: preview.nomeArquivo, mapeamento: mapa });
      if (r.ok) {
        setDry(r.data as DryRun);
        setStep(3);
      } else toast.error(r.error);
    });
  }

  function confirmar() {
    if (!preview) return;
    start(async () => {
      const r = await commitImportacaoCrm({
        caminho: preview.caminho,
        nomeArquivo: preview.nomeArquivo,
        mapeamento: mapa,
        campanhaId: campanhaId === SEM_CAMPANHA ? null : campanhaId,
      });
      if (r.ok) {
        const c = r.data;
        setResultado(
          `${c.criados} prospecção(ões) nova(s), ${c.vinculados} vinculada(s) a empresa já existente, ` +
            `${c.ignorados} ignorada(s), ${c.erros} com erro.`,
        );
        setStep(4);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function recomecar() {
    setStep(1);
    setPreview(null);
    setMapa({});
    setCampanhaId(SEM_CAMPANHA);
    setDry(null);
    setResultado(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Importar prospecções (CSV/Excel)</h2>
        <p className="text-sm text-muted-foreground">
          Uma lista do Sales Navigator ou de outra planilha comercial. Empresas e contatos já
          cadastrados são reaproveitados — nada é duplicado nem sobrescrito em silêncio.
        </p>
      </div>

      <Passos step={step} />

      {/* Passo 1 — upload */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Enviar planilha (.xlsx ou .csv)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={() => inputRef.current?.click()} disabled={enviando}>
              <Upload className="size-4" /> {enviando ? "Lendo…" : "Selecionar arquivo"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => enviarArquivo(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm text-muted-foreground">
              <FileSpreadsheet className="mr-1 inline size-4" />
              O arquivo é lido para mapear as colunas; nada é gravado ainda.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Passo 2 — mapeamento + campanha */}
      {step === 2 && preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              2. Mapear colunas — {preview.nomeArquivo} ({preview.totalLinhas} linhas)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {campanhas.length > 0 && (
              <div className="max-w-xs space-y-1">
                <label className="text-sm">Atribuir à campanha (opcional)</label>
                <Select value={campanhaId} onValueChange={(v) => setCampanhaId(v ?? SEM_CAMPANHA)}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CAMPANHA}>— sem campanha —</SelectItem>
                    {campanhas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Vale só para prospecções NOVAS deste arquivo — uma empresa já com prospecção
                  ativa mantém a campanha que já tinha.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_CRM.map((campo) => {
                const faltando = campo.obrigatorio && mapa[campo.campo] == null;
                return (
                  <div key={campo.campo} className="space-y-1">
                    <label className="flex items-center gap-1.5 text-sm">
                      {campo.label}
                      {campo.obrigatorio && <span className="text-destructive">*</span>}
                      {faltando && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          obrigatório
                        </Badge>
                      )}
                    </label>
                    <Select
                      value={mapa[campo.campo] != null ? String(mapa[campo.campo]) : SEM_COLUNA}
                      onValueChange={(v) =>
                        setMapa((m) => {
                          const novo = { ...m };
                          if (v == null || v === SEM_COLUNA) delete novo[campo.campo];
                          else novo[campo.campo] = Number(v);
                          return novo;
                        })
                      }
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_COLUNA}>— não mapear —</SelectItem>
                        {preview.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `(coluna ${i + 1})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            <PreviaTabela headers={preview.headers} rows={preview.sample.slice(0, 6)} />

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={recomecar}>
                <ArrowLeft className="size-4" /> Trocar arquivo
              </Button>
              <Button onClick={rodarDryRun} disabled={pending || faltamObrigatorios.length > 0}>
                {faltamObrigatorios.length > 0
                  ? `Falta mapear: ${faltamObrigatorios.join(", ")}`
                  : pending
                    ? "Validando…"
                    : "Validar"}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Passo 3 — dry-run */}
      {step === 3 && dry && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Conferir e confirmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Contador rotulo="Prospecções novas" valor={dry.contagens.criados} destaque />
              <Contador rotulo="Já existem (vincula)" valor={dry.contagens.vinculados} />
              <Contador rotulo="Ignoradas (opt-out)" valor={dry.contagens.ignorados} alerta={dry.contagens.ignorados > 0} />
              <Contador rotulo="Linhas com erro" valor={dry.contagens.erros} alerta={dry.contagens.erros > 0} />
            </div>

            {dry.problemas.length > 0 && (
              <div className="rounded-sm border border-destructive/30 p-3">
                <p className="mb-1 text-sm font-medium text-destructive">
                  {dry.contagens.ignorados + dry.contagens.erros} linha(s) FORA desta importação — nenhuma delas
                  será gravada:
                </p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {dry.problemas.map((p) => (
                    <li key={p.idx}>
                      Linha {p.idx} ({p.empresa || "—"} / {p.contato || "—"}) —{" "}
                      {p.status === "erro" ? "erro: " : "ignorada: "}
                      {p.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <AmostraTabela amostra={dry.amostra} />
            {dry.contagens.total > dry.amostra.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando as {dry.amostra.length} primeiras de {dry.contagens.total} linhas.
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> Ajustar mapeamento
              </Button>
              <Button onClick={confirmar} disabled={pending || dry.contagens.criados + dry.contagens.vinculados === 0}>
                <Check className="size-4" />
                {pending ? "Importando…" : `Importar ${dry.contagens.criados + dry.contagens.vinculados} linha(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Passo 4 — sucesso */}
      {step === 4 && resultado && (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <Check className="mx-auto size-10 text-success" />
            <p className="text-lg font-semibold">Importação concluída</p>
            <p className="text-sm text-muted-foreground">{resultado}</p>
            <Button onClick={recomecar} variant="outline">
              Importar outro arquivo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Passos({ step }: { step: number }) {
  const nomes = ["Enviar", "Mapear", "Conferir", "Concluir"];
  return (
    <div className="flex items-center gap-2 text-xs">
      {nomes.map((n, i) => {
        const num = i + 1;
        const ativo = step === num;
        const feito = step > num;
        return (
          <div key={n} className="flex items-center gap-2">
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                ativo
                  ? "bg-primary text-primary-foreground"
                  : feito
                    ? "bg-success/20 text-success"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {feito ? "✓" : num}
            </span>
            <span className={ativo ? "font-medium" : "text-muted-foreground"}>{n}</span>
            {num < nomes.length && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function Contador({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <div
      className={`rounded-sm border p-3 ${
        destaque ? "border-primary/40 bg-primary/5" : alerta && valor > 0 ? "border-destructive/40" : ""
      }`}
    >
      <p className={`text-xl font-bold ${alerta && valor > 0 ? "text-destructive" : ""}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function PreviaTabela({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-sm border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {headers.map((_, j) => (
                <td key={j} className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                  {r[j] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AmostraTabela({ amostra }: { amostra: DryRun["amostra"] }) {
  if (amostra.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-sm border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {["#", "Empresa", "Contato", "E-mail", "Status", "Motivo"].map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {amostra.map((l) => (
            <tr key={l.idx} className={`border-t ${l.status === "erro" ? "bg-destructive/5" : l.status === "ignorar" ? "bg-muted/30" : ""}`}>
              <td className="px-2 py-1 text-muted-foreground">{l.idx}</td>
              <td className="max-w-40 truncate px-2 py-1">{l.empresa}</td>
              <td className="max-w-32 truncate px-2 py-1">{l.contato}</td>
              <td className="max-w-40 truncate px-2 py-1 text-muted-foreground">{l.email}</td>
              <td className="whitespace-nowrap px-2 py-1">
                <Badge
                  variant="outline"
                  className={
                    l.status === "erro"
                      ? "border-destructive/40 text-destructive"
                      : l.status === "ignorar"
                        ? "text-muted-foreground"
                        : l.status === "vincular"
                          ? "border-primary/30 text-primary"
                          : ""
                  }
                >
                  {STATUS_LABEL[l.status]}
                </Badge>
              </td>
              <td className="max-w-56 truncate px-2 py-1 text-muted-foreground">{l.motivo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
