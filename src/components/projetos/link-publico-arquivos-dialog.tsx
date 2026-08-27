"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, RefreshCw, Share2, ExternalLink, Mail, Trash2, Plus, Pencil } from "lucide-react";
import {
  criarLinkArquivos,
  atualizarLinkArquivos,
  regerarTokenLinkArquivos,
  excluirLinkArquivos,
  enviarLinkProjetoEmail,
} from "@/modules/projetos/arquivos/link-publico-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type EscopoLink = "disciplinas" | "projeto_todo" | "selecao";

export type LinkData = {
  id: string;
  nome: string | null;
  escopo: EscopoLink;
  token: string;
  ativo: boolean;
  expiraEm: string | null;
  disciplinaIds: string[];
  uploadIds: string[];
};

const ROTULO_ESCOPO: Record<EscopoLink, string> = {
  disciplinas: "Disciplinas escolhidas",
  projeto_todo: "Projeto inteiro",
  selecao: "Arquivos escolhidos",
};

/** ISO (UTC) → valor de `<input type="datetime-local">` (horário local, sem segundos). */
function isoParaLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function localParaIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

/**
 * Gerenciador dos links públicos de arquivos do projeto.
 *
 * São vários por projeto de propósito: o cliente, a prefeitura e um consultor não
 * precisam ver o mesmo recorte nem pelo mesmo prazo, e revogar um não pode derrubar
 * os outros.
 *
 * Link de seleção não se monta aqui — nasce da própria tabela de documentos, marcando
 * os arquivos e usando "Link público" na barra de seleção. Aqui ele só é listado,
 * renomeado, revogado ou apagado.
 */
