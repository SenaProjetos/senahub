"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Megaphone, Search } from "lucide-react";
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
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const tituloTrim = titulo.trim();
  const corpoTrim = corpo.trim();

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

      <Card className="max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4" /> Mensagem
          </CardTitle>
          <CardDescription>Título e mensagem do comunicado.</CardDescription>
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

          {/* Pré-visualização */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
            <div className="flex items-start gap-3 rounded-sm border bg-muted/40 p-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Megaphone className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">
                  {tituloTrim || <span className="text-muted-foreground italic">Título do aviso…</span>}
                </p>
                {corpoTrim ? (
                  <p className="mt-0.5 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                    {corpoTrim}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {alvoLabel} · {exigeConfirmacao ? "com confirmação" : "sem confirmação"}
                  {enviarEmail ? " · e-mail" : ""}
                </p>
              </div>
            </div>
          </div>

          <Button onClick={enviar} disabled={pending}>
            <Megaphone className="size-3.5" /> {pending ? "Enviando…" : "Enviar aviso"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
