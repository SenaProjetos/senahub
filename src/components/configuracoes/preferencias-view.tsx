"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Camera, Sun, Moon, Monitor } from "lucide-react";
import { salvarPreferencia, atualizarMeuPerfil } from "@/modules/usuarios/preferencias/actions";
import { PushDispositivoCard } from "@/components/notificacoes/push-ativar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Perfil = {
  name: string;
  email: string;
  image: string | null;
  telefone: string;
  cargo: string | null;
  departamento: string | null;
  dataAdmissao: string | null;
  papel: string;
};

type PontoEmailModo = "todos" | "resumo_diario" | "nenhum";

export function PreferenciasView({
  perfil,
  somChat: somChatInicial,
  mostrarRecibos: recibosInicial,
  notifPrazoDisciplina: notifPrazoDisciplinaInicial,
  notifInadimplencia: notifInadimplenciaInicial,
  notifCertidao: notifCertidaoInicial,
  notifLicitacao: notifLicitacaoInicial,
  notifDigestSemanal: notifDigestSemanalInicial,
  notifRiscoProjeto: notifRiscoProjetoInicial,
  notifLembretePonto: notifLembretePontoInicial,
  notifCoordenacao: notifCoordenacaoInicial,
  notifAprovacaoArquivo: notifAprovacaoArquivoInicial,
  pontoEmailModo: pontoEmailModoInicial,
  mostrarAlertasPonto,
}: {
  perfil: Perfil;
  somChat: boolean;
  mostrarRecibos: boolean;
  notifPrazoDisciplina: boolean;
  notifInadimplencia: boolean;
  notifCertidao: boolean;
  notifLicitacao: boolean;
  notifDigestSemanal: boolean;
  notifRiscoProjeto: boolean;
  notifLembretePonto: boolean;
  notifCoordenacao: boolean;
  notifAprovacaoArquivo: boolean;
  pontoEmailModo: PontoEmailModo;
  /** Alertas de jornada por horário são só p/ CLT/estagiário — controla a seção de e-mail. */
  mostrarAlertasPonto: boolean;
}) {
  const [somChat, setSomChat] = useState(somChatInicial);
  const [mostrarRecibos, setMostrarRecibos] = useState(recibosInicial);
  const [notifPrazoDisciplina, setNotifPrazoDisciplina] = useState(notifPrazoDisciplinaInicial);
  const [notifInadimplencia, setNotifInadimplencia] = useState(notifInadimplenciaInicial);
  const [notifCertidao, setNotifCertidao] = useState(notifCertidaoInicial);
  const [notifLicitacao, setNotifLicitacao] = useState(notifLicitacaoInicial);
  const [notifDigestSemanal, setNotifDigestSemanal] = useState(notifDigestSemanalInicial);
  const [notifRiscoProjeto, setNotifRiscoProjeto] = useState(notifRiscoProjetoInicial);
  const [notifLembretePonto, setNotifLembretePonto] = useState(notifLembretePontoInicial);
  const [notifCoordenacao, setNotifCoordenacao] = useState(notifCoordenacaoInicial);
  const [notifAprovacaoArquivo, setNotifAprovacaoArquivo] = useState(notifAprovacaoArquivoInicial);
  const [pontoEmailModo, setPontoEmailModo] = useState<PontoEmailModo>(pontoEmailModoInicial);
  const [, start] = useTransition();

  function salvar(chave: string, valor: boolean | string) {
    start(async () => {
      const r = await salvarPreferencia({ chave, valor });
      if (r.ok) toast.success("Preferência salva.");
      else toast.error(r.error);
    });
  }

  const opcoesChatItems = [
    {
      chave: "somChat",
      titulo: "Som de notificação do chat",
      descricao: "Tocar um som ao receber novas mensagens.",
      valor: somChat,
      set: setSomChat,
    },
    {
      chave: "mostrarRecibos",
      titulo: "Mostrar recibos de leitura",
      descricao: "Exibir ✓✓ quando suas mensagens forem lidas.",
      valor: mostrarRecibos,
      set: setMostrarRecibos,
    },
  ];

  const opcoesNotifItems = [
    {
      chave: "notif_prazo_disciplina",
      titulo: "Prazos de disciplina",
      descricao: "Alertas D-7/D-3/D-1 para entregas de disciplinas.",
      valor: notifPrazoDisciplina,
      set: setNotifPrazoDisciplina,
    },
    {
      chave: "notif_inadimplencia",
      titulo: "Inadimplência",
      descricao: "Recebíveis vencidos no dia seguinte.",
      valor: notifInadimplencia,
      set: setNotifInadimplencia,
    },
    {
      chave: "notif_certidao",
      titulo: "Certidões vencendo",
      descricao: "Alertas 30/15/7 dias antes do vencimento.",
      valor: notifCertidao,
      set: setNotifCertidao,
    },
    {
      chave: "notif_licitacao",
      titulo: "Prazos de licitação",
      descricao: "Alertas de prazo de proposta 15/7/1 dias.",
      valor: notifLicitacao,
      set: setNotifLicitacao,
    },
    {
      chave: "notif_digest_semanal",
      titulo: "Resumo semanal",
      descricao: "Notificação toda segunda com entregas, a receber e a pagar.",
      valor: notifDigestSemanal,
      set: setNotifDigestSemanal,
    },
    {
      chave: "notif_risco_projeto",
      titulo: "Projetos em atraso",
      descricao: "Alertas semanais sobre projetos com prazo vencido.",
      valor: notifRiscoProjeto,
      set: setNotifRiscoProjeto,
    },
    {
      chave: "notif_lembrete_ponto",
      titulo: "Lembrete de ponto não batido",
      descricao: "Aviso às 09:15 (dias úteis) se você ainda não iniciou a jornada.",
      valor: notifLembretePonto,
      set: setNotifLembretePonto,
    },
    {
      chave: "notif_coordenacao",
      titulo: "Coordenação BIM",
      descricao: "Conversão de modelos IFC e apontamentos de compatibilização.",
      valor: notifCoordenacao,
      set: setNotifCoordenacao,
    },
    {
      chave: "notif_aprovacao_arquivo",
      titulo: "Arquivos para validação",
      descricao: "Aviso quando um novo entregável é enviado e aguarda sua aprovação.",
      valor: notifAprovacaoArquivo,
      set: setNotifAprovacaoArquivo,
    },
  ];

  function renderOpcoes(opcoes: typeof opcoesChatItems) {
    return opcoes.map((o) => (
      <div key={o.chave} className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <Label className="text-sm font-medium">{o.titulo}</Label>
          <p className="text-xs text-muted-foreground">{o.descricao}</p>
        </div>
        <Switch
          checked={o.valor}
          onCheckedChange={(v: boolean) => {
            o.set(v);
            salvar(o.chave, v);
          }}
        />
      </div>
    ));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Preferências</h2>
        <p className="text-sm text-muted-foreground">Ajustes pessoais — salvos na sua conta.</p>
      </div>

      <MeuPerfilCard perfil={perfil} />
      <AparenciaCard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chat</CardTitle>
          <CardDescription>Notificações e recibos de leitura.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">{renderOpcoes(opcoesChatItems)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notificações automáticas</CardTitle>
          <CardDescription>
            Controle quais alertas do sistema você quer receber. Desativar remove do sino e do
            Push — não afeta outros usuários.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">{renderOpcoes(opcoesNotifItems)}</CardContent>
      </Card>

      <PushDispositivoCard />

      {mostrarAlertasPonto && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lembretes de ponto</CardTitle>
            <CardDescription>
              Avisos de entrada, descanso, saída e jornada cumprida aparecem sempre no sino e no
              Push. Escolha só o que recebe também por e-mail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="min-w-0">
                <Label className="text-sm font-medium">E-mail dos alertas de jornada</Label>
                <p className="text-xs text-muted-foreground">
                  Sino e Push continuam ativos independente desta escolha.
                </p>
              </div>
              <Select
                value={pontoEmailModo}
                onValueChange={(v) => {
                  if (!v) return;
                  const modo = v as PontoEmailModo;
                  setPontoEmailModo(modo);
                  salvar("ponto_email_modo", modo);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os alertas</SelectItem>
                  <SelectItem value="resumo_diario">Resumo diário</SelectItem>
                  <SelectItem value="nenhum">Nenhum e-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function iniciais(nome: string): string {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Meu Perfil (porte da versão antiga): foto + nome/telefone editáveis, e-mail bloqueado, ficha RH read-only. */
function MeuPerfilCard({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(perfil.name);
  const [telefone, setTelefone] = useState(perfil.telefone);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [pending, start] = useTransition();
  const sujo = nome.trim() !== perfil.name || (telefone ?? "") !== (perfil.telefone ?? "");

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviandoFoto(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Foto atualizada.");
        router.refresh();
      } else toast.error(j.error ?? "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  function salvar() {
    start(async () => {
      const r = await atualizarMeuPerfil({ name: nome.trim(), telefone });
      if (r.ok) {
        toast.success("Perfil atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const fichaRh: { label: string; valor: string | null }[] = [
    { label: "Função", valor: perfil.papel },
    { label: "Cargo", valor: perfil.cargo },
    { label: "Departamento", valor: perfil.departamento },
    { label: "Admissão", valor: perfil.dataAdmissao },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Meu perfil</CardTitle>
        <CardDescription>Foto, nome e contato. E-mail e dados de RH são geridos pela administração.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {perfil.image && <AvatarImage src={perfil.image} alt={perfil.name} />}
            <AvatarFallback>{iniciais(perfil.name)}</AvatarFallback>
          </Avatar>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={enviarFoto} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={enviandoFoto}>
            <Camera className="size-4" /> {enviandoFoto ? "Enviando…" : "Alterar foto"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="perfil-nome">Nome</Label>
            <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perfil-tel">Telefone</Label>
            <Input id="perfil-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(99) 99999-9999" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perfil-email">E-mail</Label>
            <Input id="perfil-email" value={perfil.email} disabled readOnly />
          </div>
        </div>

        <div className="rounded-sm border bg-muted/30 p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Ficha RH (somente leitura)</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            {fichaRh.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="font-medium">{f.valor ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending || !sujo || !nome.trim()}>
            {pending ? "Salvando…" : "Salvar perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Aparência: tema claro/escuro/sistema (porte da versão antiga). */
function AparenciaCard() {
  const { theme, setTheme } = useTheme();
  const opcoes = [
    { v: "light", label: "Claro", icon: Sun },
    { v: "dark", label: "Escuro", icon: Moon },
    { v: "system", label: "Sistema", icon: Monitor },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Aparência</CardTitle>
        <CardDescription>Tema da interface — salvo neste dispositivo.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => {
            const ativo = (theme ?? "system") === o.v;
            return (
              <Button
                key={o.v}
                type="button"
                variant={ativo ? "secondary" : "outline"}
                size="sm"
                aria-pressed={ativo}
                onClick={() => setTheme(o.v)}
              >
                <o.icon className="size-4" /> {o.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