export function LinkPublicoArquivosButton({
  projetoId,
  baseUrl,
  disciplinas,
  links,
  clienteEmail,
}: {
  projetoId: string;
  baseUrl: string;
  disciplinas: { id: string; nome: string }[];
  links: LinkData[];
  /** E-mail do cliente do projeto — pré-preenche o envio (editável). */
  clienteEmail?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const ativos = links.filter((l) => l.ativo).length;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Share2 className="size-3.5" /> Link público
            {ativos > 0 && (
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {ativos}
              </Badge>
            )}
          </Button>
        }
      />
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Links públicos de arquivos</DialogTitle>
          <DialogDescription>
            Acesso externo, sem login, só para ver e baixar. Cada link tem o seu recorte e a sua validade. Nos
            links por disciplina sai apenas a última revisão de cada documento, sem backup do modelo e sem nada
            que esteja na lixeira.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {links.length === 0 && !criando && (
            <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum link criado ainda.
            </p>
          )}

          {links.map((link) => (
            <CartaoLink
              key={link.id}
              link={link}
              baseUrl={baseUrl}
              disciplinas={disciplinas}
              clienteEmail={clienteEmail}
            />
          ))}

          {criando ? (
            <FormularioNovoLink
              projetoId={projetoId}
              disciplinas={disciplinas}
              onPronto={() => setCriando(false)}
            />
          ) : (
            <Button variant="outline" onClick={() => setCriando(true)} className="w-full">
              <Plus className="size-4" /> Novo link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Formulário de criação — escopo de seleção fica de fora: ele vem da tabela. */
function FormularioNovoLink({
  projetoId,
  disciplinas,
  onPronto,
}: {
  projetoId: string;
  disciplinas: { id: string; nome: string }[];
  onPronto: () => void;
}) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState<"disciplinas" | "projeto_todo">("disciplinas");
  const [sel, setSel] = useState<Set<string>>(new Set(disciplinas.map((d) => d.id)));
  const [expira, setExpira] = useState("");

  function criar() {
    if (escopo === "disciplinas" && sel.size === 0) {
      toast.error("Marque ao menos uma disciplina.");
      return;
    }
    start(async () => {
      const r = await criarLinkArquivos({
        projetoId,
        nome: nome.trim() || undefined,
        escopo,
        disciplinaIds: escopo === "disciplinas" ? [...sel] : [],
        uploadIds: [],
        expiraEm: localParaIso(expira),
      });
      if (r.ok) {
        toast.success("Link público criado.");
        onPronto();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border p-3">
      <p className="text-sm font-semibold">Novo link</p>

      <div className="space-y-1.5">
        <Label htmlFor="novo-nome" className="text-xs text-muted-foreground">
          Nome (opcional)
        </Label>
        <Input
          id="novo-nome"
          placeholder="Prefeitura, cliente final, consultor…"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">O que o link mostra</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
          <input
            type="radio"
            name="escopo-novo"
            className="mt-1"
            checked={escopo === "disciplinas"}
            onChange={() => setEscopo("disciplinas")}
          />
          <span>
            Disciplinas escolhidas
            <span className="block text-xs text-muted-foreground">Só as marcadas abaixo.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
          <input
            type="radio"
            name="escopo-novo"
            className="mt-1"
            checked={escopo === "projeto_todo"}
            onChange={() => setEscopo("projeto_todo")}
          />
          <span>
            Projeto inteiro
            <span className="block text-xs text-muted-foreground">
              Todas as disciplinas, inclusive as criadas depois deste link.
            </span>
          </span>
        </label>
      </fieldset>

      {escopo === "disciplinas" && (
        <SeletorDisciplinas disciplinas={disciplinas} sel={sel} setSel={setSel} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="novo-expira" className="text-xs text-muted-foreground">
          Expira em (opcional)
        </Label>
        <Input
          id="novo-expira"
          type="datetime-local"
          value={expira}
          onChange={(e) => setExpira(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onPronto} disabled={pendente}>
          Cancelar
        </Button>
        <Button onClick={criar} disabled={pendente}>
          <Link2 className="size-4" /> {pendente ? "Criando…" : "Criar link"}
        </Button>
      </div>
    </div>
  );
}

function SeletorDisciplinas({
  disciplinas,
  sel,
  setSel,
}: {
  disciplinas: { id: string; nome: string }[];
  sel: Set<string>;
  setSel: (fn: (prev: Set<string>) => Set<string>) => void;
}) {
  if (disciplinas.length === 0) {
    return <p className="text-sm text-muted-foreground">O projeto não tem disciplinas.</p>;
  }
  return (
    <ul className="max-h-44 space-y-1 overflow-y-auto rounded-sm border p-2">
      {disciplinas.map((d) => (
        <li key={d.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
            <Checkbox
              checked={sel.has(d.id)}
              onCheckedChange={() =>
                setSel((prev) => {
                  const n = new Set(prev);
                  if (n.has(d.id)) n.delete(d.id);
                  else n.add(d.id);
                  return n;
                })
              }
            />
            <span className="truncate">{d.nome}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function CartaoLink({
  link,
  baseUrl,
  disciplinas,
  clienteEmail,
}: {
  link: LinkData;
  baseUrl: string;
  disciplinas: { id: string; nome: string }[];
  clienteEmail?: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();
  const [editando, setEditando] = useState(false);
  const [emailDest, setEmailDest] = useState(clienteEmail ?? "");

  const [nome, setNome] = useState(link.nome ?? "");
  const [ativo, setAtivo] = useState(link.ativo);
  const [expira, setExpira] = useState(isoParaLocal(link.expiraEm));
  const [sel, setSel] = useState<Set<string>>(new Set(link.disciplinaIds));

  const url = `${baseUrl}/p/arquivos/${link.token}`;
  const expirado = link.expiraEm !== null && new Date(link.expiraEm).getTime() <= Date.now();

  function salvar(patch?: { ativo?: boolean }) {
    const proxAtivo = patch?.ativo ?? ativo;
    start(async () => {
      const r = await atualizarLinkArquivos({
        linkId: link.id,
        nome: nome.trim() || null,
        disciplinaIds: link.escopo === "disciplinas" ? [...sel] : [],
        ativo: proxAtivo,
        expiraEm: localParaIso(expira),
      });
      if (r.ok) {
        toast.success("Link salvo.");
        setEditando(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function regerar() {
    start(async () => {
      const r = await regerarTokenLinkArquivos({ linkId: link.id });
      if (r.ok) {
        toast.success("Endereço trocado. O anterior deixou de funcionar.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function apagar() {
    const ok = await confirm({
      title: "Apagar este link?",
      description:
        "O endereço para de funcionar imediatamente e não volta. Para suspender sem perder o link, desligue-o em vez de apagar.",
      confirmLabel: "Apagar",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirLinkArquivos({ linkId: link.id });
      if (r.ok) {
        toast.success("Link apagado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function copiar() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  function enviarEmail() {
    const to = emailDest.trim();
    if (!to) {
      toast.error("Informe o e-mail do destinatário.");
      return;
    }
    start(async () => {
      const r = await enviarLinkProjetoEmail({ linkId: link.id, email: to });
      if (r.ok) {
        toast.success(
          r.data.convite
            ? "E-mail enviado com o link e o convite para se cadastrar."
            : "E-mail enviado ao cliente.",
        );
      } else toast.error(r.error);
    });
  }

  const resumo =
    link.escopo === "selecao"
      ? `${link.uploadIds.length} ${link.uploadIds.length === 1 ? "arquivo" : "arquivos"}`
      : link.escopo === "projeto_todo"
        ? "todas as disciplinas"
        : `${link.disciplinaIds.length} ${link.disciplinaIds.length === 1 ? "disciplina" : "disciplinas"}`;

  return (
    <div className="space-y-2 rounded-sm border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{link.nome || "Link sem nome"}</p>
          <p className="text-xs text-muted-foreground">
            {ROTULO_ESCOPO[link.escopo]} · {resumo}
            {link.expiraEm && ` · ${expirado ? "expirou" : "expira"} em ${new Date(link.expiraEm).toLocaleString("pt-BR")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!link.ativo && <Badge variant="outline">Revogado</Badge>}
          {link.ativo && expirado && <Badge variant="outline">Expirado</Badge>}
          <Switch
            checked={ativo}
            disabled={pendente}
            aria-label={ativo ? "Revogar link" : "Reativar link"}
            onCheckedChange={(v) => {
              setAtivo(!!v);
              salvar({ ativo: !!v });
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-sm bg-muted px-3 py-2 font-mono text-xs">{url}</p>
        <Button variant="outline" size="icon" onClick={copiar} title="Copiar link" aria-label="Copiar link">
          <Copy className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Abrir link"
          aria-label="Abrir link"
          render={<a href={url} target="_blank" rel="noopener" />}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          placeholder="cliente@exemplo.com"
          value={emailDest}
          onChange={(e) => setEmailDest(e.target.value)}
          aria-label="E-mail do destinatário"
          className="min-w-40 flex-1"
        />
        <Button onClick={enviarEmail} disabled={pendente || !link.ativo || expirado} size="sm">
          <Mail className="size-4" /> Enviar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditando((v) => !v)}>
          <Pencil className="size-4" /> {editando ? "Fechar" : "Editar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={regerar} disabled={pendente} title="Gera um novo endereço e invalida o atual">
          <RefreshCw className="size-4" /> Trocar endereço
        </Button>
        <Button variant="ghost" size="sm" onClick={apagar} disabled={pendente} className="text-destructive">
          <Trash2 className="size-4" /> Apagar
        </Button>
      </div>

      {editando && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label htmlFor={`nome-${link.id}`} className="text-xs text-muted-foreground">
              Nome
            </Label>
            <Input
              id={`nome-${link.id}`}
              placeholder="Prefeitura, cliente final, consultor…"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`expira-${link.id}`} className="text-xs text-muted-foreground">
              Expira em (opcional)
            </Label>
            <Input
              id={`expira-${link.id}`}
              type="datetime-local"
              value={expira}
              onChange={(e) => setExpira(e.target.value)}
            />
          </div>

          {link.escopo === "disciplinas" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Disciplinas liberadas</Label>
              <SeletorDisciplinas disciplinas={disciplinas} sel={sel} setSel={setSel} />
            </div>
          )}

          {link.escopo === "selecao" && (
            <p className="text-xs text-muted-foreground">
              Este link mostra {link.uploadIds.length} {link.uploadIds.length === 1 ? "arquivo escolhido" : "arquivos escolhidos"} a
              dedo — inclusive revisão antiga ou backup do modelo, se foi o que se marcou. Para trocar a lista,
              gere um novo link pela barra de seleção da tabela.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => salvar()} disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
