/**
 * Listas-modelo de entrada e saída (decisão F4: o sistema monta a lista, o RH ajusta; dono e
 * prazo partem dos exemplos aprovados). A seed cria cada uma UMA vez, pelo nome; depois quem
 * manda é a tela de /rh/admin — corrigir aqui não muda o que já está no banco.
 *
 * Prazo em dias corridos a partir da âncora: início do vínculo (entrada) ou último dia (saída).
 */
import type { Publico, Responsavel, TipoCiclo } from "./regras";

export type ItemModelo = { descricao: string; responsavel: Responsavel; prazoDias: number | null; patrimonio?: boolean };
export type ModeloPadrao = { nome: string; tipo: TipoCiclo; publico: Publico; itens: ItemModelo[] };

export const MODELOS_CICLO_PADRAO: ModeloPadrao[] = [
  {
    nome: "Entrada — CLT e estágio",
    tipo: "entrada",
    publico: "clt_estagio",
    itens: [
      { descricao: "Criar e-mail e acesso ao SenaHub", responsavel: "ti", prazoDias: -1 },
      { descricao: "Preparar máquina, softwares (CAD/BIM) e acesso às pastas", responsavel: "ti", prazoDias: -1 },
      { descricao: "Entregar notebook e equipamentos (registrar no Patrimônio)", responsavel: "ti", prazoDias: 0, patrimonio: true },
      { descricao: "Coletar documentos de admissão e ASO admissional", responsavel: "rh", prazoDias: 0 },
      { descricao: "Assinar contrato de trabalho ou termo de estágio", responsavel: "rh", prazoDias: 0 },
      { descricao: "Conferir escala e jornada no SenaHub", responsavel: "rh", prazoDias: 0 },
      { descricao: "Aceitar os termos de uso no primeiro acesso", responsavel: "pessoa", prazoDias: 1 },
      { descricao: "Apresentar a equipe e os projetos ativos", responsavel: "lider", prazoDias: 5 },
      { descricao: "Treinamento nos padrões de projeto da empresa", responsavel: "lider", prazoDias: 10 },
      { descricao: "Conferir o primeiro mês de ponto", responsavel: "rh", prazoDias: 30 },
    ],
  },
  {
    nome: "Entrada — PJ",
    tipo: "entrada",
    publico: "pj",
    itens: [
      { descricao: "Criar e-mail e acesso ao SenaHub", responsavel: "ti", prazoDias: -1 },
      { descricao: "Liberar acesso às pastas dos projetos", responsavel: "ti", prazoDias: -1 },
      { descricao: "Cadastrar a pessoa jurídica (CNPJ e dados bancários)", responsavel: "rh", prazoDias: 0 },
      { descricao: "Assinar contrato de prestação de serviços", responsavel: "rh", prazoDias: 0 },
      { descricao: "Entregar equipamento, se houver (registrar no Patrimônio)", responsavel: "ti", prazoDias: 0, patrimonio: true },
      { descricao: "Aceitar os termos de uso no primeiro acesso", responsavel: "pessoa", prazoDias: 1 },
      { descricao: "Apresentar a equipe e os projetos ativos", responsavel: "lider", prazoDias: 5 },
    ],
  },
  {
    nome: "Saída — CLT e estágio",
    tipo: "saida",
    publico: "clt_estagio",
    itens: [
      { descricao: "Transferir disciplinas e tarefas em andamento", responsavel: "coordenador", prazoDias: -5 },
      { descricao: "Comunicar a saída à equipe", responsavel: "lider", prazoDias: -3 },
      { descricao: "Salvar arquivos de trabalho nas pastas dos projetos", responsavel: "pessoa", prazoDias: -2 },
      { descricao: "Recolher máquina e equipamentos (baixar no Patrimônio)", responsavel: "ti", prazoDias: 0, patrimonio: true },
      { descricao: "Encerrar acessos externos (e-mail, sistemas, cofre de credenciais)", responsavel: "ti", prazoDias: 0 },
      { descricao: "Exame demissional e documentos da rescisão", responsavel: "rh", prazoDias: 0 },
      { descricao: "Conferir ponto e banco de horas do último mês", responsavel: "rh", prazoDias: 5 },
    ],
  },
  {
    nome: "Saída — PJ",
    tipo: "saida",
    publico: "pj",
    itens: [
      { descricao: "Transferir disciplinas e tarefas em andamento", responsavel: "coordenador", prazoDias: -5 },
      { descricao: "Comunicar a saída à equipe", responsavel: "lider", prazoDias: -3 },
      { descricao: "Recolher equipamento, se houver (baixar no Patrimônio)", responsavel: "ti", prazoDias: 0, patrimonio: true },
      { descricao: "Encerrar acessos externos (e-mail, sistemas, cofre de credenciais)", responsavel: "ti", prazoDias: 0 },
      { descricao: "Assinar o distrato", responsavel: "rh", prazoDias: 0 },
      { descricao: "Conferir notas fiscais e pagamentos pendentes", responsavel: "rh", prazoDias: 5 },
    ],
  },
];
