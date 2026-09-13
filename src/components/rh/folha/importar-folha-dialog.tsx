"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, AlertTriangle } from "lucide-react";
import type { TipoRubricaImport } from "@/modules/rh/folha/importar-pdf";
import { vincularRubricaExterna, vincularMatriculaExterna } from "@/modules/rh/folha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/utils";

/**
 * Import do PDF do contador (plano 2026-09-13-folha-clt-import-assinatura.md, §3). Uma
 * requisição faz tudo (parse + confere + grava); quando falta cadastro de rubrica/matrícula,
 * NADA é gravado e esta tela mostra a pendência — resolvida a pendência, reenvia-se o MESMO
 * arquivo (decisão do dono §0.1: sem sessão de import persistente entre tentativas). Por isso o
 * `File` fica em memória no estado — o RH não escolhe o arquivo de novo pra reenviar.
 */

type PendenciaRubricaUI = {
  codigoExterno: string;
  descricao: string;
  valorExemplo: number;
  tipoSugerido: TipoRubricaImport | null;
};
type PendenciaMatriculaUI = { matriculaExterna: string; nome: string; salarioContratual: number };
type RubricaOpcao = { id: string; nome: string; tipo: TipoRubricaImport };
type PessoaOpcao = { id: string; name: string };

type RespostaImportar =
  | { pendencias: { rubricas: PendenciaRubricaUI[]; matriculas: PendenciaMatriculaUI[] } }
  | { error: string }
  | { ok: true; holerites: number; totalLiquido: number; avisosForaDoPdf: string[] };

