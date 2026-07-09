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
// editável, com apenas `{{hora}}` variável (vem da escala do funcionário).
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
  { chave: "entrada:prox", slug: "ponto-entrada-prox", label: "Entrada se aproximando", assunto: "Hora de bater o ponto", corpo: "Sua entrada está prevista para {{hora}}.", exemploHora: "08:00" },
  { chave: "entrada:atingido", slug: "ponto-entrada-atingido", label: "Entrada não registrada", assunto: "Você ainda não bateu a entrada", corpo: "Horário previsto: {{hora}}.", exemploHora: "08:00" },
  { chave: "descanso_inicio:prox", slug: "ponto-descanso-inicio-prox", label: "Descanso se aproximando", assunto: "Descanso se aproximando", corpo: "Seu descanso está previsto para começar às {{hora}}.", exemploHora: "12:00" },
  { chave: "descanso_inicio:atingido", slug: "ponto-descanso-inicio-atingido", label: "Hora do descanso", assunto: "Hora do descanso", corpo: "Horário previsto: {{hora}}.", exemploHora: "12:00" },
  { chave: "descanso_fim:prox", slug: "ponto-descanso-fim-prox", label: "Fim do descanso se aproximando", assunto: "Fim do descanso se aproximando", corpo: "Previsão de retorno: {{hora}}.", exemploHora: "13:00" },
  { chave: "descanso_fim:atingido", slug: "ponto-descanso-fim-atingido", label: "Hora de voltar do descanso", assunto: "Hora de voltar do descanso", corpo: "Horário previsto: {{hora}}.", exemploHora: "13:00" },
  { chave: "saida:prox", slug: "ponto-saida-prox", label: "Fim da jornada se aproximando", assunto: "Fim da jornada se aproximando", corpo: "Sua saída está prevista para {{hora}}.", exemploHora: "17:00" },
  { chave: "saida:atingido", slug: "ponto-saida-atingido", label: "Passou do horário de saída", assunto: "Já passou do horário de saída", corpo: "Horário previsto: {{hora}}.", exemploHora: "17:00" },
  { chave: "jornada_cumprida", slug: "ponto-jornada-cumprida", label: "Jornada cumprida", assunto: "Jornada do dia cumprida", corpo: "Você completou {{hora}} hoje. Aviso informativo — não é cálculo de hora extra.", exemploHora: "8h00" },
];

/** chave do alerta (alertas.ts) → slug da categoria de e-mail. */
const PONTO_ALERTA_SLUG = new Map(PONTO_ALERTAS.map((p) => [p.chave, p.slug]));

export function slugAlertaPonto(chave: string): string | undefined {
  return PONTO_ALERTA_SLUG.get(chave);
}

const HORA_VAR = (exemplo: string): EmailVariavel => ({
  nome: "hora",
  descricao: "Horário previsto (ou duração, na jornada cumprida) — vem da escala do funcionário.",
  exemplo,
});

const templatesPonto: EmailTemplateMeta[] = PONTO_ALERTAS.map((p) => ({
  slug: p.slug,
  grupo: "Alertas de ponto",
  label: p.label,
  descricao: "Alerta de ponto por e-mail. Só o horário ({{hora}}) varia — vem da escala do funcionário.",
  variaveis: [HORA_VAR(p.exemploHora)],
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
      { nome: "linhas", descricao: "Lista de alertas do dia (Markdown, um item por linha)", exemplo: "- 08:15 — atraso_entrada\n- 12:40 — intervalo_curto" },
    ],
    assuntoPadrao: "Resumo dos alertas de ponto de hoje",
    corpoPadrao: `Alertas de jornada de hoje:

{{linhas}}`,
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
