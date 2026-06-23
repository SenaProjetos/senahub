"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus, Pencil, X, UserPlus, Power } from "lucide-react";
import {
  criarPessoaJuridica,
  editarPessoaJuridica,
  alternarAtivoPessoaJuridica,
  atribuirMembroPJ,
} from "@/modules/rh/pessoas-juridicas/actions";
import type { PessoaJuridicaItem } from "@/modules/rh/pessoas-juridicas/queries";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { maskCnpj } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Projetista = { id: string; name: string; role: string; pjId: string | null };
type Form = { id?: string; cnpj: string; razaoSocial: string; nomeFantasia: string; email: string; telefone: string };
const VAZIO: Form = { cnpj: "", razaoSocial: "", nomeFantasia: "", email: "", telefone: "" };
const selectCls = "h-8 rounded-sm border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PessoasJuridicasView({
  pjs,
  projetistas,
}: {
  pjs: PessoaJuridicaItem[];
  projetistas: Projetista[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dlg, setDlg] = useState<Form | null>(null);

  const semVinculo = projetistas.filter((p) => !p.pjId);

  function salvar() {
    if (!dlg || !dlg.cnpj.trim() || !dlg.razaoSocial.trim()) return;
    start(async () => {
      const res = dlg.id
        ? await editarPessoaJuridica({ ...dlg, id: dlg.id })
        : await criarPessoaJuridica(dlg);
      if (res.ok) {
        toast.success("PJ salva.");
        setDlg(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function toggle(pj: PessoaJuridicaItem) {
    start(async () => {
      const res = await alternarAtivoPessoaJuridica({ id: pj.id, ativo: !pj.ativo });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  function atribuir(userId: string, pjId: string | null) {
    start(async () => {
      const res = await atribuirMembroPJ({ userId, pjId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Pessoas Jurídicas</h2>
          <p className="text-sm text-muted-foreground">
            CNPJs que agrupam vários perfis de projetista (PJ/freelancer).
          </p>
        </div>
        <Button size="sm" onClick={() => setDlg({ ...VAZIO })}>
          <Plus className="size-4" /> Nova PJ
        </Button>
      </div>

      {pjs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Building2} title="Nenhuma pessoa jurídica cadastrada." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pjs.map((pj) => (
            <Card key={pj.id} className={pj.ativo ? "" : "opacity-60"}>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 shrink-0" /> {pj.razaoSocial}
                    {!pj.ativo && <Badge variant="outline">inativa</Badge>}
                  </CardTitle>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{pj.cnpj}</p>
                  {(pj.nomeFantasia || pj.email || pj.telefone) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[pj.nomeFantasia, pj.email, pj.telefone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setDlg({ id: pj.id, cnpj: pj.cnpj, razaoSocial: pj.razaoSocial, nomeFantasia: pj.nomeFantasia ?? "", email: pj.email ?? "", telefone: pj.telefone ?? "" })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Ativar/inativar" onClick={() => toggle(pj)} disabled={pending}>
                    <Power className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Perfis vinculados ({pj.membros.length})
                </p>
                {pj.membros.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum perfil vinculado.</p>
                ) : (
                  <ul className="space-y-1">
                    {pj.membros.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {m.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">{ROLE_LABELS[m.role as Role] ?? m.role}</span>
                        </span>
                        <button type="button" onClick={() => atribuir(m.id, null)} className="text-muted-foreground hover:text-destructive" title="Desvincular">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {pj.ativo && semVinculo.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <UserPlus className="size-3.5 text-muted-foreground" />
                    <select
                      className={selectCls}
                      value=""
                      onChange={(e) => e.target.value && atribuir(e.target.value, pj.id)}
                      disabled={pending}
                    >
                      <option value="">Vincular projetista…</option>
                      {semVinculo.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg?.id ? "Editar PJ" : "Nova PJ"}</DialogTitle>
          </DialogHeader>
          {dlg && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="CNPJ *"><Input value={dlg.cnpj} onChange={(e) => setDlg({ ...dlg, cnpj: maskCnpj(e.target.value) })} placeholder="00.000.000/0000-00" /></Campo>
                <Campo label="Telefone"><Input value={dlg.telefone} onChange={(e) => setDlg({ ...dlg, telefone: e.target.value })} /></Campo>
              </div>
              <Campo label="Razão social *"><Input value={dlg.razaoSocial} onChange={(e) => setDlg({ ...dlg, razaoSocial: e.target.value })} /></Campo>
              <Campo label="Nome fantasia"><Input value={dlg.nomeFantasia} onChange={(e) => setDlg({ ...dlg, nomeFantasia: e.target.value })} /></Campo>
              <Campo label="E-mail"><Input type="email" value={dlg.email} onChange={(e) => setDlg({ ...dlg, email: e.target.value })} /></Campo>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !dlg?.cnpj.trim() || !dlg?.razaoSocial.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
