"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criarCredencial, atualizarCredencial } from "@/modules/acessos/actions";
import { ESTADOS, UFS } from "@/modules/acessos/schemas";
import { STATUS_CREDENCIAL } from "@/modules/acessos/service";
import { STATUS_LABEL } from "@/modules/acessos/labels";
import type { OpcoesFormulario } from "@/modules/acessos/queries";

export type ValoresIniciais = {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  categoriaId: string;
  estado: string | null;
  descricao: string | null;
  url: string | null;
  responsavelId: string | null;
  status: string;
  vencimentoEm: Date | null;
  proximaRevisaoEm: Date | null;
  renovacaoAutomatica: boolean;
  fornecedor: string | null;
  tipoLicenca: string | null;
  numeroLicenca: string | null;
  assentos: number | null;
  tags: Array<{ tag: string }>;
  projetos: Array<{ projeto: { id: string } }>;
};

const VAZIO = {
  nome: "",
  nomeCompleto: "",
  categoriaId: "",
  estado: "",
  descricao: "",
  url: "",
  usuario: "",
  senha: "",
  responsavelId: "",
  status: "ativo",
  vencimentoEm: "",
  proximaRevisaoEm: "",
  renovacaoAutomatica: false,
  fornecedor: "",
  tipoLicenca: "",
  numeroLicenca: "",
  assentos: "",
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * §34 — cadastro e edição de acesso.
 *
 * Abas em vez de wizard: §34 lista grupos de campos, não uma sequência. Um wizard obrigaria a
 * passar por Credencial para chegar em Gestão, e a maioria das edições mexe num campo só.
 *
 * A SENHA em edição parte SEMPRE vazia, e vazio significa "não mexer" (é o que a action faz).
 * Pré-preencher exigiria decifrar e mandar o segredo para o cliente toda vez que alguém abrisse
 * o formulário — o oposto de revelar ser uma ação deliberada e auditada (§24/§25).
 */
export function CredencialDialog({
  aberto,
  onFechar,
  opcoes,
  inicial,
  podeGerenciarPermissoes,
}: {
  aberto: boolean;
  onFechar: () => void;
  opcoes: OpcoesFormulario;
  /** Ausente = criar. Presente = editar. */
  inicial?: ValoresIniciais;
  podeGerenciarPermissoes: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [form, setForm] = useState(() =>
    inicial
      ? {
          nome: inicial.nome,
          nomeCompleto: inicial.nomeCompleto ?? "",
          categoriaId: inicial.categoriaId,
          estado: inicial.estado ?? "",
          descricao: inicial.descricao ?? "",
          url: inicial.url ?? "",
          usuario: "",
          senha: "",
          responsavelId: inicial.responsavelId ?? "",
          status: inicial.status,
          vencimentoEm: iso(inicial.vencimentoEm),
          proximaRevisaoEm: iso(inicial.proximaRevisaoEm),
          renovacaoAutomatica: inicial.renovacaoAutomatica,
          fornecedor: inicial.fornecedor ?? "",
          tipoLicenca: inicial.tipoLicenca ?? "",
          numeroLicenca: inicial.numeroLicenca ?? "",
          assentos: inicial.assentos != null ? String(inicial.assentos) : "",
        }
      : VAZIO,
  );
  const [tags, setTags] = useState<string[]>(inicial?.tags.map((t) => t.tag) ?? []);
  const [novaTag, setNovaTag] = useState("");
  const [projetoIds, setProjetoIds] = useState<string[]>(
    inicial?.projetos.map((p) => p.projeto.id) ?? [],
  );

  function set<K extends keyof typeof VAZIO>(campo: K, valor: (typeof VAZIO)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  const categoria = opcoes.categorias.find((c) => c.id === form.categoriaId);
  // §36 — os campos de licença só existem para software/licença. Casado pelo NOME da categoria,
  // que é editável pelo admin: por isso a comparação é frouxa, não um id fixo.
  const ehSoftware = /software|licen/i.test(categoria?.nome ?? "");

  function adicionarTag() {
    const t = novaTag.trim();
    if (!t || tags.includes(t)) return setNovaTag("");
    setTags((v) => [...v, t]);
    setNovaTag("");
  }

  function salvar() {
    iniciar(async () => {
      const comum = {
        nome: form.nome,
        nomeCompleto: form.nomeCompleto || undefined,
        categoriaId: form.categoriaId,
        estado: (form.estado || undefined) as (typeof ESTADOS)[number] | undefined,
        descricao: form.descricao || undefined,
        url: form.url || undefined,
        usuario: form.usuario || undefined,
        senha: form.senha || undefined,
        responsavelId: form.responsavelId || undefined,
        status: form.status as (typeof STATUS_CREDENCIAL)[number],
        vencimentoEm: form.vencimentoEm ? new Date(form.vencimentoEm) : undefined,
        proximaRevisaoEm: form.proximaRevisaoEm ? new Date(form.proximaRevisaoEm) : undefined,
        renovacaoAutomatica: form.renovacaoAutomatica,
        fornecedor: ehSoftware ? form.fornecedor || undefined : undefined,
        tipoLicenca: ehSoftware ? form.tipoLicenca || undefined : undefined,
        numeroLicenca: ehSoftware ? form.numeroLicenca || undefined : undefined,
        assentos: ehSoftware && form.assentos ? Number(form.assentos) : undefined,
        tags,
        projetoIds,
        compartilhamentos: [],
      };

      const r = inicial
        ? await atualizarCredencial({ ...comum, id: inicial.id })
        : await criarCredencial(comum);

      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(inicial ? "Alterações salvas." : "Acesso criado com sucesso.");
      onFechar();
      router.refresh();
    });
  }

  const podeSalvar = form.nome.trim().length > 0 && form.categoriaId.length > 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar acesso" : "Novo acesso"}</DialogTitle>
          <DialogDescription>
            {inicial
              ? "Deixe usuário e senha em branco para mantê-los como estão."
              : "Cadastre um portal, conta ou software utilizado pela empresa."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basico">
          <TabsList className="w-full">
            <TabsTrigger value="basico" className="flex-1">
              Básico
            </TabsTrigger>
            <TabsTrigger value="credencial" className="flex-1">
              Credencial
            </TabsTrigger>
            <TabsTrigger value="gestao" className="flex-1">
              Gestão
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basico" className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="nome" rotulo="Nome" obrigatorio>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="CBMMG"
                />
              </Campo>
              <Campo id="categoria" rotulo="Categoria" obrigatorio>
                <Select
                  value={form.categoriaId}
                  onValueChange={(v) => set("categoriaId", v ?? "")}
                >
                  <SelectTrigger id="categoria">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>

            <Campo id="nomeCompleto" rotulo="Nome completo">
              <Input
                id="nomeCompleto"
                value={form.nomeCompleto}
                onChange={(e) => set("nomeCompleto", e.target.value)}
                placeholder="Corpo de Bombeiros Militar de Minas Gerais"
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="estado" rotulo="Estado">
                <Select value={form.estado} onValueChange={(v) => set("estado", v ?? "")}>
                  <SelectTrigger id="estado">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NACIONAL">Nacional</SelectItem>
                    <SelectItem value="NA">Não aplicável</SelectItem>
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo id="url" rotulo="URL do portal">
                <Input
                  id="url"
                  type="url"
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="https://..."
                />
              </Campo>
            </div>

            <Campo id="descricao" rotulo="Observações">
              <textarea
                id="descricao"
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Conta utilizada para protocolo e acompanhamento de PSCIP..."
              />
            </Campo>

            <Campo id="tag" rotulo="Tags">
              <div className="flex gap-2">
                <Input
                  id="tag"
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarTag();
                    }
                  }}
                  placeholder="PSCIP, Aprovação..."
                />
                <Button type="button" variant="outline" onClick={adicionarTag}>
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1 font-normal">
                      {t}
                      <button
                        type="button"
                        onClick={() => setTags((v) => v.filter((x) => x !== t))}
                        aria-label={`Remover tag ${t}`}
                        className="hover:text-destructive"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </Campo>
          </TabsContent>

          <TabsContent value="credencial" className="space-y-3 pt-3">
            {/* §45 — os campos vão cifrados para o banco; nada aqui é guardado no navegador.
                `autoComplete="off"` + `new-password` impedem o gerenciador do browser de
                oferecer (ou salvar) a credencial corporativa como se fosse do usuário. */}
            <Campo id="usuario" rotulo="Usuário / conta">
              <Input
                id="usuario"
                value={form.usuario}
                onChange={(e) => set("usuario", e.target.value)}
                autoComplete="off"
                placeholder={inicial ? "Deixe em branco para manter" : "projetos@empresa.com.br"}
              />
            </Campo>
            <Campo id="senha" rotulo="Senha">
              <Input
                id="senha"
                type="password"
                value={form.senha}
                onChange={(e) => set("senha", e.target.value)}
                autoComplete="new-password"
                placeholder={inicial ? "Deixe em branco para manter" : "••••••••"}
              />
            </Campo>
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              A senha é cifrada antes de ser gravada e nunca aparece em listagens. Revelar ou
              copiar depois exige permissão própria e fica registrado na auditoria.
            </p>

            {ehSoftware && (
              <div className="space-y-3 border-t pt-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Licença
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo id="fornecedor" rotulo="Fornecedor">
                    <Input
                      id="fornecedor"
                      value={form.fornecedor}
                      onChange={(e) => set("fornecedor", e.target.value)}
                    />
                  </Campo>
                  <Campo id="tipoLicenca" rotulo="Tipo de licença">
                    <Input
                      id="tipoLicenca"
                      value={form.tipoLicenca}
                      onChange={(e) => set("tipoLicenca", e.target.value)}
                      placeholder="Flutuante, nominal..."
                    />
                  </Campo>
                  <Campo id="numeroLicenca" rotulo="Número da licença">
                    <Input
                      id="numeroLicenca"
                      value={form.numeroLicenca}
                      onChange={(e) => set("numeroLicenca", e.target.value)}
                    />
                  </Campo>
                  <Campo id="assentos" rotulo="Assentos">
                    <Input
                      id="assentos"
                      type="number"
                      min={0}
                      value={form.assentos}
                      onChange={(e) => set("assentos", e.target.value)}
                    />
                  </Campo>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="gestao" className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="responsavel" rotulo="Responsável interno">
                <Select
                  value={form.responsavelId}
                  onValueChange={(v) => set("responsavelId", v ?? "")}
                >
                  <SelectTrigger id="responsavel">
                    <SelectValue placeholder="Sem responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.cargo && ` · ${p.cargo}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo id="status" rotulo="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v ?? "ativo")}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_CREDENCIAL.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo id="vencimento" rotulo="Vencimento">
                <Input
                  id="vencimento"
                  type="date"
                  value={form.vencimentoEm}
                  onChange={(e) => set("vencimentoEm", e.target.value)}
                />
              </Campo>
              <Campo id="proximaRevisao" rotulo="Próxima revisão">
                <Input
                  id="proximaRevisao"
                  type="date"
                  value={form.proximaRevisaoEm}
                  onChange={(e) => set("proximaRevisaoEm", e.target.value)}
                />
              </Campo>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.renovacaoAutomatica}
                onCheckedChange={(v) => set("renovacaoAutomatica", Boolean(v))}
              />
              Renovação automática
            </label>

            <Campo id="projetos" rotulo="Projetos associados">
              <select
                id="projetos"
                multiple
                size={5}
                value={projetoIds}
                onChange={(e) =>
                  setProjetoIds(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {opcoes.projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                O projeto apenas referencia este acesso; a credencial continua sendo uma só.
              </p>
            </Campo>

            {!podeGerenciarPermissoes && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Quem pode ver este acesso é definido separadamente, por quem tem a permissão de
                gerenciar compartilhamento.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar || pendente}>
            {pendente ? "Salvando..." : inicial ? "Salvar alterações" : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  id,
  rotulo,
  obrigatorio,
  children,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
