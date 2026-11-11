"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, ArrowRight, ArrowLeft, Check, Undo2, FileSpreadsheet } from "lucide-react";
import { CAMPOS, CAMPOS_OBRIGATORIOS, type CampoSenaHub } from "@/lib/import/mapeamento";
import { validarImportacao, commitImportacao, desfazerImportacao } from "@/modules/financeiro/importacao/actions";
import type { ImportacaoItem } from "@/modules/financeiro/importacao/queries";
import type { LinhaPrevia } from "@/modules/financeiro/importacao/cadastros";
import { Checkbox } from "@/components/ui/checkbox";
import { brl } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useConfirm } from "@/components/ui/confirm-dialog";

type Preview = {
  nomeArquivo: string;
  caminho: string;
  headers: string[];
  totalLinhas: number;
  sample: string[][];
  autoMap: Partial<Record<CampoSenaHub, number>>;
};

type DryRun = {
  contagens: {
    novosLancamentos: number;
    duplicados: number;
    linhasComErro: number;
    saldosIniciais: number;
    categoriasACriar: number;
    contasACriar: number;
    formasACriar: number;
    centrosACriar: number;
    fornecedoresACriar: number;
    clientesACriar: number;
  };
  erros: { idx: number; erros: string[] }[];
  linhas: LinhaPrevia[];
  saldosIniciais: { conta: string; valor: number; data: string | null; erros: string[] }[];
};

const SEM_COLUNA = "__nenhuma__";

