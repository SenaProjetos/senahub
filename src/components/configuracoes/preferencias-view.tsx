"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PreferenciasView({
  somChat: somChatInicial,
  mostrarRecibos: recibosInicial,
  notifPrazoDisciplina: notifPrazoDisciplinaInicial,
  notifInadimplencia: notifInadimplenciaInicial,
  notifCertidao: notifCertidaoInicial,
  notifLicitacao: notifLicitacaoInicial,
  notifDigestSemanal: notifDigestSemanalInicial,
  notifRiscoProjeto: notifRiscoProjetoInicial,
}: {
  somChat: boolean;
  mostrarRecibos: boolean;
  notifPrazoDisciplina: boolean;
  notifInadimplencia: boolean;
  notifCertidao: boolean;
  notifLicitacao: boolean;
  notifDigestSemanal: boolean;
  notifRiscoProjeto: boolean;
}) {
  const [somChat, setSomChat] = useState(somChatInicial);
  const [mostrarRecibos, setMostrarRecibos] = useState(recibosInicial);
  const [notifPrazoDisciplina, setNotifPrazoDisciplina] = useState(notifPrazoDisciplinaInicial);
  const [notifInadimplencia, setNotifInadimplencia] = useState(notifInadimplenciaInicial);
  const [notifCertidao, setNotifCertidao] = useState(notifCertidaoInicial);
  const [notifLicitacao, setNotifLicitacao] = useState(notifLicitacaoInicial);
  const [notifDigestSemanal, setNotifDigestSemanal] = useState(notifDigestSemanalInicial);
  const [notifRiscoProjeto, setNotifRiscoProjeto] = useState(notifRiscoProjetoInicial);
  const [, start] = useTransition();

  function salvar(chave: string, valor: boolean) {
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
    </div>
  );
}
