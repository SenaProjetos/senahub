"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, ExternalLink, Lock, Star, ShieldAlert, Pencil, CheckCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoricoCredencial } from "./historico-credencial";
import { CredencialDialog } from "./credencial-dialog";
import type { OpcoesFormulario } from "@/modules/acessos/queries";
import { formatarData, formatarDataHora } from "@/lib/utils";
import {
  obterDetalheCredencial,
  revelarCredencial,
  copiarCredencial,
  alternarFavorito,
  marcarComoRevisada,
} from "@/modules/acessos/actions";
import {
  iconeDaCategoria,
  estadoLabel,
  STATUS_LABEL,
  STATUS_TONE,
  TIPO_ALVO_LABEL,
} from "@/modules/acessos/labels";
import type { DetalheCredencial } from "@/modules/acessos/queries";

type Detalhe = DetalheCredencial;

/** Quanto tempo a senha fica visível antes de se esconder sozinha (§25). */
const SEGUNDOS_VISIVEL = 30;

/**
 * Drawer de detalhes (§21–§33). Lateral direito, ~480px, com a seção de credenciais destacada.
 *
 * A senha NUNCA vem junto do detalhe: `obterDetalheCredencial` não a devolve, e revelar é uma
 * segunda chamada, auditada, que só acontece se a pessoa clicar (§24: "NUNCA revelar
 * automaticamente").
 */
