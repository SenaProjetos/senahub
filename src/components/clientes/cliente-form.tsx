"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import {
  criarCliente,
  editarCliente,
  buscarCandidatosDuplicata,
  consultarCnpj,
} from "@/modules/clientes/actions";
import { CATEGORIAS_CLIENTE, type CriarClienteInput } from "@/modules/clientes/schemas";
import { validarCNPJ, validarCpfCnpj } from "@/lib/documento";
import { PORTES_CLIENTE } from "@/modules/clientes/porte";
import { STATUS_COMERCIAL_LABEL } from "@/modules/comercial/labels";
import type { CandidatoDuplicata, MotivoCandidato } from "@/modules/comercial/dedupe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContatosTab } from "@/components/clientes/contatos-tab";

type Cliente = CriarClienteInput & { id?: string; status?: keyof typeof STATUS_COMERCIAL_LABEL };
type Segmento = { id: string; nome: string };

const VAZIO: Cliente = { tipo: "PJ", nome: "" };
const SEM_SEGMENTO = "nenhum";

/** Rótulo pt-BR do motivo do candidato a duplicata (F1.13) — específico deste alerta. */
const MOTIVO_LABEL: Record<MotivoCandidato, string> = {
  documento: "mesmo CNPJ/CPF",
  nome_exato: "mesmo nome",
  email: "mesmo domínio de e-mail",
  nome_similar: "nome parecido",
};

