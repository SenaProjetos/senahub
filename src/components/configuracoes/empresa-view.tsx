"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Building2, FileSignature, Upload, X } from "lucide-react";
import { salvarDadosEmpresa } from "@/modules/configuracoes/empresa/actions";
import type { DadosEmpresa } from "@/modules/configuracoes/empresa/queries";
import { camposTermoPendentes } from "@/modules/legal/marcadores-empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Timbrado dos PDFs gerados pelo sistema (hoje: holerite CLT — plano
 * 2026-09-13-folha-clt-import-assinatura.md). Registro único, sem histórico — salvar substitui o
 * anterior por inteiro.
 */
export function EmpresaView({ dados }: { dados: DadosEmpresa | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [razaoSocial, setRazaoSocial] = useState(dados?.razaoSocial ?? "");
  const [cnpj, setCnpj] = useState(dados?.cnpj ?? "");
  const [endereco, setEndereco] = useState(dados?.endereco ?? "");
  const [encarregadoDados, setEncarregadoDados] = useState(dados?.encarregadoDados ?? "");
  const [foro, setForo] = useState(dados?.foro ?? "");
  // Do que está SALVO (é o que o termo mostra agora), não do que está sendo digitado.
  const pendentesTermo = camposTermoPendentes(dados);
  const [logoPath, setLogoPath] = useState<string | null>(dados?.logoPath ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  // Distingue "sem logo" de "tinha logo, arquivo sumiu do storage" — sem isto o timbrado do PDF
  // fica sem logo em silêncio (achado do advisor: STORAGE_BASE_PATH pode divergir entre
  // ambientes, ou alguém limpar a pasta na mão) e ninguém percebe até reclamar.
  const [logoQuebrado, setLogoQuebrado] = useState(false);

  // `?v=` só pra não servir uma versão em cache do navegador depois de trocar o logo desta sessão.
  // Deriva do estado local `logoPath`, não de `dados` — senão "Remover" some e o logo salvo volta.
  const logoAtualSrc =
    logoPreview ?? (logoPath ? `/api/configuracoes/empresa/logo?v=${encodeURIComponent(logoPath)}` : null);

  async function escolherLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "image/png" && f.type !== "image/jpeg") return toast.error("Envie um PNG ou JPG.");
    setEnviandoLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/configuracoes/empresa/logo", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setLogoPath(j.caminho);
        setLogoQuebrado(false);
        setLogoPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(f);
        });
      } else toast.error(j.error ?? "Falha ao enviar a imagem.");
    } finally {
      setEnviandoLogo(false);
    }
  }

  function removerLogo() {
    setLogoPath(null);
    setLogoQuebrado(false);
    setLogoPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  function salvar() {
    if (!razaoSocial.trim()) return toast.error("Informe a razão social.");
    start(async () => {
      const r = await salvarDadosEmpresa({
        razaoSocial: razaoSocial.trim(),
        cnpj: cnpj.trim(),
        endereco: endereco.trim(),
        logoPath: logoPath ?? "",
        encarregadoDados: encarregadoDados.trim(),
        foro: foro.trim(),
      });
      if (r.ok) {
        toast.success("Dados da empresa salvos.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/configuracoes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Dados da empresa</h2>
        <p className="text-sm text-muted-foreground">
          Razão social, CNPJ, endereço e logo usados no timbrado dos PDFs gerados pelo sistema
          (hoje: holerite do funcionário CLT) e na identificação da empresa no Termo de Uso.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" /> Identificação
          </CardTitle>
          <CardDescription>Aparece no cabeçalho de cada PDF gerado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="razao-social">Razão social</Label>
            <Input
              id="razao-social"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Ex.: Sena Estruturas Engenharia Ltda."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-56"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endereco">Endereço</Label>
            <textarea
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro, cidade/UF, CEP"
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            {logoAtualSrc && !logoQuebrado ? (
              <div className="flex items-center gap-3">
                {/* `next/image` não serve aqui: o src é dinâmico (rota /api ou blob do upload
                    recém-feito) — exigiria `remotePatterns` e não otimiza blob nenhum. É uma
                    miniatura de 64px numa tela de configuração, e o `onError` abaixo é o que
                    detecta logo quebrado. Silenciado para o portão do lint ficar limpo: aviso
                    permanente treina a ignorar a saída, e foi assim que um bug real passou. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoAtualSrc}
                  alt="Logo"
                  className="h-16 w-16 rounded-md border object-contain p-1"
                  onError={() => setLogoQuebrado(true)}
                />
                <Button type="button" size="sm" variant="outline" onClick={removerLogo} disabled={enviandoLogo}>
                  <X className="size-3.5" /> Remover
                </Button>
              </div>
            ) : logoAtualSrc && logoQuebrado ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>Tem logo configurado, mas o arquivo não foi encontrado no storage. Envie de novo.</span>
                <Button type="button" size="sm" variant="ghost" onClick={removerLogo} disabled={enviandoLogo}>
                  <X className="size-3.5" /> Limpar
                </Button>
              </div>
            ) : (
              <label className="flex h-16 w-40 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed text-xs text-muted-foreground hover:border-ring hover:text-foreground">
                <Upload className="size-3.5" /> {enviandoLogo ? "Enviando…" : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={escolherLogo}
                  disabled={enviandoLogo}
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">PNG ou JPG, fundo transparente fica melhor no cabeçalho.</p>
          </div>

          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="size-4" /> Termo de Uso
          </CardTitle>
          <CardDescription>
            Razão social, CNPJ e endereço acima, mais os dois dados abaixo, preenchem a
            identificação da empresa no Termo de Uso que colaboradores e clientes aceitam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendentesTermo.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                O Termo de Uso está saindo com campos em branco (aparecem entre colchetes):{" "}
                <strong>{pendentesTermo.join(", ")}</strong>.
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="encarregado-dados">Encarregado de dados (DPO)</Label>
            <Input
              id="encarregado-dados"
              value={encarregadoDados}
              onChange={(e) => setEncarregadoDados(e.target.value)}
              placeholder="Nome e e-mail — ex.: Maria Silva, privacidade@empresa.com.br"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">Contato para o titular exercer os direitos da LGPD.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="foro">Foro (comarca/UF)</Label>
            <Input
              id="foro"
              value={foro}
              onChange={(e) => setForo(e.target.value)}
              placeholder="Ex.: Goiânia/GO"
              maxLength={120}
              className="w-72"
            />
          </div>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