export function AcessoDrawer({
  credencialId,
  onFechar,
  podeRevelar,
  opcoesForm,
}: {
  credencialId: string | null;
  onFechar: () => void;
  podeRevelar: boolean;
  opcoesForm: OpcoesFormulario;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!credencialId) {
      setDetalhe(null);
      setErro(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    obterDetalheCredencial({ id: credencialId })
      .then((r) => {
        if (cancelado) return;
        if (r.ok) setDetalhe(r.data);
        else setErro(r.error);
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [credencialId]);

  return (
    <Sheet open={!!credencialId} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent
        // As classes repetem `data-[side=right]:` de propósito: o componente base define
        // `w-3/4` + `sm:max-w-sm` (384px) nesse seletor, e uma classe sem ele não conflita
        // para o tailwind-merge — ficava 293px no celular e 384px no desktop, medido.
        // §59 pede a tela quase toda no mobile; §21 pede 420-560px no desktop.
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
      >
        {carregando && <EsqueletoDetalhe />}

        {erro && !carregando && (
          <div className="space-y-3 py-8 text-center">
            <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Não foi possível abrir este acesso</p>
            <p className="text-xs text-muted-foreground">{erro}</p>
          </div>
        )}

        {detalhe && !carregando && (
          <Conteudo
            detalhe={detalhe}
            podeRevelar={podeRevelar}
            opcoesForm={opcoesForm}
            onAtualizar={setDetalhe}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({
  detalhe,
  podeRevelar,
  opcoesForm,
  onAtualizar,
}: {
  detalhe: Detalhe;
  podeRevelar: boolean;
  opcoesForm: OpcoesFormulario;
  onAtualizar: (d: Detalhe) => void;
}) {
  const { credencial: c, permissoes, favorita } = detalhe;
  const Icone = iconeDaCategoria(c.categoria.nome);
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);

  return (
    <>
      <SheetHeader className="space-y-2">
        {/* `pr-10` reserva a coluna do botão de fechar, que o SheetContent posiciona no canto
            superior direito. Sem isso, título longo passa por baixo dele. */}
        <div className="flex items-start gap-2 pr-10">
          <Icone className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <SheetTitle className="text-lg leading-tight">
              {c.nome}
              {c.estado && c.estado !== "NA" && ` — ${estadoLabel(c.estado)}`}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {c.categoria.nome}
              {c.nomeCompleto && ` • ${c.nomeCompleto}`}
            </p>
          </div>
        </div>

        {/* Status/tags à esquerda, favoritar à direita.
            O favoritar saiu do canto superior: lá ele encostava no X de fechar, e duas ações
            de significado oposto (uma marca, a outra descarta) a poucos pixels convidam ao
            clique errado. O canto superior direito é do chrome do drawer; ação sobre o
            registro pertence à área de conteúdo. Ganhou rótulo junto: ícone sozinho não diz
            se a estrela é estado atual ou ação, e o texto também dá alvo de toque maior. */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATUS_TONE[c.statusExibido]}>{STATUS_LABEL[c.statusExibido]}</StatusBadge>
          {c.tags.map((t) => (
            <Badge key={t.tag} variant="outline" className="font-normal">
              {t.tag}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 shrink-0 px-2 text-xs"
            aria-pressed={favorita}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await alternarFavorito({ id: c.id, favorito: !favorita });
                if (r.ok) onAtualizar({ ...detalhe, favorita: !favorita });
                else toast.error(r.error);
              })
            }
          >
            <Star
              className={favorita ? "size-3.5 fill-warning text-warning" : "size-3.5"}
              aria-hidden
            />
            {favorita ? "Favorito" : "Favoritar"}
          </Button>
        </div>

        {/* §22/§44 — ações do registro. Só aparecem para quem `permissoesNaCredencial` autoriza
            NAQUELE registro; o servidor confere de novo, esconder botão não é segurança (§51). */}
        {permissoes.editar && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={pendente}
              // §44 — "revisada" NÃO é trocar a senha: é declarar que o portal ainda funciona,
              // o usuário está certo e o responsável está atualizado.
              title="Confirma que o portal, o usuário e o responsável seguem válidos"
              onClick={() =>
                iniciar(async () => {
                  const r = await marcarComoRevisada({ id: c.id });
                  if (r.ok) {
                    toast.success("Credencial marcada como revisada.");
                    onAtualizar({
                      ...detalhe,
                      credencial: { ...c, ultimaRevisaoEm: r.data.revisadaEm },
                    });
                  } else toast.error(r.error);
                })
              }
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Marcar como revisada
            </Button>
          </div>
        )}
      </SheetHeader>

      {editando && (
        <CredencialDialog
          aberto
          onFechar={() => setEditando(false)}
          opcoes={opcoesForm}
          podeGerenciarPermissoes={permissoes.gerenciarPermissoes}
          inicial={{
            id: c.id,
            nome: c.nome,
            nomeCompleto: c.nomeCompleto,
            categoriaId: c.categoria.id,
            estado: c.estado,
            descricao: c.descricao,
            url: c.url,
            responsavelId: c.responsavel?.id ?? null,
            status: c.status,
            vencimentoEm: c.vencimentoEm,
            proximaRevisaoEm: c.proximaRevisaoEm,
            renovacaoAutomatica: c.renovacaoAutomatica,
            fornecedor: c.fornecedor,
            tipoLicenca: c.tipoLicenca,
            numeroLicenca: c.numeroLicenca,
            assentos: c.assentos,
            tags: c.tags,
            projetos: c.projetos,
          }}
        />
      )}

      {/* §72 — abas só porque o conteúdo justifica: o histórico é longo e de outra natureza,
          e empilhá-lo abaixo do cadastro faria rolar a ficha inteira para chegar nele. */}
      <Tabs defaultValue="geral" className="px-4 pb-6">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="geral" className="flex-1">
            Geral
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historico">
          <HistoricoCredencial credencialId={c.id} />
        </TabsContent>

        <TabsContent value="geral" className="space-y-5">
        {/* §23 — identificação */}
        <Secao titulo="Identificação">
          <Campo rotulo="Responsável interno">
            {c.responsavel ? (
              <span className="flex items-center gap-2">
                <AvatarUsuario nome={c.responsavel.name} image={c.responsavel.image} className="size-6" />
                <span>
                  <span className="block text-sm">{c.responsavel.name}</span>
                  {c.responsavel.cargo && (
                    <span className="block text-xs text-muted-foreground">{c.responsavel.cargo}</span>
                  )}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Não definido</span>
            )}
          </Campo>
          {c.url && (
            <Campo rotulo="Portal">
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {dominioDe(c.url)}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Campo>
          )}
          {c.descricao && (
            <Campo rotulo="Observações">
              <p className="whitespace-pre-line text-sm">{c.descricao}</p>
            </Campo>
          )}
        </Secao>

        <Separator />

        {/* §24–§26 — credenciais */}
        <SecaoCredenciais
          credencialId={c.id}
          podeVerCredencial={permissoes.verCredencial && podeRevelar}
        />

        {/* §36/§74 — licença, só quando há dado */}
        {(c.fornecedor || c.tipoLicenca || c.assentos != null || c.dataRenovacao) && (
          <>
            <Separator />
            <Secao titulo="Licença">
              {c.fornecedor && <Campo rotulo="Fornecedor">{c.fornecedor}</Campo>}
              {c.tipoLicenca && <Campo rotulo="Tipo de licença">{c.tipoLicenca}</Campo>}
              {c.assentos != null && <Campo rotulo="Assentos">{c.assentos}</Campo>}
              {c.numeroLicenca && <Campo rotulo="Número">{c.numeroLicenca}</Campo>}
              <Campo rotulo="Renovação automática">{c.renovacaoAutomatica ? "Sim" : "Não"}</Campo>
            </Secao>
          </>
        )}

        <Separator />

        {/* §32 — metadados + §44 — revisão */}
        <Secao titulo="Validade e revisão">
          <Campo rotulo="Vencimento">
            {c.vencimentoEm ? formatarData(c.vencimentoEm) : "—"}
          </Campo>
          <Campo rotulo="Última revisão">
            {c.ultimaRevisaoEm ? formatarDataHora(c.ultimaRevisaoEm) : "Nunca revisada"}
          </Campo>
          <Campo rotulo="Próxima revisão">
            {c.proximaRevisaoEm ? formatarData(c.proximaRevisaoEm) : "—"}
          </Campo>
        </Secao>

        {/* §18/§29 — compartilhamento */}
        {permissoes.gerenciarPermissoes && c.compartilhamentos.length > 0 && (
          <>
            <Separator />
            <Secao titulo="Compartilhamento">
              <ul className="space-y-1">
                {c.compartilhamentos.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {TIPO_ALVO_LABEL[s.tipoAlvo] ?? s.tipoAlvo}
                    </span>
                    <span className="flex gap-1">
                      {s.podeVerCadastro && (
                        <Badge variant="outline" className="font-normal">
                          Cadastro
                        </Badge>
                      )}
                      {s.podeVerCredencial && (
                        <Badge variant="outline" className="font-normal">
                          Credencial
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Secao>
          </>
        )}

        {/* §38 — projetos associados */}
        {c.projetos.length > 0 && (
          <>
            <Separator />
            <Secao titulo="Projetos associados">
              <ul className="space-y-1 text-sm">
                {c.projetos.map((p) => (
                  <li key={p.projeto.id}>
                    <span className="tabular-nums text-muted-foreground">{p.projeto.codigo}</span>{" "}
                    {p.projeto.nome}
                  </li>
                ))}
              </ul>
            </Secao>
          </>
        )}

        <Separator />

        <Secao titulo="Registro">
          <Campo rotulo="Criado por">
            {c.criadoPor?.name ?? "—"} · {formatarDataHora(c.criadoEm)}
          </Campo>
          <Campo rotulo="Última alteração">
            {c.atualizadoPor?.name ?? "—"} · {formatarDataHora(c.atualizadoEm)}
          </Campo>
        </Secao>
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * §24–§26, §85 — bloco de credenciais.
 *
 * Quem não pode revelar vê a explicação, não um botão morto (§85: "Não mostrar botão
 * falso/desabilitado sem explicação").
 */
function SecaoCredenciais({
  credencialId,
  podeVerCredencial,
}: {
  credencialId: string;
  podeVerCredencial: boolean;
}) {
  const [revelado, setRevelado] = useState<{ usuario: string | null; senha: string | null } | null>(null);
  const [pendente, iniciar] = useTransition();

  // §25 — some sozinha depois de um tempo; não fica exposta na tela indefinidamente.
  useEffect(() => {
    if (!revelado) return;
    const t = setTimeout(() => setRevelado(null), SEGUNDOS_VISIVEL * 1000);
    return () => clearTimeout(t);
  }, [revelado]);

  // Trocar de credencial no drawer não pode manter a senha anterior visível.
  useEffect(() => setRevelado(null), [credencialId]);

  if (!podeVerCredencial) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4" aria-hidden />
          Credencial restrita
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Você pode visualizar este cadastro, mas não possui permissão para revelar as credenciais.
        </p>
      </div>
    );
  }

  async function copiar(campo: "usuario" | "senha") {
    const r = await copiarCredencial({ id: credencialId, campo });
    if (!r.ok) return toast.error(r.error);
    if (!r.data.valor) return toast.error("Este acesso não tem esse campo preenchido.");
    try {
      await navigator.clipboard.writeText(r.data.valor);
      toast.success("Credencial copiada.");
    } catch {
      toast.error("O navegador bloqueou a cópia. Revele e copie manualmente.");
    }
  }

  return (
    <section className="rounded-md border bg-muted/30 p-3">
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Credenciais
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Usuário</p>
          <div className="flex items-center justify-between gap-2">
            <code className="min-w-0 truncate text-sm">
              {revelado?.usuario ?? "••••••••••••"}
            </code>
            <Button variant="ghost" size="sm" onClick={() => copiar("usuario")} aria-label="Copiar usuário">
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Senha</p>
          <div className="flex items-center justify-between gap-2">
            <code className="min-w-0 truncate text-sm">{revelado?.senha ?? "••••••••••••"}</code>
            <span className="flex shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={pendente}
                aria-label={revelado ? "Ocultar credencial" : "Visualizar credencial"}
                // §61 — o aviso é parte da ação, não letra miúda.
                title="Esta ação será registrada no histórico de auditoria."
                onClick={() => {
                  if (revelado) return setRevelado(null);
                  iniciar(async () => {
                    const r = await revelarCredencial({ id: credencialId });
                    if (r.ok) setRevelado(r.data);
                    else toast.error(r.error);
                  });
                }}
              >
                {revelado ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => copiar("senha")} aria-label="Copiar senha">
                <Copy className="size-4" aria-hidden />
              </Button>
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Revelar e copiar credenciais são ações registradas no histórico de auditoria.
        {revelado && ` A senha se oculta sozinha em ${SEGUNDOS_VISIVEL}s.`}
      </p>
    </section>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {titulo}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-2 gap-y-0.5 text-sm sm:grid-cols-[9rem_1fr] sm:gap-y-2">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <div>{children}</div>
    </div>
  );
}

function EsqueletoDetalhe() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** Só o domínio na tela (§23), mas o href continua a URL completa. */
function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