export function ClienteForm({
  cliente,
  open,
  onOpenChange,
  segmentos = [],
}: {
  cliente?: Cliente | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  segmentos?: Segmento[];
}) {
  const [form, setForm] = useState<Cliente>(cliente ?? VAZIO);
  const [aba, setAba] = useState("identificacao");
  const [visitouContatos, setVisitouContatos] = useState(false);
  const [pending, startTransition] = useTransition();
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [importandoCnpj, setImportandoCnpj] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoDuplicata[]>([]);
  const [alertaDispensado, setAlertaDispensado] = useState(false);

  // Reinicia o form quando muda o cliente em edição OU quando o dialog reabre
  // (sem isso, "novo cliente" reaproveitava o estado do cadastro anterior).
  const key = cliente?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  const [lastOpen, setLastOpen] = useState(open);
  if (lastKey !== key || lastOpen !== open) {
    setLastKey(key);
    setLastOpen(open);
    if (lastKey !== key || open) {
      setForm(cliente ?? VAZIO);
      setAba("identificacao");
      setVisitouContatos(false);
    }
  }

  function set<K extends keyof Cliente>(campo: K, valor: Cliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function mudarAba(v: string | null) {
    if (!v) return;
    setAba(v);
    if (v === "contatos") setVisitouContatos(true);
  }

  // Alerta NÃO BLOQUEANTE de duplicata (F1.13) — só na criação (editar não checa contra si
  // mesmo). Debounce de 400ms pra não bater no servidor a cada tecla; cancela a busca anterior
  // se o usuário continuar digitando antes dela voltar.
  useEffect(() => {
    if (form.id) {
      setCandidatos([]);
      return;
    }
    const nome = form.nome?.trim() ?? "";
    const documento = form.documento?.trim() ?? "";
    const email = form.email?.trim() ?? "";
    if (nome.length < 3 && !documento && !email) {
      setCandidatos([]);
      return;
    }
    const timer = setTimeout(() => {
      buscarCandidatosDuplicata({
        nome: nome || undefined,
        tipo: form.tipo,
        documento: documento || undefined,
        email: email || undefined,
      }).then((r) => {
        if (r.ok) {
          setCandidatos(r.data);
          setAlertaDispensado(false);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [form.nome, form.documento, form.email, form.tipo, form.id]);

  async function preencherPorCep() {
    const cep = (form.cep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`/api/cep/${cep}`);
      if (res.ok) {
        const e = await res.json();
        setForm((f) => ({
          ...f,
          logradouro: e.logradouro || f.logradouro,
          bairro: e.bairro || f.bairro,
          cidade: e.cidade || f.cidade,
          uf: e.uf || f.uf,
        }));
      } else {
        toast.error("CEP não encontrado.");
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  async function importarDadosCnpj() {
    const cnpj = form.documento ?? "";
    if (!validarCNPJ(cnpj)) {
      toast.error("Informe um CNPJ válido para importar os dados.");
      return;
    }

    setImportandoCnpj(true);
    try {
      const res = await consultarCnpj({ cnpj });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setForm((f) => ({
        ...f,
        nome: res.data.nome,
        nomeFantasia: res.data.nomeFantasia ?? f.nomeFantasia,
        email: res.data.email ?? f.email,
        telefone: res.data.telefone ?? f.telefone,
        cep: res.data.cep ?? f.cep,
        logradouro: res.data.logradouro ?? f.logradouro,
        numero: res.data.numero ?? f.numero,
        complemento: res.data.complemento ?? f.complemento,
        bairro: res.data.bairro ?? f.bairro,
        cidade: res.data.cidade ?? f.cidade,
        uf: res.data.uf ?? f.uf,
        porte: res.data.porte ?? f.porte,
      }));
      toast.success("Dados importados. Revise antes de salvar.");
    } finally {
      setImportandoCnpj(false);
    }
  }

  const docInvalido = (form.documento ?? "").trim() !== "" && !validarCpfCnpj(form.documento ?? "");
  const porteLegado = form.porte && !PORTES_CLIENTE.some((porte) => porte.valor === form.porte)
    ? form.porte
    : undefined;

  function salvar() {
    if (docInvalido) {
      toast.error(form.tipo === "PJ" ? "CNPJ inválido." : "CPF inválido.");
      return;
    }
    startTransition(async () => {
      const res = form.id
        ? await editarCliente({ ...form, id: form.id })
        : await criarCliente(form);
      if (res.ok) {
        toast.success(form.id ? "Cliente atualizado." : "Cliente criado.");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Dados cadastrais, comerciais e contatos.</DialogDescription>
        </DialogHeader>

        {!alertaDispensado && candidatos.length > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-medium">
                {candidatos.length === 1
                  ? "Já existe um cliente parecido"
                  : `Já existem ${candidatos.length} clientes parecidos`}
              </p>
              <ul className="space-y-1">
                {candidatos.slice(0, 5).map((c) => (
                  <li key={c.cliente.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {c.cliente.nome}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({MOTIVO_LABEL[c.motivo]})
                      </span>
                    </span>
                    <Link
                      href={`/clientes/${c.cliente.id}`}
                      target="_blank"
                      className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
                    >
                      Usar este ↗
                    </Link>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setAlertaDispensado(true)}
              >
                Criar mesmo assim
              </Button>
            </div>
          </div>
        )}

        <Tabs value={aba} onValueChange={mudarAba}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="identificacao">Identificação</TabsTrigger>
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
            <TabsTrigger value="observacoes">Observações</TabsTrigger>
            {/* Só existe para cliente já salvo — contato pertence a um cliente que já tem id. */}
            {form.id && <TabsTrigger value="contatos">Contatos</TabsTrigger>}
          </TabsList>

          <TabsContent value="identificacao" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => {
                    if (v !== "PF" && v !== "PJ") return;
                    if (v === form.tipo) return; // sem troca real, não mexe
                    // Troca PF/PJ muda o significado de nome (razão social↔nome) e documento
                    // (CNPJ↔CPF); limpa pra não reaproveitar dado do tipo anterior.
                    setForm((f) => ({ ...f, tipo: v, nome: "", documento: undefined, nomeFantasia: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{form.tipo === "PJ" ? "Razão social" : "Nome"}</Label>
                <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
              </div>
            </div>

            {form.tipo === "PJ" && (
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input
                  value={form.nomeFantasia ?? ""}
                  onChange={(e) => set("nomeFantasia", e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>{form.tipo === "PJ" ? "CNPJ" : "CPF"}</Label>
                  {form.tipo === "PJ" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      onClick={importarDadosCnpj}
                      disabled={importandoCnpj || !validarCNPJ(form.documento ?? "")}
                    >
                      {importandoCnpj ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Importar dados
                    </Button>
                  )}
                </div>
                <Input
                  value={form.documento ?? ""}
                  onChange={(e) => set("documento", e.target.value)}
                  aria-invalid={docInvalido}
                />
                {docInvalido && (
                  <p className="text-xs text-destructive">{form.tipo === "PJ" ? "CNPJ inválido." : "CPF inválido."}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.cep ?? ""}
                    onChange={(e) => set("cep", e.target.value)}
                    onBlur={preencherPorCep}
                    placeholder="00000-000"
                    className={buscandoCep ? "pr-9" : undefined}
                    aria-busy={buscandoCep}
                  />
                  {buscandoCep && (
                    <Loader2 className="absolute inset-y-0 right-0 my-auto mr-2.5 size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {buscandoCep && (
                  <p className="text-xs text-muted-foreground">Buscando endereço…</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Logradouro</Label>
                <Input
                  value={form.logradouro ?? ""}
                  onChange={(e) => set("logradouro", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Complemento</Label>
                <Input
                  value={form.complemento ?? ""}
                  onChange={(e) => set("complemento", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3 space-y-1.5">
                <Label>Bairro</Label>
                <Input
                  value={form.bairro ?? ""}
                  onChange={(e) => set("bairro", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Cidade</Label>
                <Input
                  value={form.cidade ?? ""}
                  onChange={(e) => set("cidade", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={form.uf ?? ""}
                  onChange={(e) => set("uf", e.target.value.toUpperCase())}
                  placeholder={buscandoCep ? "…" : undefined}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comercial" className="space-y-3">
            {form.status && (
              <div className="flex items-center gap-2 rounded-sm border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Classificação atual:</span>
                <Badge variant="outline">{STATUS_COMERCIAL_LABEL[form.status]}</Badge>
                <span className="text-xs text-muted-foreground">
                  (calculada automaticamente a partir do histórico de propostas)
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select
                  value={form.segmentoId || SEM_SEGMENTO}
                  onValueChange={(v) => set("segmentoId", v === SEM_SEGMENTO ? undefined : (v ?? undefined))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_SEGMENTO}>Sem segmento</SelectItem>
                    {segmentos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Porte</Label>
                <Select
                  value={form.porte ?? ""}
                  onValueChange={(v) => set("porte", v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {porteLegado && (
                      <SelectItem value={porteLegado}>{porteLegado} (legado)</SelectItem>
                    )}
                    {PORTES_CLIENTE.map((porte) => (
                      <SelectItem key={porte.valor} value={porte.valor}>
                        {porte.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Categoria <span className="text-xs font-normal text-muted-foreground">(campo legado — prefira Segmento)</span>
              </Label>
              <Select
                value={form.categoria ?? ""}
                onValueChange={(v) => set("categoria", v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_CLIENTE.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="linkedin" className="space-y-3">
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input
                type="url"
                value={form.linkedinUrl ?? ""}
                onChange={(e) => set("linkedinUrl", e.target.value)}
                placeholder="https://www.linkedin.com/company/…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sales Navigator</Label>
              <Input
                type="url"
                value={form.salesNavigatorUrl ?? ""}
                onChange={(e) => set("salesNavigatorUrl", e.target.value)}
                placeholder="https://www.linkedin.com/sales/…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Só o link, colado à mão — sem automação de navegador ou scraping (Fase 4).
            </p>
          </TabsContent>

          <TabsContent value="observacoes" className="space-y-3">
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                rows={6}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={form.observacoes ?? ""}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </div>
          </TabsContent>

          {form.id && (
            <TabsContent value="contatos">
              {visitouContatos && <ContatosTab clienteId={form.id} />}
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !form.nome || docInvalido}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
