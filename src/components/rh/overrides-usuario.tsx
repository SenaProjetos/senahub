"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, ShieldPlus } from "lucide-react";
import { criarOverride, revogarOverride } from "@/modules/perfis/overrides-actions";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OverrideItem = {
  id: string;
  recurso: string;
  acao: string;
  permitido: boolean;
  motivo: string;
  expiraEm: string | Date | null;
  criadoEm: string | Date;
  concedidoPorNome: string | null;
  expirado: boolean;
};

function rotuloAcao(recurso: string, acao: string): string {
  const rec = PERMISSOES_CATALOGO.find((r) => r.recurso === recurso);
  const a = rec?.acoes.find((x) => x.acao === acao);
  return a ? `${rec!.label} — ${a.label}` : `${recurso}:${acao}`;
}

/**
 * Overrides individuais de permissão. `motivo` é obrigatório no schema — sem isso vira lixo
 * em 12 meses (exigência do conselho).
 *
 * Desde a Onda D isto **concede e revoga acesso real**: `permissaoEfetiva` consulta o override
 * antes da matriz do perfil, e ele não é cacheado (§5.2), então vale já no próximo request. O
 * texto da tela dizia o contrário desde que o motor era inerte — mentira perigosa numa tela cuja
 * outra metade é revogar permissão.
 */
export function OverridesUsuario({
  userId,
  overrides,
  podeEditar,
}: {
  userId: string;
  overrides: OverrideItem[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  const [recurso, setRecurso] = useState("");
  const [acao, setAcao] = useState("");
  const [permitido, setPermitido] = useState<"true" | "false">("true");
  const [motivo, setMotivo] = useState("");
  const [expiraEm, setExpiraEm] = useState("");

  const acoesDoRecurso = PERMISSOES_CATALOGO.find((r) => r.recurso === recurso)?.acoes ?? [];

  function adicionar() {
    if (!recurso || !acao) {
      toast.error("Escolha o recurso e a ação.");
      return;
    }
    if (motivo.trim().length < 5) {
      toast.error("Explique o motivo (mín. 5 caracteres).");
      return;
    }
    start(async () => {
      const r = await criarOverride({
        userId,
        recurso,
        acao,
        permitido: permitido === "true",
        motivo,
        expiraEm,
      });
      if (r.ok) {
        toast.success("Override criado.");
        setAberto(false);
        setRecurso("");
        setAcao("");
        setMotivo("");
        setExpiraEm("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function revogar(o: OverrideItem) {
    const ok = await confirm({
      title: "Revogar override?",
      description: `"${rotuloAcao(o.recurso, o.acao)}" volta a valer só o que o perfil já concede.`,
      confirmLabel: "Revogar",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await revogarOverride({ id: o.id });
      if (r.ok) {
        toast.success("Override revogado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (!podeEditar && overrides.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldPlus className="size-4" /> Overrides de permissão
        </CardTitle>
        <CardDescription>
          Permissões concedidas ou revogadas manualmente para esta pessoa. Valem no próximo
          carregamento de página e <span className="font-medium">vencem o perfil</span> — inclusive
          para negar o que o perfil concede. Sobrevivem ao <span className="font-medium">db:seed</span>,
          então é aqui que mora uma exceção duradoura.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overrides.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum override ativo.</p>
        ) : (
          <ul className="space-y-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={o.permitido ? "outline" : "destructive"}>
                      {o.permitido ? "concede" : "revoga"}
                    </Badge>
                    <span className="font-medium">{rotuloAcao(o.recurso, o.acao)}</span>
                    {o.expirado && <Badge variant="secondary">expirado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{o.motivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.concedidoPorNome ? `Por ${o.concedidoPorNome} · ` : ""}
                    {formatarDataHora(o.criadoEm)}
                    {o.expiraEm ? ` · expira em ${formatarDataHora(o.expiraEm)}` : ""}
                  </p>
                </div>
                {podeEditar && (
                  <Button size="icon" variant="ghost" disabled={pending} onClick={() => revogar(o)} title="Revogar">
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && (
          <>
            {!aberto ? (
              <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
                <Plus className="size-4" /> Adicionar override
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Recurso</Label>
                    <Select value={recurso} onValueChange={(v) => { setRecurso(v ?? ""); setAcao(""); }}>
                      <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                      <SelectContent>
                        {PERMISSOES_CATALOGO.map((r) => (
                          <SelectItem key={r.recurso} value={r.recurso}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ação</Label>
                    <Select value={acao} onValueChange={(v) => setAcao(v ?? "")} disabled={!recurso}>
                      <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                      <SelectContent>
                        {acoesDoRecurso.map((a) => (
                          <SelectItem key={a.acao} value={a.acao}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Efeito</Label>
                    <Select value={permitido} onValueChange={(v) => setPermitido((v as "true" | "false") ?? "true")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Conceder</SelectItem>
                        <SelectItem value="false">Revogar (mesmo com o perfil concedendo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expira em (opcional)</Label>
                    <Input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo (obrigatório)</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que esta pessoa precisa disso" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
                  <Button size="sm" onClick={adicionar} disabled={pending} loading={pending}>Adicionar</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
