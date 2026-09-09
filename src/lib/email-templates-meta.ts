/**
 * Catálogo dos e-mails do sistema (client-safe, sem `server-only`).
 * Cada tipo define suas variáveis (`{{nome}}`) e o corpo PADRÃO em **Markdown**.
 * O admin pode sobrescrever assunto/corpo por `EmailTemplateVariante` (DB); sem
 * override, usa-se o padrão daqui.
 *
 * Fluxo de render: `{{variavel}}` é substituída pelo valor cru e depois o corpo
 * (Markdown/GFM) é convertido em HTML. O assunto é texto puro (sem Markdown).
 */
export type EmailVariavel = { nome: string; descricao: string; exemplo: string };

export type EmailTemplateMeta = {
  slug: string;
  /** Agrupador visual na lista de categorias. */
  grupo: string;
  label: string;
  descricao: string;
  variaveis: EmailVariavel[];
  assuntoPadrao: string;
  corpoPadrao: string;
};

// ── Alertas de ponto ──────────────────────────────────────────────────────
// Cada tipo de alerta é uma CATEGORIA de e-mail própria: texto totalmente
// editável, com `{{hora}}` (vem da escala do funcionário) e `{{nome}}`
// (primeiro nome, pro tom ficar pessoal — sino/Push usam o MESMO texto).
// A chave espelha modules/ponto/alertas.ts; jobs-handlers roteia por ela.

type PontoAlertaDef = {
  chave: string;
  slug: string;
  label: string;
  assunto: string;
  corpo: string;
  exemploHora: string;
};

const PONTO_ALERTAS: PontoAlertaDef[] = [
  { chave: "entrada:prox", slug: "ponto-entrada-prox", label: "Entrada se aproximando", assunto: "Sua entrada está chegando", corpo: "Oi, {{nome}}! Faltam poucos minutos para o horário previsto da sua entrada, às {{hora}}. Não esqueça de bater o ponto.", exemploHora: "08:00" },
  { chave: "entrada:atingido", slug: "ponto-entrada-atingido", label: "Entrada não registrada", assunto: "Ainda não vimos sua entrada hoje", corpo: "Oi, {{nome}}! Sua entrada estava prevista para {{hora}} e ainda não foi registrada. Se você já chegou, é só bater o ponto no SenaHub.", exemploHora: "08:00" },
  { chave: "descanso_inicio:prox", slug: "ponto-descanso-inicio-prox", label: "Descanso se aproximando", assunto: "Seu descanso está chegando", corpo: "Oi, {{nome}}! Seu horário de descanso começa às {{hora}}. Lembre-se de registrar a saída para o intervalo.", exemploHora: "12:00" },
  { chave: "descanso_inicio:atingido", slug: "ponto-descanso-inicio-atingido", label: "Hora do descanso", assunto: "Hora de fazer seu descanso", corpo: "Oi, {{nome}}! O horário previsto para o início do seu descanso era {{hora}}. Se ainda não bateu, aproveite para registrar agora.", exemploHora: "12:00" },
  { chave: "descanso_fim:prox", slug: "ponto-descanso-fim-prox", label: "Fim do descanso se aproximando", assunto: "Seu descanso está terminando", corpo: "Oi, {{nome}}! Seu retorno do descanso está previsto para {{hora}}. Não esqueça de bater o ponto ao voltar.", exemploHora: "13:00" },
  { chave: "descanso_fim:atingido", slug: "ponto-descanso-fim-atingido", label: "Hora de voltar do descanso", assunto: "Já passou da hora de voltar do descanso", corpo: "Oi, {{nome}}! Seu retorno estava previsto para {{hora}}. Se você já voltou, registre sua entrada no sistema.", exemploHora: "13:00" },
  { chave: "saida:prox", slug: "ponto-saida-prox", label: "Fim da jornada se aproximando", assunto: "Sua jornada está chegando ao fim", corpo: "Oi, {{nome}}! Sua saída está prevista para {{hora}}. Não esqueça de bater o ponto antes de encerrar o dia.", exemploHora: "17:00" },
  { chave: "saida:atingido", slug: "ponto-saida-atingido", label: "Passou do horário de saída", assunto: "Já passou do seu horário de saída", corpo: "Oi, {{nome}}! Sua saída estava prevista para {{hora}} e ainda não foi registrada. Se você já encerrou o expediente, é só bater o ponto.", exemploHora: "17:00" },
  { chave: "jornada_cumprida", slug: "ponto-jornada-cumprida", label: "Jornada cumprida", assunto: "Você completou sua jornada de hoje", corpo: "Oi, {{nome}}! Você já somou {{hora}} de trabalho hoje. Este é só um aviso informativo — não representa cálculo de hora extra.", exemploHora: "8h00" },
];