export function ImportadorView({ importacoes, subnav }: { importacoes: ImportacaoItem[]; subnav?: React.ReactNode }) {
  const router = useRouter();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [enviando, setEnviando] = useState(false);
  const [pending, start] = useTransition();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [dry, setDry] = useState<DryRun | null>(null);
  // Modo estrito por padrão: extrato do banco nunca cria cadastro a partir de um nome truncado.
  const [criarCadastros, setCriarCadastros] = useState(false);
  const [resultado, setResultado] = useState<{ loteId: string; texto: string } | null>(null);

  async function enviarArquivo(file: File | null) {
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/financeiro/importacao", { method: "POST", body: fd });
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

  const faltamObrigatorios = CAMPOS_OBRIGATORIOS.filter((c) => mapa[c] == null);
  const saldosValidos = dry ? dry.saldosIniciais.filter((s) => s.erros.length === 0).length : 0;

  function rodarDryRun(criar = criarCadastros) {
    if (!preview) return;
    start(async () => {
      const r = await validarImportacao({
        caminho: preview.caminho,
        nomeArquivo: preview.nomeArquivo,
        mapeamento: mapa,
        criarCadastros: criar,
      });
      if (r.ok) {
        setDry(r.data as DryRun);
        setStep(3);
      } else toast.error(r.error);
    });
  }

  function confirmar() {
    if (!preview) return;
    start(async () => {
      const r = await commitImportacao({
        caminho: preview.caminho,
        nomeArquivo: preview.nomeArquivo,
        mapeamento: mapa,
        criarCadastros,
      });
      if (r.ok) {
        const c = r.data.contagens;
        setResultado({
          loteId: r.data.loteId,
          texto: `${c.lancamentosCriados} lançamentos, ${r.data.saldosIniciais} saldo(s) inicial(is), ${c.categoriasCriadas} categorias, ${c.contasCriadas} contas, ${c.fornecedoresCriados} fornecedores, ${c.clientesCriados} clientes.`,
        });
        setStep(4);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function desfazer(loteId: string) {
    if (
      !(await confirm({
        title: "Desfazer importação?",
        description: "Os lançamentos do lote serão removidos (cadastros criados permanecem).",
        variant: "destructive",
        confirmLabel: "Desfazer",
      }))
    )
      return;
    start(async () => {
      const r = await desfazerImportacao({ loteId });
      if (r.ok) {
        toast.success(`Importação desfeita (${r.data.removidos} lançamentos removidos).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function recomecar() {
    setStep(1);
    setPreview(null);
    setMapa({});
    setDry(null);
    setResultado(null);
    setCriarCadastros(false);
  }

  /** Trocar a opção muda o que entra: a prévia já feita deixa de valer e é refeita. */
  function trocarCriarCadastros(v: boolean) {
    setCriarCadastros(v);
    if (step === 3) rodarDryRun(v);
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Importar planilha" descricao="Extrato do banco já categorizado ou planilha do Meu Dinheiro: confira cada linha antes de gravar." />
      {subnav}

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

      {/* Passo 2 — mapeamento */}
      {step === 2 && preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              2. Mapear colunas — {preview.nomeArquivo} ({preview.totalLinhas} linhas)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS.map((campo) => {
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

            <OpcaoCriarCadastros valor={criarCadastros} onChange={trocarCriarCadastros} disabled={pending} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={recomecar}>
                <ArrowLeft className="size-4" /> Trocar arquivo
              </Button>
              <Button onClick={() => rodarDryRun()} disabled={pending || faltamObrigatorios.length > 0}>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Contador rotulo="Novos lançamentos" valor={dry.contagens.novosLancamentos} destaque />
              <Contador rotulo="Duplicados (ignorados)" valor={dry.contagens.duplicados} />
              <Contador rotulo="Linhas com erro" valor={dry.contagens.linhasComErro} alerta={dry.contagens.linhasComErro > 0} />
              <Contador rotulo="Saldos iniciais" valor={dry.contagens.saldosIniciais} />
              <Contador rotulo="Categorias a criar" valor={dry.contagens.categoriasACriar} />
              <Contador rotulo="Contas a criar" valor={dry.contagens.contasACriar} />
              <Contador rotulo="Formas a criar" valor={dry.contagens.formasACriar} />
              <Contador rotulo="Centros a criar" valor={dry.contagens.centrosACriar} />
              <Contador rotulo="Fornecedores a criar" valor={dry.contagens.fornecedoresACriar} />
              <Contador rotulo="Clientes a criar" valor={dry.contagens.clientesACriar} />
            </div>

            <OpcaoCriarCadastros valor={criarCadastros} onChange={trocarCriarCadastros} disabled={pending} />

            {dry.contagens.linhasComErro > 0 && (
              <p className="text-sm text-destructive">
                {dry.contagens.linhasComErro} linha(s) com erro não serão importadas. Use o filtro «Só com erro» para ver o motivo de cada uma.
              </p>
            )}

            {dry.saldosIniciais.length > 0 && (
              <div className="rounded-sm border p-3 text-xs">
                <p className="mb-1 text-sm font-medium">Saldos iniciais</p>
                <ul className="space-y-0.5">
                  {dry.saldosIniciais.map((s, i) => (
                    <li key={i} className={s.erros.length > 0 ? "text-destructive" : "text-muted-foreground"}>
                      {s.conta}: {brl(s.valor)}
                      {s.data ? ` no início de ${s.data.split("-").reverse().join("/")}` : ""} —{" "}
                      {s.erros.length > 0 ? `não será gravado. ${s.erros.join(" ")}` : "será gravado na conta."}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <TabelaPrevia key={`${criarCadastros}-${dry.linhas.length}`} linhas={dry.linhas} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> Ajustar mapeamento
              </Button>
              <Button onClick={confirmar} disabled={pending || (dry.contagens.novosLancamentos === 0 && saldosValidos === 0)}>
                <Check className="size-4" />
                {pending
                  ? "Importando…"
                  : dry.contagens.novosLancamentos === 0
                    ? `Gravar ${saldosValidos} saldo(s) inicial(is)`
                    : `Importar ${dry.contagens.novosLancamentos} lançamentos`}
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
            <p className="text-sm text-muted-foreground">{resultado.texto}</p>
            <Button onClick={recomecar} variant="outline">
              Importar outro arquivo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Importações anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {importacoes.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="Nenhuma importação ainda." />
          ) : (
            <ul className="divide-y text-sm">
              {importacoes.map((imp) => (
                <li key={imp.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {imp.nomeArquivo}
                      {imp.desfeitoEm && (
                        <Badge variant="outline" className="ml-2 text-muted-foreground">
                          desfeita
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(imp.createdAt).toLocaleString("pt-BR")} · {imp.autor} ·{" "}
                      {imp.lancamentosCriados} lançamentos
                    </p>
                  </div>
                  {!imp.desfeitoEm && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => desfazer(imp.id)}>
                      <Undo2 className="size-3.5" /> Desfazer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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

function Contador({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  alerta?: boolean;
}) {
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

function OpcaoCriarCadastros({
  valor,
  onChange,
  disabled,
}: {
  valor: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-sm border p-3 text-sm">
      <Checkbox checked={valor} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} className="mt-0.5" />
      <span>
        <span className="font-medium">Criar cadastros que não existirem</span>
        <span className="block text-xs text-muted-foreground">
          Deixe desmarcado para extrato do banco. Marque só para migrar do Meu Dinheiro.
        </span>
      </span>
    </label>
  );
}

type FiltroPrevia = "todas" | "erro" | "cria" | "duplicada";

const FILTROS: { id: FiltroPrevia; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "erro", rotulo: "Só com erro" },
  { id: "cria", rotulo: "Só cadastros a criar" },
  { id: "duplicada", rotulo: "Só duplicadas" },
];

const POR_PAGINA = 50;

function situacao(l: LinhaPrevia): { texto: string; tom: "erro" | "aviso" | "neutro" | "ok" } {
  if (l.erros.length > 0) return { texto: l.erros.join(" "), tom: "erro" };
  if (l.duplicada) return { texto: "Duplicada", tom: "neutro" };
  if (l.criaCadastro) return { texto: "Cria cadastro", tom: "aviso" };
  return { texto: "Entra", tom: "ok" };
}

/** Prévia de TODAS as linhas, paginada no cliente, com os filtros da situação. */
function TabelaPrevia({ linhas }: { linhas: LinhaPrevia[] }) {
  const [filtro, setFiltro] = useState<FiltroPrevia>("todas");
  const [pagina, setPagina] = useState(0);

  const filtradas = useMemo(() => {
    switch (filtro) {
      case "erro":
        return linhas.filter((l) => l.erros.length > 0);
      case "cria":
        return linhas.filter((l) => l.criaCadastro);
      case "duplicada":
        return linhas.filter((l) => l.duplicada);
      default:
        return linhas;
    }
  }, [linhas, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const atual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  const contagem: Record<FiltroPrevia, number> = {
    todas: linhas.length,
    erro: linhas.filter((l) => l.erros.length > 0).length,
    cria: linhas.filter((l) => l.criaCadastro).length,
    duplicada: linhas.filter((l) => l.duplicada).length,
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar linhas da prévia">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? "default" : "outline"}
            aria-pressed={filtro === f.id}
            onClick={() => {
              setFiltro(f.id);
              setPagina(0);
            }}
          >
            {f.rotulo} ({contagem[f.id]})
          </Button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-sm border p-4 text-center text-sm text-muted-foreground">Nenhuma linha neste filtro.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)]">
          <div className="max-h-[60vh] overflow-auto rounded-sm border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {["Linha", "Data", "Descrição", "Valor", "Categoria", "Projeto", "Sócio", "Situação"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, i) => {
                  const st = situacao(l);
                  return (
                    <tr key={`${l.idx}-${l.tipo}-${i}`} className={`border-t ${st.tom === "erro" ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1 text-muted-foreground">{l.idx}</td>
                      <td className="whitespace-nowrap px-2 py-1">{l.data ? l.data.split("-").reverse().join("/") : "—"}</td>
                      <td className="max-w-56 truncate px-2 py-1" title={l.descricao}>
                        {l.descricao}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1 text-right font-mono ${l.tipo === "despesa" ? "text-destructive" : "text-success"}`}
                      >
                        {l.tipo === "despesa" ? "−" : ""}
                        {brl(l.valor)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{l.categoria || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{l.projeto || "—"}</td>
                      <td className="max-w-32 truncate px-2 py-1 text-muted-foreground">{l.socio || "—"}</td>
                      <td
                        className={`min-w-48 px-2 py-1 ${
                          st.tom === "erro"
                            ? "text-destructive"
                            : st.tom === "aviso"
                              ? "font-medium text-warning-text"
                              : "text-muted-foreground"
                        }`}
                      >
                        {st.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Página {atual + 1} de {totalPaginas} · {filtradas.length} linha(s)
          </span>
          <Button size="sm" variant="outline" disabled={atual === 0} onClick={() => setPagina(atual - 1)} aria-label="Página anterior">
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={atual >= totalPaginas - 1}
            onClick={() => setPagina(atual + 1)}
            aria-label="Próxima página"
          >
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
