"use client";

import { Download, Eye, FileText, ShieldCheck } from "lucide-react";
import type { CertidaoPublica } from "@/modules/certidoes/link-publico";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";

function badgeStatus(status: CertidaoPublica["status"]) {
  if (status === "vencida") return <Badge variant="outline" className="text-destructive border-destructive/40">vencida</Badge>;
  if (status === "vence_em_breve") return <Badge variant="outline" className="text-warning border-warning/40">vence em breve</Badge>;
  return <Badge variant="outline" className="text-success border-success/40">ok</Badge>;
}

export function CertidoesPublicoView({ token, certidoes }: { token: string; certidoes: CertidaoPublica[] }) {
  const comArquivo = certidoes.filter((c) => c.arquivoNome);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <CabecalhoPublico
        icone={ShieldCheck}
        rotulo="Regularidade da empresa"
        titulo="Certidões"
        descricao={`${certidoes.length} ${certidoes.length === 1 ? "certidão disponível" : "certidões disponíveis"} para visualização e download.`}
        acoes={
          comArquivo.length > 0 && (
            <Button render={<a href={`/api/p/certidoes/${token}/zip`} rel="noopener" />}>
              <Download className="size-4" /> Baixar tudo (.zip)
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="divide-y p-2">
          {certidoes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-sm px-2 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{c.tipo}</span>
              {c.descricao && <span className="text-muted-foreground">{c.descricao}</span>}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{formatarData(c.validade)}</span>
              {badgeStatus(c.status)}
              {c.arquivoNome ? (
                <>
                  <a
                    href={`/api/p/certidoes/${token}/${c.id}?disposition=inline`}
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 text-primary hover:text-primary/80"
                    title="Visualizar"
                    aria-label={`Visualizar ${c.tipo}`}
                  >
                    <Eye className="size-4" />
                  </a>
                  <a
                    href={`/api/p/certidoes/${token}/${c.id}`}
                    className="shrink-0 text-primary hover:text-primary/80"
                    title="Baixar"
                    aria-label={`Baixar ${c.tipo}`}
                  >
                    <Download className="size-4" />
                  </a>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">sem arquivo</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">Acesso somente leitura.</p>
    </main>
  );
}