/** chave do alerta (alertas.ts) → slug da categoria de e-mail. */
const PONTO_ALERTA_SLUG = new Map(PONTO_ALERTAS.map((p) => [p.chave, p.slug]));

export function slugAlertaPonto(chave: string): string | undefined {
  return PONTO_ALERTA_SLUG.get(chave);
}

/** chave do alerta → rótulo legível (usado no resumo diário — nunca a chave crua). */
const PONTO_ALERTA_LABEL = new Map(PONTO_ALERTAS.map((p) => [p.chave, p.label]));

export function labelAlertaPonto(chave: string): string {
  return PONTO_ALERTA_LABEL.get(chave) ?? chave;
}

const HORA_VAR = (exemplo: string): EmailVariavel => ({
  nome: "hora",
  descricao: "Horário previsto (ou duração, na jornada cumprida) — vem da escala do funcionário.",
  exemplo,
});

const NOME_VAR = (exemplo: string): EmailVariavel => ({
  nome: "nome",
  descricao: "Primeiro nome do funcionário.",
  exemplo,
});

const templatesPonto: EmailTemplateMeta[] = PONTO_ALERTAS.map((p) => ({
  slug: p.slug,
  grupo: "Alertas de ponto",
  label: p.label,
  descricao: p.chave.endsWith(":atingido")
    ? "Alerta de ponto. Horário ({{hora}}) e nome ({{nome}}) vêm da escala/cadastro do funcionário. Vai por e-mail na hora pra quem escolheu \"todos\" nas Preferências; sempre entra no resumo diário de quem escolheu essa opção."
    : "Alerta de ponto informativo (sem atraso). Não dispara e-mail avulso — só aparece no sino/Push e, se o usuário escolher, no resumo diário de fim do dia.",
  variaveis: [HORA_VAR(p.exemploHora), NOME_VAR("Maria")],
  assuntoPadrao: p.assunto,
  corpoPadrao: p.corpo,
}));

export const TEMPLATES_CATALOGO: EmailTemplateMeta[] = [
  {
    slug: "aviso-geral",
    grupo: "Comunicados",
    label: "Aviso geral",
    descricao: "Enviado quando um comunicado é direcionado com a opção de e-mail marcada.",
    variaveis: [
      { nome: "titulo", descricao: "Título do aviso", exemplo: "Manutenção no sistema" },
      { nome: "corpo", descricao: "Mensagem do aviso", exemplo: "O sistema ficará indisponível sábado das 8h às 10h." },
    ],
    assuntoPadrao: "SenaHub — {{titulo}}",
    corpoPadrao: `## {{titulo}}

{{corpo}}

_Comunicado do SenaHub — confirme a leitura ao acessar o sistema._`,
  },
  {
    slug: "lembrete-pagamento",
    grupo: "Financeiro & Comercial",
    label: "Lembrete de pagamento (inadimplência)",
    descricao: "Enviado ao cliente quando um recebimento vence e não foi baixado (D+1).",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "descricao", descricao: "Descrição do lançamento", exemplo: "Parcela 2/3 — Projeto Estrutural" },
      { nome: "valor", descricao: "Valor formatado (R$)", exemplo: "R$ 3.500,00" },
      { nome: "vencimento", descricao: "Data de vencimento", exemplo: "05/07/2026" },
    ],
    assuntoPadrao: "Lembrete de pagamento — {{descricao}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Identificamos que o pagamento referente a **{{descricao}}** no valor de **{{valor}}**, com vencimento em {{vencimento}}, ainda não foi registrado.

Caso já tenha efetuado o pagamento, desconsidere este aviso.

