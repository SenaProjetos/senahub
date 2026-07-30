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

type ArquivoPreparado = {
  caminho: string;
  nomeArquivo: string;
  tamanho: number;
};

export function ImportarBaseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enviando, startEnvio] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const inspecaoSeq = useRef(0);
  const inspecaoEmCursoRef = useRef(false);
  const envioEmCursoRef = useRef(false);
  const arquivoPreparadoRef = useRef<ArquivoPreparado | null>(null);

  const [dataBase, setDataBase] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [detectandoDataBase, setDetectandoDataBase] = useState(false);
  const [mensagemDataBase, setMensagemDataBase] = useState<string | null>(null);
  const [arquivoPreparado, setArquivoPreparado] = useState<ArquivoPreparado | null>(null);
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

  function descartarArquivo(caminho: string) {
    return fetch("/api/custos/importar-base", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caminho }),
    }).catch(() => undefined);
  }

  function fechar() {
    if (envioEmCursoRef.current) return;
    const caminhoPendente = arquivoPreparadoRef.current?.caminho;
    inspecaoSeq.current += 1;
    inspecaoEmCursoRef.current = false;
    arquivoPreparadoRef.current = null;
    setOpen(false);
    setImportacaoId(null);
    setStatusAtual(null);
    setDetectandoDataBase(false);
    setMensagemDataBase(null);
    setArquivoPreparado(null);
    if (fileRef.current) fileRef.current.value = "";
    if (caminhoPendente) void descartarArquivo(caminhoPendente);
  }

  async function prepararArquivo(arquivo?: File) {
    // Além do `disabled` visual, os refs fecham a janela entre o evento e o
    // próximo render: seleção A/B e início da importação nunca disputam o mesmo
    // caminho temporário.
    if (envioEmCursoRef.current || inspecaoEmCursoRef.current || enviando) return;
    inspecaoEmCursoRef.current = true;
    const seq = ++inspecaoSeq.current;
    const caminhoAnterior = arquivoPreparadoRef.current?.caminho;
    arquivoPreparadoRef.current = null;
    setArquivoPreparado(null);
    setMensagemDataBase(null);
    if (caminhoAnterior) void descartarArquivo(caminhoAnterior);
    if (!arquivo) {
      inspecaoEmCursoRef.current = false;
      setDetectandoDataBase(false);
      return;
    }

    setDetectandoDataBase(true);
    try {
      const formData = new FormData();
      formData.set("file", arquivo);
      const resposta = await fetch("/api/custos/importar-base", {
        method: "POST",
        body: formData,
      });
      const json = await resposta.json();
      if (seq !== inspecaoSeq.current) {
        if (json.caminho) void descartarArquivo(json.caminho);
        return;
      }
      if (!resposta.ok) {
        setMensagemDataBase(json.error ?? "Não foi possível detectar a data-base.");
        return;
      }
      const preparado = {
        caminho: json.caminho,
        nomeArquivo: json.nomeArquivo,
        tamanho: json.tamanho,
      };
      arquivoPreparadoRef.current = preparado;
      setArquivoPreparado(preparado);
      if (json.dataBase) {
        setDataBase(json.dataBase);
        setMensagemDataBase(`Arquivo pronto · referência ${json.mesReferencia}. Você pode alterar a data.`);
      } else {
        setMensagemDataBase("Arquivo pronto · Mês de Referência não encontrado. Confira a data manualmente.");
      }
    } catch {
      if (seq === inspecaoSeq.current) {
        setMensagemDataBase("Não foi possível detectar a data-base. Confira-a manualmente.");
      }
    } finally {
      if (seq === inspecaoSeq.current) {
        inspecaoEmCursoRef.current = false;
        setDetectandoDataBase(false);
      }
    }
  }

  function enviar() {
    const preparado = arquivoPreparadoRef.current;
    if (!preparado) {
      toast.error("Aguarde o arquivo ser lido e preparado.");
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
    if (envioEmCursoRef.current || inspecaoEmCursoRef.current) return;
    envioEmCursoRef.current = true;
    startEnvio(async () => {
      try {
        const r = await iniciarImportacaoBase({
          caminhoArquivo: preparado.caminho,
          dataBase,
          ufs: [...ufsSel] as never,
          regimes: [...regimesSel] as never,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        // A partir daqui o arquivo pertence à linha CustoImportacao e não deve mais
        // ser removido pelo cleanup de cancelamento do diálogo.
        if (arquivoPreparadoRef.current?.caminho === preparado.caminho) {
          arquivoPreparadoRef.current = null;
          setArquivoPreparado(null);
        }
        if (!r.data.enfileirado) {
          toast.error('Sem worker de jobs ativo — rode "npm run dev:server" para processar a importação.');
          return;
        }
        setImportacaoId(r.data.importacaoId);
        toast.success("Importação enfileirada — acompanhe o progresso abaixo.");
      } catch {
        toast.error("Não foi possível iniciar a importação.");
      } finally {
        envioEmCursoRef.current = false;
      }
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
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : !enviando && !envioEmCursoRef.current && fechar())}
    >
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
              <Input
                id="import-file"
                type="file"
                accept=".xlsx"
                ref={fileRef}
                disabled={enviando || detectandoDataBase}
                onChange={(e) => void prepararArquivo(e.target.files?.[0])}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-data-base">Data-base</Label>
              <Input id="import-data-base" type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
              {(detectandoDataBase || mensagemDataBase) && (
                <p className="text-xs text-muted-foreground" role="status">
                  {detectandoDataBase ? "Enviando e lendo Mês de Referência…" : mensagemDataBase}
                </p>
              )}
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
            <Button onClick={enviar} disabled={enviando || detectandoDataBase || !arquivoPreparado}>
              {enviando ? "Enviando…" : "Importar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
