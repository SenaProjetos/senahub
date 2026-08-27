import { escaparHtml } from "@/modules/juridico/contrato/gerar";
import { HASH_GENESE, type ResultadoVerificacao } from "./cadeia";

/**
 * Certificado de conclusão da assinatura — HTML puro, pronto para virar PDF (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase D item 5 / Fase E).
 *
 * É o documento que se apresenta quando a assinatura é questionada: quem assinou, quando, de onde,
 * o hash do arquivo assinado e a cadeia de eventos inteira. Mesmo papel do "Certificado de
 * Conclusão" do Clicksign/DocuSign.
 *
 * Puro de propósito (só monta string): a renderização em PDF reusa `gerarPdfDoHtml`, e manter a
 * montagem separada permite testar o conteúdo — que é o que tem valor probatório — sem Chrome.
 */

export type SignatarioCertificado = {
  nome: string;
  /** "Usuário do sistema" ou "Link externo" — a diferença de força probatória fica explícita. */
  origem: "interno" | "externo";
  /** Identificação declarada (CPF) no caso externo. */
  documento?: string | null;
  assinadoEm: Date;
  ip: string | null;
  userAgent: string | null;
  hashArquivo: string;
};

export type EventoCertificado = {
  sequencia: number;
  tipo: string;
  ocorridoEm: Date;
  atorNome: string;
  ip: string | null;
  hash: string;
};

export type DadosCertificado = {
  documentoTitulo: string;
  versaoNumero: number;
  arquivoNome: string;
  signatarios: SignatarioCertificado[];
  eventos: EventoCertificado[];
  verificacao: ResultadoVerificacao;
  emitidoEm: Date;
};

const TIPO_LABEL: Record<string, string> = {
  visualizado: "Documento visualizado",
  autenticado: "Identidade verificada",
  assinado: "Assinatura registrada",
};

const ORIGEM_LABEL: Record<SignatarioCertificado["origem"], string> = {
  interno: "Usuário autenticado no sistema",
  externo: "Link de assinatura enviado por e-mail",
};

function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Recife", dateStyle: "short", timeStyle: "medium" });
}

export function montarCertificadoHtml(d: DadosCertificado): string {
  const linhasSignatarios = d.signatarios
    .map(
      (s) => `<tr>
      <td><strong>${escaparHtml(s.nome)}</strong>${s.documento ? `<br /><span class="mono">CPF ${escaparHtml(s.documento)}</span>` : ""}</td>
      <td>${escaparHtml(ORIGEM_LABEL[s.origem])}</td>
      <td>${escaparHtml(dataHora(s.assinadoEm))}</td>
      <td class="mono">${escaparHtml(s.ip ?? "—")}</td>
    </tr>`,
    )
    .join("\n");

  const linhasEventos = d.eventos
    .map(
      (e) => `<tr>
      <td class="mono">${e.sequencia}</td>
      <td>${escaparHtml(TIPO_LABEL[e.tipo] ?? e.tipo)}</td>
      <td>${escaparHtml(e.atorNome)}</td>
      <td>${escaparHtml(dataHora(e.ocorridoEm))}</td>
      <td class="mono">${escaparHtml(e.ip ?? "—")}</td>
      <td class="mono hash">${escaparHtml(e.hash.slice(0, 16))}…</td>
    </tr>`,
    )
    .join("\n");

  // A verificação vai NO documento, não só na tela: um certificado que afirma integridade sem
  // dizer se conferiu não prova nada. Se a cadeia estiver quebrada, o certificado diz onde.
  const verificacao = d.verificacao.integra
    ? `<p class="ok">✓ Cadeia de eventos íntegra — os ${d.eventos.length} registros conferem entre si.</p>`
    : `<p class="falha">✗ Cadeia inconsistente no evento ${d.verificacao.sequencia} (${d.verificacao.motivo}).
       Este certificado registra a inconsistência em vez de omiti-la.</p>`;

  const userAgents = d.signatarios
    .filter((s) => s.userAgent)
    .map((s) => `<li><strong>${escaparHtml(s.nome)}:</strong> <span class="mono">${escaparHtml(s.userAgent!)}</span></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Certificado de conclusão — ${escaparHtml(d.documentoTitulo)}</title>
<style>
  @page { size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; line-height: 1.5; }
  h1 { font-size: 13pt; margin: 0 0 4px; }
  h2 { font-size: 10.5pt; margin: 20px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .sub { color: #555; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f2f2f2; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; }
  .mono { font-family: "Courier New", monospace; font-size: 8.5pt; }
  .hash { color: #555; }
  .ok { color: #14532d; background: #dcfce7; padding: 8px; border-radius: 3px; }
  .falha { color: #7f1d1d; background: #fee2e2; padding: 8px; border-radius: 3px; }
  .nota { color: #555; font-size: 8.5pt; margin-top: 18px; border-top: 1px solid #ddd; padding-top: 8px; }
  ul { margin: 4px 0; padding-left: 18px; }
</style>
</head>
<body>
<h1>Certificado de conclusão de assinatura eletrônica</h1>
<p class="sub">
  ${escaparHtml(d.documentoTitulo)} · versão ${d.versaoNumero} · arquivo ${escaparHtml(d.arquivoNome)}<br />
  Emitido em ${escaparHtml(dataHora(d.emitidoEm))} (horário de Recife)
</p>

<h2>Signatários</h2>
<table>
  <thead><tr><th>Nome</th><th>Forma de identificação</th><th>Assinado em</th><th>IP</th></tr></thead>
  <tbody>${linhasSignatarios || `<tr><td colspan="4">Nenhuma assinatura registrada.</td></tr>`}</tbody>
</table>

<h2>Integridade do documento</h2>
<p>Hash SHA-256 do arquivo no momento da assinatura:</p>
<p class="mono">${escaparHtml(d.signatarios[0]?.hashArquivo ?? "—")}</p>
${verificacao}

<h2>Trilha de eventos</h2>
<table>
  <thead><tr><th>#</th><th>Evento</th><th>Autor</th><th>Data/hora</th><th>IP</th><th>Hash</th></tr></thead>
  <tbody>${linhasEventos || `<tr><td colspan="6">Nenhum evento registrado.</td></tr>`}</tbody>
</table>

${userAgents ? `<h2>Dispositivos</h2><ul>${userAgents}</ul>` : ""}

<div class="nota">
  <p><strong>Validade jurídica.</strong> Assinatura eletrônica não baseada em certificado ICP-Brasil,
  válida entre as partes na forma do art. 10, §2º da MP nº 2.200-2/2001, com autoria e integridade
  comprovadas pelos elementos acima (Código Civil art. 219; CPC art. 411, III; Lei nº 12.965/2014).</p>
  <p><strong>Sobre a cadeia de hash.</strong> Cada evento incorpora o hash do anterior, de modo que a
  alteração de um registro invalida todos os seguintes. Isso permite DETECTAR adulteração pontual;
  não torna o registro inalterável por quem tenha acesso irrestrito ao banco de dados.</p>
  <p class="mono">Origem da cadeia: ${HASH_GENESE.slice(0, 16)}…</p>
</div>
</body>
</html>`;
}
