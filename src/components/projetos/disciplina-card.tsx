"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  History,
  Users,
  GitBranch,
  FolderUp,
  Upload as UploadIcon,
  Download,
  FileArchive,
  FileText,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import {
  atualizarStatusDisciplina,
  definirResponsaveis,
  registrarRevisao,
} from "@/modules/projetos/actions";
import { DisciplinaEditDialog, DisciplinaDeleteButton } from "@/components/projetos/disciplina-edit-dialog";
import { validarEntrega } from "@/modules/uploads/actions";
import { STATUS_LABEL, STATUS_TONE } from "@/modules/projetos/status";
import { diasDeAtraso } from "@/modules/projetos/atraso";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { STATUS_DISCIPLINA } from "@/modules/projetos/schemas";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

type UploadItem = {
  id: string;
  pacote: "A" | "B" | "OUTROS";
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  validado: boolean;
  autor: string;
  data: string;
};

type Disc = {
  id: string;
  nome: string;
  status: StatusDisciplina;
  prazo: string | null;
  valor: number | null;
  responsaveis: { userId: string; name: string }[];
  ehResponsavel: boolean;
  revisoes: { id: string; numero: number; motivo: string | null; autor: string; data: string }[];
  uploads: UploadItem[];
  temA: boolean;
  temB: boolean;
  jaValidado: boolean;
  exigePacoteA: boolean;
  exigePacoteB: boolean;
};

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DisciplinaCard({
  disciplina,
  podeGerir,
  podeValidar,
  internos,
  canalChatId,
}: {
  disciplina: Disc;
  podeGerir: boolean;
  podeValidar: boolean;
  internos: { id: string; name: string; role: string }[];
  canalChatId?: string;
}) {
  const [pending, start] = useTransition();
  const podeMexerStatus = podeGerir || disciplina.ehResponsavel;
  const podeEnviar = podeGerir || disciplina.ehResponsavel;
  const atraso = diasDeAtraso(disciplina.prazo, disciplina.status);

  function mudarStatus(status: string | null) {
    if (!status) return;
    start(async () => {
      const res = await atualizarStatusDisciplina({
        disciplinaId: disciplina.id,
        status: status as StatusDisciplina,
      });
      if (res.ok) toast.success("Status atualizado.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{disciplina.nome}</h4>
          {disciplina.prazo && (
            <p className="text-xs text-muted-foreground">
              Prazo: {formatarData(disciplina.prazo)}
            </p>
          )}
          {atraso > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden />
              atrasada {atraso}d
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge tone={STATUS_TONE[disciplina.status] ?? "neutral"}>
            {STATUS_LABEL[disciplina.status]}
          </StatusBadge>
          {canalChatId && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Abrir chat da disciplina"
              render={
                <Link
                  href={`/chat?c=${canalChatId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <MessageSquare className="size-3.5" />
            </Button>
          )}
          {podeGerir && (
            <>
              <DisciplinaEditDialog
                disciplinaId={disciplina.id}
                nome={disciplina.nome}
                prazo={disciplina.prazo}
                valor={disciplina.valor}
                responsaveisIds={disciplina.responsaveis.map((r) => r.userId)}
                internos={internos}
                exigePacoteA={disciplina.exigePacoteA}
                exigePacoteB={disciplina.exigePacoteB}
              />
              {!disciplina.jaValidado && (
                <DisciplinaDeleteButton disciplinaId={disciplina.id} nome={disciplina.nome} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {disciplina.responsaveis.length > 0 ? (
          disciplina.responsaveis.map((r) => (
            <span key={r.userId} className="rounded-sm bg-muted px-2 py-0.5">
              {r.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">Sem responsável</span>
        )}
        {disciplina.valor != null && (
          <span className="ml-auto font-mono text-muted-foreground">{brl(disciplina.valor)}</span>
        )}
      </div>

      {podeMexerStatus && (
        <Select value={disciplina.status} items={STATUS_LABEL} onValueChange={mudarStatus} disabled={pending}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_DISCIPLINA.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {disciplina.jaValidado && (
        <div className="flex items-center gap-1.5 rounded-sm bg-status-aprovado/10 px-2 py-1 text-xs text-status-aprovado">
          <ShieldCheck className="size-3.5" /> Entrega validada · pagamento liberado
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <ArquivosDialog
          disciplina={disciplina}
          podeEnviar={podeEnviar}
          podeValidar={podeValidar}
        />
        <RevisaoDialog disciplina={disciplina} podeRegistrar={podeMexerStatus} />
        {podeGerir && <ResponsaveisDialog disciplina={disciplina} internos={internos} />}
      </div>
    </div>
  );
}

function ArquivosDialog({
  disciplina,
  podeEnviar,
  podeValidar,
}: {
  disciplina: Disc;
  podeEnviar: boolean;
  podeValidar: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pacote, setPacote] = useState<"A" | "B">("A");
  const [validando, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const completoParaValidar =
    (!disciplina.exigePacoteA || disciplina.temA) &&
    (!disciplina.exigePacoteB || disciplina.temB) &&
    !disciplina.jaValidado;

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("disciplinaId", disciplina.id);
      fd.set("pacote", pacote);
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha no envio.");
        return;
      }
      const ok = data.resultados.filter((r: { ok: boolean }) => r.ok).length;
      const real = data.resultados.filter((r: { realocado?: boolean }) => r.realocado).length;
      const falhas = data.resultados.filter((r: { ok: boolean }) => !r.ok);
      toast.success(`${ok} arquivo(s) enviado(s).`);
      if (real > 0) toast.info(`${real} arquivo(s) não suportado(s) foram para a pasta "outros".`);
      for (const f of falhas) toast.error(`${f.nome}: ${f.motivo}`);
      router.refresh();
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function validar() {
    start(async () => {
      const res = await validarEntrega({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success(`Entrega validada. ${res.data.pagamentos} pagamento(s) liberado(s).`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const porPacote = (p: "A" | "B" | "OUTROS") => disciplina.uploads.filter((u) => u.pacote === p);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FolderUp className="size-3.5" /> Arquivos ({disciplina.uploads.length})
          </Button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — arquivos</DialogTitle>
          <DialogDescription>
            Pranchas e arquivos (A) · Backup do modelo (B)
          </DialogDescription>
        </DialogHeader>

        {podeEnviar && !disciplina.jaValidado && (
          <div className="space-y-2 rounded-sm border p-3">
            <div className="flex items-center gap-2">
              <Select value={pacote} onValueChange={(v) => setPacote((v as "A" | "B") ?? "A")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Pranchas e arquivos</SelectItem>
                  <SelectItem value="B">Backup do modelo</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
              >
                <UploadIcon className="size-3.5" /> {enviando ? "Enviando…" : "Enviar arquivos"}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => enviar(e.target.files)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Formatos não suportados em Pranchas e arquivos vão automaticamente para &quot;outros&quot;.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {(["A", "B", "OUTROS"] as const).map((p) => {
            const itens = porPacote(p);
            if (itens.length === 0 && p === "OUTROS") return null;
            return (
              <div key={p}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {p === "A" ? "Pranchas e arquivos" : p === "B" ? "Backup do modelo" : "Outros (não suportados)"}
                  </span>
                  {itens.length > 0 && (
                    <a
                      href={`/api/uploads/disciplina/${disciplina.id}/zip`}
                      className="hidden"
                      aria-hidden
                    />
                  )}
                </div>
                {itens.length === 0 ? (
                  <EmptyState icon={FileText} title="Nenhum arquivo" />
                ) : (
                  <ul className="space-y-1">
                    {itens.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 rounded-sm border px-2 py-1 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {u.nomeArquivo}
                          {u.versao > 1 && (
                            <span className="ml-1 font-mono text-muted-foreground">v{u.versao}</span>
                          )}
                          {u.validado && (
                            <CheckCircle2 className="ml-1 inline size-3 text-status-aprovado" />
                          )}
                        </span>
                        <span className="text-muted-foreground">{tamanhoLegivel(u.tamanho)}</span>
                        <a
                          href={`/api/uploads/${u.id}/download`}
                          className="text-primary hover:underline"
                          aria-label="Baixar"
                        >
                          <Download className="size-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {disciplina.uploads.length > 0 && (
            <Button variant="outline" size="sm" render={<a href={`/api/uploads/disciplina/${disciplina.id}/zip`} />}>
              <FileArchive className="size-3.5" /> Baixar tudo (.zip)
            </Button>
          )}
          {podeValidar && (
            <Button onClick={validar} disabled={!completoParaValidar || validando}>
              <ShieldCheck className="size-4" />
              {disciplina.jaValidado
                ? "Já validada"
                : validando
                  ? "Validando…"
                  : "Validar entrega"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevisaoDialog({
  disciplina,
  podeRegistrar,
}: {
  disciplina: Disc;
  podeRegistrar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function registrar() {
    start(async () => {
      const res = await registrarRevisao({ disciplinaId: disciplina.id, motivo: motivo || undefined });
      if (res.ok) {
        toast.success(`Revisão RV${String(res.data.numero).padStart(2, "0")} registrada.`);
        setMotivo("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <History className="size-3.5" /> Revisões ({disciplina.revisoes.length})
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — revisões</DialogTitle>
          <DialogDescription>Histórico imutável de revisões (RVxx).</DialogDescription>
        </DialogHeader>

        <div className="max-h-60 space-y-2 overflow-y-auto">
          {disciplina.revisoes.length === 0 ? (
            <EmptyState icon={GitBranch} title="Nenhuma revisão registrada" />
          ) : (
            disciplina.revisoes.map((rv) => (
              <div key={rv.id} className="rounded-sm border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">
                    RV{String(rv.numero).padStart(2, "0")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatarData(rv.data)} · {rv.autor}
                  </span>
                </div>
                {rv.motivo && <p className="mt-1 text-muted-foreground">{rv.motivo}</p>}
              </div>
            ))
          )}
        </div>

        {podeRegistrar && (
          <div className="space-y-2">
            <Label>Motivo da revisão (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          {podeRegistrar && (
            <Button onClick={registrar} disabled={pending}>
              {pending ? "Registrando…" : "Registrar revisão"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResponsaveisDialog({
  disciplina,
  internos,
}: {
  disciplina: Disc;
  internos: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(disciplina.responsaveis.map((r) => r.userId));
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function salvar() {
    start(async () => {
      const res = await definirResponsaveis({ disciplinaId: disciplina.id, responsaveisIds: sel });
      if (res.ok) {
        toast.success("Responsáveis atualizados.");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Users className="size-3.5" /> Responsáveis
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — responsáveis</DialogTitle>
          <DialogDescription>Permite múltiplos responsáveis.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {internos.map((u) => {
            const s = sel.includes(u.id);
            return (
              <button
                type="button"
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                  s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {u.name}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
