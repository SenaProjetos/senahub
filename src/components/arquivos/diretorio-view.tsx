"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  FolderKanban,
  Folder,
  FolderOpen,
  File as FileIcon,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Download,
  Eye,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { DiretorioProjeto } from "@/modules/arquivos/queries";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { cn, formatarData, rotuloRevisao } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

const PACOTE_LABEL: Record<string, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
  RECEBIDOS: "Recebidos do cliente",
  OUTROS: "Outros arquivos",
};

function extDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function IconeArquivo({ nome }: { nome: string }) {
  const ext = extDe(nome);
  if (ext === "pdf") return <FileText className="size-4 shrink-0 text-destructive" />;
  if (["dwg", "dxf", "dwf"].includes(ext)) return <FileCode className="size-4 shrink-0 text-primary" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet className="size-4 shrink-0 text-status-aprovado" />;
  if (["zip", "rar", "7z"].includes(ext)) return <FileArchive className="size-4 shrink-0 text-muted-foreground" />;
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return <ImageIcon className="size-4 shrink-0 text-primary" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

const PDF_INLINE = (url: string) => `${url}?disposition=inline`;

export function DiretorioView({
  projetos,
  podeValidar,
  veTodas,
}: {
  projetos: DiretorioProjeto[];
  podeValidar: boolean;
  veTodas: boolean;
}) {
  const [q, setQ] = useState("");
  const termo = q.trim().toLowerCase();

  // Filtro client-side: casa em projeto (código/nome/cliente), disciplina ou arquivo.
  const filtrados = useMemo(() => {
    if (!termo) return projetos;
    return projetos
      .map((p) => {
        const projetoCasa =
          p.codigo.toLowerCase().includes(termo) ||
          p.nome.toLowerCase().includes(termo) ||
          p.cliente.toLowerCase().includes(termo);
        const disciplinas = p.disciplinas
          .map((d) => {
            const discCasa = d.nome.toLowerCase().includes(termo);
            const arquivos =
              projetoCasa || discCasa ? d.arquivos : d.arquivos.filter((a) => a.nome.toLowerCase().includes(termo));
            return { ...d, arquivos };
          })
          .filter((d) => d.arquivos.length > 0);
        return { ...p, disciplinas };
      })
      .filter((p) => p.disciplinas.length > 0);
  }, [projetos, termo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por projeto, cliente, disciplina ou arquivo…"
            className="pl-8"
          />
        </div>
        {!veTodas && (
          <p className="hidden text-xs text-muted-foreground sm:block">
            Mostrando apenas as disciplinas onde você é responsável.
          </p>
        )}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum arquivo encontrado"
          description={
            termo
              ? "Ajuste a busca para encontrar arquivos."
              : "Os arquivos dos projetos aparecem aqui conforme forem enviados."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => (
            <ProjetoNode key={p.id} projeto={p} podeValidar={podeValidar} abrirInicial={!!termo} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjetoNode({
  projeto,
  podeValidar,
  abrirInicial,
}: {
  projeto: DiretorioProjeto;
  podeValidar: boolean;
  abrirInicial: boolean;
}) {
  const [aberto, setAberto] = useState(abrirInicial);
  const totalArquivos = projeto.disciplinas.reduce((n, d) => n + d.arquivos.length, 0);
  const pendentes = projeto.disciplinas.reduce((n, d) => n + d.pendentes, 0);

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
        <FolderKanban className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          <span className="text-muted-foreground">{projeto.codigo}</span> · {projeto.nome}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{projeto.cliente}</span>
        {pendentes > 0 && (
          <Badge variant="outline" className="shrink-0 gap-1 text-warning">
            <Clock className="size-3" /> {pendentes}
          </Badge>
        )}
        <Badge variant="secondary" className="shrink-0">
          {totalArquivos}
        </Badge>
      </button>

      {aberto && (
        <div className="border-t px-1 py-1">
          {projeto.disciplinas.map((d) => (
            <DisciplinaNode
              key={d.id}
              disciplina={d}
              podeValidar={podeValidar}
              abrirInicial={abrirInicial}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DisciplinaNode({
  disciplina,
  podeValidar,
  abrirInicial,
}: {
  disciplina: DiretorioProjeto["disciplinas"][number];
  podeValidar: boolean;
  abrirInicial: boolean;
}) {
  const [aberto, setAberto] = useState(abrirInicial);
  // Validação só faz sentido enquanto a entrega não foi finalizada (action recusa depois).
  const mostrarAcoes = podeValidar && !disciplina.finalizado;

  return (
    <div className="ml-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
        {aberto ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{disciplina.nome}</span>
        {disciplina.finalizado && (
          <Badge variant="outline" className="shrink-0 gap-1 text-status-aprovado">
            <CheckCircle2 className="size-3" /> entregue
          </Badge>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">{disciplina.arquivos.length}</span>
      </button>

      {aberto && (
        <ul className="ml-6 border-l pl-2">
          {disciplina.arquivos.map((a) => {
            const ext = extDe(a.nome);
            const inline = ext === "pdf";
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                <IconeArquivo nome={a.nome} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm">{a.nome}</span>
                    {a.versao > 1 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{rotuloRevisao(a.versao)}</span>
                    )}
                    {a.ajusteObs ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-warning" title={a.ajusteObs}>
                        <AlertTriangle className="size-3" /> ajuste
                      </Badge>
                    ) : a.aprovado ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-status-aprovado">
                        <CheckCircle2 className="size-3" /> validado
                      </Badge>
                    ) : (a.pacote === "A" || a.pacote === "B") ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-warning">
                        <Clock className="size-3" /> pendente
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {PACOTE_LABEL[a.pacote] ?? a.pacote} · {a.autor} · {formatarData(a.data)} · {fmtBytes(a.tamanho)}
                  </p>
                </div>
                {inline && (
                  <Link
                    href={PDF_INLINE(a.downloadUrl)}
                    target="_blank"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Abrir"
                    aria-label={`Abrir ${a.nome}`}
                  >
                    <Eye className="size-4" />
                  </Link>
                )}
                <Link
                  href={a.downloadUrl}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Baixar"
                  aria-label={`Baixar ${a.nome}`}
                >
                  <Download className="size-4" />
                </Link>
                {mostrarAcoes && (
                  <AcoesValidacaoArquivo uploadId={a.id} nomeArquivo={a.nome} validado={a.aprovado} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