export function ImportarFolhaDialog({
  folhaId,
  rubricas,
  elegiveis,
}: {
  folhaId: string;
  rubricas: RubricaOpcao[];
  elegiveis: PessoaOpcao[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [enviando, start] = useTransition();
  const [rubricasPend, setRubricasPend] = useState<PendenciaRubricaUI[]>([]);
  const [matriculasPend, setMatriculasPend] = useState<PendenciaMatriculaUI[]>([]);
  // true a partir do instante em que o servidor responder com pendência, mesmo depois de todas
  // resolvidas localmente — é o que diferencia "ainda não enviei nada" de "resolvi tudo, falta só
  // reenviar o mesmo arquivo" (decisão §0.1: sem sessão de import persistente no SERVIDOR, mas o
  // arquivo em si fica em memória aqui, senão o RH escolheria o PDF nas mãos de novo).
  const [sessaoPendencia, setSessaoPendencia] = useState(false);
  const [avisosVinculo, setAvisosVinculo] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function fechar() {
    setOpen(false);
    setFile(null);
    setRubricasPend([]);
    setMatriculasPend([]);
    setSessaoPendencia(false);
    setAvisosVinculo([]);
  }

  function enviar(arquivo: File) {
    start(async () => {
      const fd = new FormData();
      fd.append("folhaId", folhaId);
      fd.append("file", arquivo);
      const res = await fetch("/api/rh/folha/importar", { method: "POST", body: fd });
      // O servidor só garante JSON nas respostas que ele mesmo controla. Corpo grande demais,
      // redirect de auth ou 502 do túnel voltam HTML/vazio — sem este try, `res.json()` explode
      // dentro do useTransition sem toast nenhum, e o RH vê o botão "não fazer nada".
      let data: RespostaImportar;
      try {
        data = await res.json();
      } catch {
        toast.error(`O servidor respondeu ${res.status} sem detalhe — tente de novo ou confira o tamanho do arquivo.`);
        return;
      }

      if ("pendencias" in data) {
        setSessaoPendencia(true);
        setRubricasPend(data.pendencias.rubricas);
        setMatriculasPend(data.pendencias.matriculas);
        return;
      }
      if (!res.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Falha ao importar o arquivo.");
        return;
      }

      toast.success(`${data.holerites} holerite(s) importado(s) — líquido ${brl(data.totalLiquido)}.`);
      if (data.avisosForaDoPdf.length > 0) {
        toast.warning(`Não vieram neste PDF (mantidos como estavam): ${data.avisosForaDoPdf.join(", ")}`);
      }
      fechar();
      router.refresh();
    });
  }

  function onEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setSessaoPendencia(false);
    setRubricasPend([]);
    setMatriculasPend([]);
    enviar(f);
  }

  function reenviar() {
    if (file) enviar(file);
  }

  function rubricaResolvida(codigoExterno: string, nome: string, desvinculadaDe: string | null) {
    setRubricasPend((r) => r.filter((p) => p.codigoExterno !== codigoExterno));
    if (desvinculadaDe) {
      setAvisosVinculo((a) => [
        ...a,
        `Rubrica "${nome}" (código ${codigoExterno}) estava vinculada a "${desvinculadaDe}" — vínculo movido pra cá.`,
      ]);
    }
  }
  function matriculaResolvida(matriculaExterna: string, nome: string, desvinculadaDe: string | null) {
    setMatriculasPend((m) => m.filter((p) => p.matriculaExterna !== matriculaExterna));
    if (desvinculadaDe) {
      setAvisosVinculo((a) => [
        ...a,
        `Matrícula ${matriculaExterna} estava vinculada a "${desvinculadaDe}" — agora é de "${nome}".`,
      ]);
    }
  }

  const pendenciasRestantes = rubricasPend.length + matriculasPend.length;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Importar PDF
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar folha do PDF do contador</DialogTitle>
            <DialogDescription>
              Envia o PDF de folha de pagamento — o sistema lê rubricas e valores automaticamente.
            </DialogDescription>
          </DialogHeader>

          {avisosVinculo.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              {avisosVinculo.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {!sessaoPendencia && (
            <div className="space-y-2">
              <Label htmlFor="pdf-folha">Arquivo PDF</Label>
              <Input
                id="pdf-folha"
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={onEscolherArquivo}
                disabled={enviando}
              />
              {file && enviando && <p className="text-sm text-muted-foreground">Lendo {file.name}…</p>}
            </div>
          )}

          {sessaoPendencia && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {file?.name} — falta cadastro pra continuar.{" "}
                {pendenciasRestantes > 0
                  ? "Resolva abaixo e reenvie o mesmo arquivo."
                  : "Tudo resolvido — pode reenviar o mesmo arquivo."}
              </p>
              {rubricasPend.map((p) => (
                <LinhaPendenciaRubrica
                  key={p.codigoExterno}
                  pendencia={p}
                  rubricas={rubricas}
                  onResolvida={rubricaResolvida}
                />
              ))}
              {matriculasPend.map((p) => (
                <LinhaPendenciaMatricula
                  key={p.matriculaExterna}
                  pendencia={p}
                  elegiveis={elegiveis}
                  onResolvida={matriculaResolvida}
                />
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            {sessaoPendencia && (
              <Button onClick={reenviar} disabled={enviando || pendenciasRestantes > 0}>
                {enviando ? "Reenviando…" : "Reenviar arquivo"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinhaPendenciaRubrica({
  pendencia,
  rubricas,
  onResolvida,
}: {
  pendencia: PendenciaRubricaUI;
  rubricas: RubricaOpcao[];
  onResolvida: (codigoExterno: string, nome: string, desvinculadaDe: string | null) => void;
}) {
  const [modo, setModo] = useState<"existente" | "nova">(rubricas.length > 0 ? "existente" : "nova");
  const [rubricaId, setRubricaId] = useState("");
  const [nome, setNome] = useState(pendencia.descricao);
  const [tipo, setTipo] = useState<TipoRubricaImport>(pendencia.tipoSugerido ?? "provento");
  const [pending, start] = useTransition();

  // A aritmética do PDF já calculou o tipo certo (`tipoSugerido`) — se o RH vincular a uma
  // rubrica CADASTRADA com o tipo trocado, o próximo reenvio é recusado por `conferirClassificacao`
  // sem apontar de volta pra este vínculo. Avisar aqui, na hora da escolha, é mais barato que
  // deixar o RH decifrar sozinho por que o arquivo voltou a falhar depois de "tudo resolvido".
  const rubricaSelecionada = rubricas.find((r) => r.id === rubricaId);
  const conflitoDeTipo =
    modo === "existente" && pendencia.tipoSugerido && rubricaSelecionada
      ? rubricaSelecionada.tipo !== pendencia.tipoSugerido
      : false;

  function vincular() {
    start(async () => {
      const r =
        modo === "existente"
          ? await vincularRubricaExterna({ codigoExterno: pendencia.codigoExterno, rubricaId })
          : await vincularRubricaExterna({ codigoExterno: pendencia.codigoExterno, nome, tipo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onResolvida(pendencia.codigoExterno, r.data.nome, r.data.desvinculadaDe);
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm">
        Rubrica <span className="font-mono">{pendencia.codigoExterno}</span> &ldquo;{pendencia.descricao}&rdquo; —
        exemplo {brl(pendencia.valorExemplo)}
        {pendencia.tipoSugerido && (
          <span className="text-muted-foreground"> · sugestão: {pendencia.tipoSugerido}</span>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant={modo === "existente" ? "default" : "outline"} onClick={() => setModo("existente")}>
            Vincular existente
          </Button>
          <Button size="sm" variant={modo === "nova" ? "default" : "outline"} onClick={() => setModo("nova")}>
            Criar nova
          </Button>
        </div>
        {modo === "existente" ? (
          <Select value={rubricaId} onValueChange={(v) => setRubricaId(v ?? "")}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Escolha a rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome} ({r.tipo})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-56" placeholder="Nome da rubrica" />
            <Select value={tipo} onValueChange={(v) => v && setTipo(v as TipoRubricaImport)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="provento">Provento</SelectItem>
                <SelectItem value="desconto">Desconto</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <Button
          size="sm"
          onClick={vincular}
          disabled={pending || (modo === "existente" ? !rubricaId : nome.trim().length < 2)}
        >
          Vincular
        </Button>
      </div>
      {conflitoDeTipo && (
        <p className="flex items-start gap-1.5 text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          A aritmética do PDF diz que {pendencia.codigoExterno} é <strong>{pendencia.tipoSugerido}</strong>, mas
          &ldquo;{rubricaSelecionada?.nome}&rdquo; está cadastrada como <strong>{rubricaSelecionada?.tipo}</strong>.
          Vincular assim vai fazer o próximo reenvio ser recusado.
        </p>
      )}
    </div>
  );
}

function LinhaPendenciaMatricula({
  pendencia,
  elegiveis,
  onResolvida,
}: {
  pendencia: PendenciaMatriculaUI;
  elegiveis: PessoaOpcao[];
  onResolvida: (matriculaExterna: string, nome: string, desvinculadaDe: string | null) => void;
}) {
  const [userId, setUserId] = useState("");
  const [pending, start] = useTransition();

  function vincular() {
    start(async () => {
      const r = await vincularMatriculaExterna({ matriculaExterna: pendencia.matriculaExterna, userId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onResolvida(pendencia.matriculaExterna, r.data.nome, r.data.desvinculadaDe);
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm">
        Matrícula <span className="font-mono">{pendencia.matriculaExterna}</span> &ldquo;{pendencia.nome}&rdquo; — salário
        contratual {brl(pendencia.salarioContratual)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Quem é essa pessoa?" />
          </SelectTrigger>
          <SelectContent>
            {elegiveis.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={vincular} disabled={pending || !userId}>
          Vincular
        </Button>
      </div>
    </div>
  );
}