Em caso de dúvidas, entre em contato com nossa equipe.`,
  },
  {
    slug: "proposta-cliente",
    grupo: "Financeiro & Comercial",
    label: "Proposta comercial",
    descricao: "Enviado ao cliente com o link público da proposta.",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "numero", descricao: "Número da proposta", exemplo: "2026-042" },
      { nome: "titulo", descricao: "Título da proposta", exemplo: "Projeto Estrutural — Galpão" },
      { nome: "valorTotal", descricao: "Valor total formatado (R$)", exemplo: "R$ 18.000,00" },
      { nome: "url", descricao: "Link público da proposta", exemplo: "https://app/a/proposta/xyz" },
    ],
    assuntoPadrao: "Proposta {{numero}} — {{titulo}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Segue a proposta **{{numero}} — {{titulo}}**, no valor total de **{{valorTotal}}**.

[Clique aqui para visualizar a proposta]({{url}})

Sena Projetos`,
  },
  {
    slug: "projeto-disponivel",
    grupo: "Projetos",
    label: "Projeto disponível (link ao cliente)",
    descricao:
      "Enviado ao cliente pelo modal de link público de arquivos. Avisa que o projeto está disponível. O bloco de acesso ({{blocoAcesso}}) é montado pelo sistema conforme o destinatário: já é usuário → link de login; ainda não é → link público + convite para solicitar cadastro.",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente/destinatário", exemplo: "Construtora Alfa" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      {
        nome: "blocoAcesso",
        descricao:
          "Bloco de acesso gerado automaticamente (login OU link público + vantagens + convite de cadastro). Não editável — varia por destinatário.",
        exemplo:
          "[Ver os arquivos do projeto](https://app/p/arquivos/xyz)\n\nQuer acompanhar tudo pelo sistema? [Solicite seu cadastro](https://app/solicitar-cadastro).",
      },
    ],
    assuntoPadrao: "Seu projeto {{projeto}} está disponível — SenaHub",
    corpoPadrao: `Olá, {{nomeCliente}}.

O projeto **{{projeto}}** está disponível para acompanhamento.

{{blocoAcesso}}

Qualquer dúvida, é só falar com a nossa equipe.

Sena Projetos`,
  },
  {
    slug: "holerite",
    grupo: "RH",
    label: "Holerite",
    descricao: "Envio do holerite mensal ao colaborador CLT/estagiário.",
    variaveis: [
      { nome: "competencia", descricao: "Mês/ano (MM/AAAA)", exemplo: "07/2026" },
      { nome: "nome", descricao: "Nome do colaborador", exemplo: "Maria Souza" },
      { nome: "linhas", descricao: "Linhas da tabela em Markdown (| Descrição | Valor |)", exemplo: "| Salário base | R$ 3.000,00 |\n| INSS | -R$ 300,00 |" },
      { nome: "liquido", descricao: "Líquido formatado", exemplo: "R$ 2.640,00" },
    ],
    assuntoPadrao: "Holerite {{competencia}} — SenaHub",
    corpoPadrao: `## Holerite {{competencia}}

{{nome}}

| Descrição | Valor |
| --- | ---: |
{{linhas}}
| **Líquido** | **{{liquido}}** |`,
  },
  {
    slug: "resumo-semanal",
    grupo: "Gestão",
    label: "Resumo semanal (gestores)",
    descricao: "Segunda de manhã: panorama financeiro e de entregas da semana para admin/supervisor.",
    variaveis: [
      { nome: "corpo", descricao: "Texto do resumo", exemplo: "Semana: 3 entrega(s) com prazo · a receber R$ 12.000 · a pagar R$ 4.000." },
    ],
    assuntoPadrao: "SenaHub — resumo semanal",
    corpoPadrao: `{{corpo}}`,
  },
  {
    slug: "resumo-ponto-diario",
    grupo: "Alertas de ponto",
    label: "Resumo diário de ponto",
    descricao: "1 e-mail no fim do dia com os alertas de ponto acumulados (para quem escolheu resumo diário).",
    variaveis: [
      NOME_VAR("Maria"),
      { nome: "linhas", descricao: "Lista de alertas do dia, já com rótulo legível (Markdown, um item por linha)", exemplo: "- 08:15 — Entrada não registrada\n- 12:40 — Fim do descanso se aproximando" },
      { nome: "batidas", descricao: "Lista das batidas de ponto do dia (Markdown, um item por linha)", exemplo: "- 08:15 — Entrada\n- 12:00 — Início do descanso\n- 13:05 — Fim do descanso\n- 18:02 — Saída" },
    ],
    assuntoPadrao: "Seu resumo de ponto de hoje",
    corpoPadrao: `Oi, {{nome}}! Aqui está um resumo do seu dia.

**Avisos que você recebeu:**

{{linhas}}

**Batidas registradas:**

{{batidas}}

Se algo parecer errado, você pode ajustar o registro em Ponto → Espelho.`,
  },
  ...templatesPonto,
];

export function metaTemplate(slug: string): EmailTemplateMeta | undefined {
  return TEMPLATES_CATALOGO.find((t) => t.slug === slug);
}

/** Valores de exemplo de todas as variáveis (para preview / envio de teste). */
export function exemplosDoTemplate(slug: string): Record<string, string> {
  const meta = metaTemplate(slug);
  if (!meta) return {};
  return Object.fromEntries(meta.variaveis.map((v) => [v.nome, v.exemplo]));
}
