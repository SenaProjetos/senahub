"use client";

import { FileText, FileWarning, Download, Upload, Gavel } from "lucide-react";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { PreviewPdfButton } from "@/components/pdf/preview-pdf-button";
import { statusCertidao, textoValidade, type StatusCertidao } from "@/modules/certidoes/service";
import type { Certidao } from "@/components/certidoes/tipos";

const SITUACAO_TONE: Record<StatusCertidao, "success" | "warning" | "danger"> = {
  vencida: "danger",
  vence_em_breve: "warning",
  ok: "success",
};
const SITUACAO_LABEL: Record<StatusCertidao, string> = {
  vencida: "Vencida",
  vence_em_breve: "Vence em breve",
  ok: "OK",
};

/**
 * §11 — detalhe da certidão em drawer lateral (o padrão do SENAHub para inspeção sem sair da
 * lista). Reaproveita o `Sheet` que já servia de "Histórico e detalhes".
 *
 * As VERSÕES vivem aqui (§11): saíram da coluna permanente da tabela, que gastava largura numa
 * informação consultada raramente.
 *
 * Não usa o `<Timeline>` de `components/ui` apesar do formato parecido: aquele componente renderiza
 * `descricao` como texto puro e não tem lugar para ação por item — trocar por ele custaria o
 * visualizar/baixar de cada versão, que já existe hoje.
 */
export function CertidaoDrawer({
  certidao,
  podeGerir,
  onClose,
  onAtualizar,
}: {
  certidao: Certidao | null;
  podeGerir: boolean;
  onClose: () => void;
  onAtualizar: (c: Certidao) => void;
}) {
  return (
    <Sheet open={!!certidao} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {certidao && <Conteudo certidao={certidao} podeGerir={podeGerir} onAtualizar={onAtualizar} />}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({
  certidao: c,
  podeGerir,
  onAtualizar,
}: {
  certidao: Certidao;
  podeGerir: boolean;
  onAtualizar: (c: Certidao) => void;
}) {
  const situacao = statusCertidao(c.validade);
  const validade = textoValidade(c.validade);
  const temArquivo = !!c.arquivoNome;
  const ehPdf = temArquivo && c.arquivoNome!.toLowerCase().endsWith(".pdf");
  // A versão mais recente com arquivo é a que originou o arquivo "atual" da certidão.
  const versaoAtual = c.versoes.find((v) => !!v.arquivoNome) ?? null;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6">{c.tipo}</SheetTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={SITUACAO_TONE[situacao]}>{SITUACAO_LABEL[situacao]}</StatusBadge>
          {c.obrigatoria && (
            <Badge variant="outline" className="font-normal">
              Obrigatória
            </Badge>
          )}
        </div>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        <section>
          <Titulo>Informações</Titulo>
          <dl className="space-y-1.5 text-sm">
            <Linha rotulo="Tipo" valor={c.tipo} />
            <Linha
              rotulo="Responsável"
              valor={c.responsavelNome ?? "Sem responsável"}
              atenuado={!c.responsavelNome}
            />
            <Linha
              rotulo="Validade"
              valor={
                <span>
                  <span className={cn("font-medium", validade.tom === "danger" && "text-destructive", validade.tom === "warning" && "text-warning")}>
                    {validade.texto}
                  </span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    ({formatarData(c.validade)})
                  </span>
                </span>
              }
            />
            {c.descricao && <Linha rotulo="Observação" valor={c.descricao} />}
            <Linha
              rotulo="Versões"
              valor={c.versoes.length === 0 ? "Nenhuma" : `${c.versoes.length}`}
              atenuado={c.versoes.length === 0}
            />
          </dl>
        </section>

        {/* §11 — bloco de documento, com CTA próprio quando não há arquivo. */}
        <section>
          <Titulo>Documento</Titulo>
          {temArquivo ? (
            <div className="space-y-2 rounded-sm border p-3">
              <p className="flex items-start gap-2 text-sm">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all">{c.arquivoNome}</span>
              </p>
              {versaoAtual && (
                <p className="text-xs text-muted-foreground">
                  Enviado em {formatarDataHora(versaoAtual.data)}
                  {versaoAtual.autor && <> por {versaoAtual.autor}</>}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {ehPdf && (
                  <PreviewPdfButton
                    url={`/api/certidoes/${c.id}/download?inline=1`}
                    titulo={c.tipo}
                    visivel
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  render={<a href={`/api/certidoes/${c.id}/download`} rel="noopener" />}
                >
                  <Download className="size-3.5" aria-hidden /> Baixar
                </Button>
                {podeGerir && (
                  <Button size="sm" variant="ghost" onClick={() => onAtualizar(c)}>
                    <Upload className="size-3.5" aria-hidden /> Nova versão
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-sm border border-dashed p-3">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <FileWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                Esta certidão ainda não possui documento anexado.
              </p>
              {podeGerir && (
                <Button size="sm" onClick={() => onAtualizar(c)}>
                  <Upload className="size-3.5" aria-hidden /> Adicionar documento
                </Button>
              )}
            </div>
          )}
        </section>

        <section>
          <Titulo>Histórico de versões</Titulo>
          {c.versoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
          ) : (
            <ul className="space-y-1.5">
              {c.versoes.map((v) => {
                const versaoEhPdf =
                  v.mimeType === "application/pdf" ||
                  (!!v.arquivoNome && v.arquivoNome.toLowerCase().endsWith(".pdf"));
                return (
                  <li key={v.id} className="flex items-start gap-2 rounded-sm border p-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">Versão {v.numero}</span>
                      <span className="block text-xs text-muted-foreground">
                        Validade {formatarData(v.validade)} · enviada {formatarDataHora(v.data)}
                        {v.autor && <> por {v.autor}</>}
                      </span>
                    </span>
                    {v.arquivoNome && (
                      <span className="flex shrink-0 items-center gap-1">
                        <PreviewPdfButton
                          url={`/api/certidoes/versoes/${v.id}/download?inline=1`}
                          titulo={`${c.tipo} — v${v.numero}`}
                          visivel={versaoEhPdf}
                        />
                        <a
                          href={`/api/certidoes/versoes/${v.id}/download`}
                          className="px-1 text-primary hover:text-primary/80"
                          title="Baixar esta versão"
                          aria-label={`Baixar versão ${v.numero}`}
                        >
                          <Download className="size-4" aria-hidden />
                        </a>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {c.licitacoes.length > 0 && (
          <section>
            <Titulo>Licitações que exigem esta certidão</Titulo>
            <ul className="space-y-1">
              {c.licitacoes.map((l) => (
                <li key={`${l.licitacaoId}-${l.exigencia}`} className="flex items-center gap-2 text-sm">
                  <Gavel className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{l.titulo}</span>
                  <StatusBadge tone={l.atendido ? "success" : "warning"}>
                    {l.atendido ? "atendido" : "pendente"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <Titulo>Auditoria</Titulo>
          {c.auditoria.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
          ) : (
            <ul className="space-y-1.5">
              {c.auditoria.map((a) => (
                <li key={a.id} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{a.acao}</span>
                  {a.usuario && <> — {a.usuario}</>} · {formatarDataHora(a.data)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h3>
  );
}

function Linha({
  rotulo,
  valor,
  atenuado = false,
}: {
  rotulo: string;
  valor: React.ReactNode;
  atenuado?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("min-w-0 flex-1", atenuado && "text-muted-foreground")}>{valor}</dd>
    </div>
  );
}
