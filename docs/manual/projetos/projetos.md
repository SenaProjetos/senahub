---
titulo: Projetos
descricao: Cadastro e acompanhamento de projetos, disciplinas, responsáveis, revisões e ciclo de vida.
resumo: Liste e filtre projetos, crie/edite, gerencie disciplinas e seus status, responsáveis, membros, revisões, duplicação e cancelamento/arquivamento.
tags: [projetos, disciplinas, status, responsáveis, membros, revisões, duplicar, cancelar, arquivar, progresso]
palavras-chave: [projeto, disciplina, status, em andamento, em revisão, entregue, aprovado, responsável, membro, revisão, duplicar projeto, cancelar projeto, prazo]
sinonimos: [obras, jobs, contratos de projeto]
---

# Projetos

## Objetivo

Centralizar o cadastro e o acompanhamento dos projetos do escritório: dados do projeto,
disciplinas técnicas, responsáveis, prazos, progresso, revisões e situação.

## Quando utilizar

- Para criar um projeto, acompanhar o andamento das disciplinas e atualizar status.
- Para gerenciar a equipe (membros) e registrar revisões.

## Quando não utilizar

- O **cliente** não usa esta tela; ele acompanha pelo [Portal](../inicio/portal-cliente.md).
- Para o cronograma detalhado (gantt/EAP), use [Planejamento](planejamento.md).

## Como acessar

- Menu → **Projetos** (`/projetos`). Exige a permissão **`projetos:ver`**.
- Perfis disponíveis: admin, supervisor, administrativo, clt, estagiário, projetista_pj,
  freelancer.

## Escopo (quem vê quais projetos)

- **Global** (admin, supervisor ou sócio ativo): vê **todos** os projetos.
- Demais perfis: veem apenas projetos onde são **membros** ou **responsáveis por uma
  disciplina**.

## A lista de projetos

- **Busca** por texto e **filtros**: situação, cliente, responsável, disciplina e
  **"meus projetos"** (onde você é membro).
- **Ordenação** por código, nome, situação ou cliente.
- **Paginação** padrão (12/24/48 por página).
- O botão **Novo projeto** e as ações de edição aparecem apenas para quem tem
  **`projetos:gerir`**.

## Criar um projeto

1. Clique em **Novo projeto**.
2. Preencha: tipo, **nome**, **cliente**, descrição, área (m²), endereço, **prazo
   final**, valor de contrato.
3. Defina os **membros** da equipe e as **disciplinas** (nome, prazo, valor e
   responsáveis de cada uma).
4. **Salvar**. O sistema gera automaticamente o **código** no formato `AAXXXX`
   (ano + sequencial) e cria os canais de chat do projeto.

> Exige `projetos:gerir`.

## Disciplinas e fluxo de status

Cada disciplina passa por um ciclo de status:

| Status | Significado | Progresso |
| --- | --- | --- |
| Aguardando | Ainda não iniciada | 0% |
| Em andamento | Em execução | 40% |
| Em revisão | Sob revisão | 60% |
| Entregue | Entregue, aguardando validação | 85% |
| Aprovado | Validada (status final) | 100% |

- O **progresso do projeto** é a média desses pesos entre suas disciplinas.
- **Quem altera o status:** gestores (admin/supervisor) **ou** os **responsáveis** pela
  disciplina.
- **Transições para não-gestores** são limitadas: Aguardando→Em andamento; Em
  andamento→Entregue/Em revisão; Em revisão→Em andamento/Entregue; Entregue→Em revisão.
- **Aprovado é terminal** — só é atingido pela **validação da entrega** (não se marca
  "aprovado" manualmente no status).
- Ao marcar **Entregue**, os validadores (admin/supervisor/administrativo) são
  **notificados**. Ao pedir **Em revisão**, os responsáveis são notificados.

### Gerenciar disciplinas (exige `projetos:gerir`)

- **Criar / editar / excluir** disciplina.
- **Adicionar do catálogo** (ignora nomes que já existem no projeto).
- **Editar em massa** (status, prazo e responsável de várias de uma vez).
- **Regras:** o **prazo da disciplina não pode ultrapassar o prazo do projeto**; não é
  possível **excluir** disciplina que já tenha **arquivos enviados** ou **pagamentos
  liberados**.

## Responsáveis, membros e revisões

- **Responsáveis** por disciplina: definidos por quem tem `projetos:gerir`; ao atribuir,
  a pessoa é notificada.
- **Membros** do projeto: equipe com papel; sincroniza os canais de chat do projeto.
- **Revisões (R0, R1, …):** qualquer **responsável** ou gestor registra uma revisão com
  motivo; os demais responsáveis são notificados.

## Outras ações do projeto

- **Duplicar projeto:** cria uma cópia (`nome (cópia)`, novo código), com disciplinas;
  opcionalmente copia responsáveis, membros, EAP e composição de preço. **Nunca** copia
  arquivos, revisões ou pagamentos.
- **Cancelar / Arquivar:** muda a situação e notifica os membros; o motivo é registrado
  na descrição.

## Abas do detalhe do projeto

Ao abrir um projeto, além da visão geral há abas para: **Pranchas**, **Serviços**,
**Arquivos**, **Extras**, **Financeiro** e **Inputs** (formulários de start). Cada uma
será detalhada em sua própria página do manual.

## Permissões (resumo)

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `projetos:ver` |
| Criar/editar projeto, disciplinas, membros | `projetos:gerir` |
| Alterar status / registrar revisão | Responsável da disciplina **ou** gestor |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Transição de X para Y não permitida." | Fluxo de status restrito a não-gestores | Seguir a sequência válida ou pedir a um gestor |
| "Status 'aprovado' só pode ser definido via validação de entrega." | Tentativa de marcar aprovado direto | Validar a entrega |
| "Não é possível excluir uma disciplina com arquivos/pagamentos." | Disciplina com vínculos | Remover vínculos antes ou manter a disciplina |
| "O prazo da disciplina não pode ultrapassar o prazo do projeto." | Prazo inválido | Ajustar o prazo |
| Não vejo "Novo projeto" | Falta `projetos:gerir` | Solicitar permissão |

## Funcionalidades relacionadas

- [Meu trabalho](meu-trabalho.md) · [Planejamento](planejamento.md) · [Tarefas](tarefas.md)
- [Clientes](../clientes-comercial/README.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Como o código do projeto é gerado?** Automaticamente, no formato `AAXXXX` (ano +
sequencial).

**Por que não consigo aprovar uma disciplina?** "Aprovado" só vem da validação da
entrega — não é uma troca manual de status.
