"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Mail, Megaphone, Monitor, Search, Trash2 } from "lucide-react";
import { criarAviso } from "@/modules/notificacoes/avisos/actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export type UsuarioAlvo = { id: string; name: string; role: Role };

type AlvoTipo = "todos" | "categoria" | "usuarios";

export function AvisoGeralView({ usuarios }: { usuarios: UsuarioAlvo[] }) {
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [alvoTipo, setAlvoTipo] = useState<AlvoTipo>("todos");
  const [incluirClientes, setIncluirClientes] = useState(false);
  const [rolesSel, setRolesSel] = useState<Set<Role>>(new Set());
  const [usersSel, setUsersSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [exigeConfirmacao, setExigeConfirmacao] = useState(true);
  const [enviarEmail, setEnviarEmail] = useState(false);
  // Imagem opcional: `imagemPath` (persistido no storage) + preview local (objectURL).
  const [imagemPath, setImagemPath] = useState<string | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [modoPreview, setModoPreview] = useState<"sistema" | "email">("sistema");
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const imagemRef = useRef<HTMLInputElement>(null);

  const tituloTrim = titulo.trim();
  const corpoTrim = corpo.trim();

  async function escolherImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    setEnviandoImagem(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/avisos/imagem", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setImagemPath(j.caminho);
        setImagemPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(f);
        });
      } else toast.error(j.error ?? "Falha ao enviar a imagem.");
    } finally {
      setEnviandoImagem(false);
    }
  }

  function removerImagem() {
    setImagemPath(null);
    setImagemPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? usuarios.filter((u) => u.name.toLowerCase().includes(q)) : usuarios;
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [usuarios, busca]);

  function toggleRole(r: Role) {
    setRolesSel((s) => {
      const n = new Set(s);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });
  }
  function toggleUser(id: string) {
    setUsersSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const alvoLabel =
    alvoTipo === "todos"
      ? incluirClientes
        ? "todos (equipe + clientes)"
        : "toda a equipe interna"
      : alvoTipo === "categoria"
        ? `${rolesSel.size} categoria(s)`
        : `${usersSel.size} usuário(s)`;

  async function enviar() {
    if (!tituloTrim) return toast.error("Informe o título.");
    if (alvoTipo === "categoria" && rolesSel.size === 0) return toast.error("Selecione ao menos uma categoria.");
    if (alvoTipo === "usuarios" && usersSel.size === 0) return toast.error("Selecione ao menos um usuário.");

    const ok = await confirm({
      title: "Enviar aviso?",
      description: `Destino: ${alvoLabel}. ${exigeConfirmacao ? "Exigirá confirmação de leitura." : "Sem confirmação de leitura."}`,
      variant: "default",
      confirmLabel: "Enviar",
    });
    if (!ok) return;

    start(async () => {
      const r = await criarAviso({
        titulo,
        corpo,
        alvoTipo,
        alvoRoles: [...rolesSel],
        userIds: [...usersSel],
        incluirClientes,
        exigeConfirmacao,
        enviarEmail,
        imagemPath: imagemPath ?? undefined,
      });
      if (r.ok) {
        toast.success(
          `Aviso enviado para ${r.data.total} usuário(s)` +
            (r.data.comEmail ? ` · ${r.data.comEmail} e-mail(s)` : "") +
            ".",
        );
        setTitulo("");
        setCorpo("");
        setRolesSel(new Set());
        setUsersSel(new Set());
        removerImagem();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Novo aviso</h2>
        <p className="text-sm text-muted-foreground">
          Comunicado que aparece em tela cheia para o destinatário e (opcionalmente) exige confirmação de
          leitura.
        </p>
      </div>

      <Card data-tour="aviso-mensagem" className="max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4" /> Mensagem
          </CardTitle>
          <CardDescription>Título, mensagem e imagem opcional do comunicado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Manutenção no sistema sábado"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Detalhes do aviso"
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          {/* Imagem opcional */}
          <div className="space-y-1.5">
            <Label>Imagem (opcional)</Label>
            <input ref={imagemRef} type="file" accept="image/*" hidden onChange={escolherImagem} />
            {imagemPreview ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagemPreview}
                  alt="Prévia da imagem do aviso"
                  className="max-h-40 rounded-md border object-contain"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -top-2 -right-2 size-7 rounded-full shadow"
                  aria-label="Remover imagem"
                  onClick={removerImagem}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => imagemRef.current?.click()}
                disabled={enviandoImagem}
              >
                <ImagePlus className="size-4" /> {enviandoImagem ? "Enviando…" : "Anexar imagem"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Aparece no aviso em tela e no e-mail. Reduzida automaticamente (máx 1000px).
            </p>
          </div>

          {/* Alvo */}
          <div className="space-y-2">
            <Label>Destinatários</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todos"],
                  ["categoria", "Por categoria"],
                  ["usuarios", "Por nome"],
                ] as [AlvoTipo, string][]
              ).map(([tipo, rotulo]) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setAlvoTipo(tipo)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    alvoTipo === tipo
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input hover:bg-muted",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {alvoTipo === "todos" && (
              <div className="flex items-center justify-between gap-4 rounded-sm border p-3">
                <div>
                  <Label className="text-sm font-medium">Incluir clientes (portal)</Label>
                  <p className="text-xs text-muted-foreground">Por padrão envia só para a equipe interna.</p>
                </div>
                <Switch checked={incluirClientes} onCheckedChange={(v: boolean) => setIncluirClientes(v)} />
              </div>
            )}

            {alvoTipo === "categoria" && (
              <div className="grid grid-cols-2 gap-2 rounded-sm border p-3 sm:grid-cols-3">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={rolesSel.has(r)}
                      onCheckedChange={() => toggleRole(r)}
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            )}

            {alvoTipo === "usuarios" && (
              <div className="rounded-sm border">
                <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {usersSel.size > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">{usersSel.size} selec.</span>
                  )}
                </div>
                <ScrollArea className="h-48">
                  <div className="divide-y">
                    {usuariosFiltrados.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox checked={usersSel.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                        <span className="min-w-0 flex-1 truncate">{u.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[u.role]}</span>
                      </label>
                    ))}
                    {usuariosFiltrados.length === 0 && (
                      <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                        Nenhum usuário.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Opções */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-sm border p-3">
              <div>
                <Label className="text-sm font-medium">Exigir confirmação</Label>
                <p className="text-xs text-muted-foreground">Modal bloqueante até &ldquo;Li e entendi&rdquo;.</p>
              </div>
              <Switch checked={exigeConfirmacao} onCheckedChange={(v: boolean) => setExigeConfirmacao(v)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-sm border p-3">
              <div>
                <Label className="text-sm font-medium">Enviar por e-mail</Label>
                <p className="text-xs text-muted-foreground">Além do modal (requer SMTP).</p>
              </div>
              <Switch checked={enviarEmail} onCheckedChange={(v: boolean) => setEnviarEmail(v)} />
            </div>
          </div>

          {/* Pré-visualização (como fica no sistema e no e-mail) */}
          <div data-tour="aviso-preview" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
              <div className="flex overflow-hidden rounded-md border">
                {(
                  [
                    ["sistema", "No sistema", Monitor],
                    ["email", "No e-mail", Mail],
                  ] as [typeof modoPreview, string, typeof Monitor][]
                ).map(([modo, rotulo, Icone]) => (
                  <button
                    key={modo}
                    type="button"
                    onClick={() => setModoPreview(modo)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
                      modoPreview === modo ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <Icone className="size-3.5" /> {rotulo}
                  </button>
                ))}
              </div>
            </div>

            {modoPreview === "sistema" ? (
              /* Espelha o modal bloqueante do destinatário (aviso-provider). */
              <div className="rounded-lg border bg-background p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Megaphone className="size-4 text-primary" />
                  {tituloTrim || <span className="font-normal text-muted-foreground italic">Título do aviso…</span>}
                </p>
                {corpoTrim ? (
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">{corpoTrim}</p>
                ) : null}
                {imagemPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagemPreview} alt="" className="mt-3 max-h-56 w-full rounded-md object-contain" />
                ) : null}
                <div className="mt-3 flex justify-end">
                  <span className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Li e entendi
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  {alvoLabel} · {exigeConfirmacao ? "com confirmação" : "sem confirmação"}
                </p>
              </div>
            ) : (
              /* Aproxima o e-mail renderizado (assunto + corpo + imagem inline + rodapé do template). */
              <div className="overflow-hidden rounded-lg border bg-white text-neutral-900">
                <div className="border-b bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                  <p>
                    <span className="text-neutral-400">De:</span> SenaHub
                  </p>
                  <p className="truncate font-medium text-neutral-800">
                    SenaHub — {tituloTrim || "Título do aviso"}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <h2 className="text-lg font-bold">
                    {tituloTrim || <span className="font-normal text-neutral-400 italic">Título do aviso…</span>}
                  </h2>
                  {corpoTrim ? (
                    <p className="mt-2 text-sm break-words whitespace-pre-wrap">{corpoTrim}</p>
                  ) : null}
                  {imagemPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagemPreview} alt="" className="mt-3 max-h-56 rounded-md object-contain" />
                  ) : null}
                  <p className="mt-4 text-xs text-neutral-500 italic">
                    Comunicado do SenaHub — confirme a leitura ao acessar o sistema.
                  </p>
                </div>
                {!enviarEmail ? (
                  <p className="border-t bg-amber-50 px-4 py-1.5 text-[11px] text-amber-700">
                    O envio por e-mail está desligado — marque &ldquo;Enviar por e-mail&rdquo; para disparar.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <Button onClick={enviar} disabled={pending}>
            <Megaphone className="size-3.5" /> {pending ? "Enviando…" : "Enviar aviso"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
