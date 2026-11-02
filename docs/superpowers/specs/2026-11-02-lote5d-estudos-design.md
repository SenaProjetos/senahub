# Lote 5d — Aba Estudos: levantamento de cargas por projeto

Origem: reunião de 26/10/2026 (ver [roadmap](2026-10-26-reuniao-hub-roadmap.md), Lote 5) e
[desenho do Lote 5](2026-11-02-lote5-calculadoras-instalacoes-design.md). O dono pulou as perguntas do
Lote 5 ("siga direto, qualquer alteração fazemos depois"); as decisões abaixo são do agente, marcadas com
**[decisão do agente]**. O que depende do engenheiro está marcado com **[validar]**.

## Intenção

A equipe de instalações faz o levantamento de cargas (ambientes, pontos de luz e tomada, potências, fatores
de potência e de demanda, demanda prévia) em planilhas soltas. O pedido é ter isso **dentro do projeto**,
vivo, com a conta feita pelo mesmo motor da calculadora "Corrente e demanda".

## Objetivos / não-objetivos / anti-objetivos

- Objetivo: aba **Estudos** no projeto (`/projetos/[id]/estudos`), com vários estudos por projeto; cada estudo é
  um levantamento de cargas elétricas organizado por **ambientes**, com totais e subtotais calculados na hora.
- Objetivo: o **mesmo motor** (`calc/electrical-demand.ts`) da calculadora — um só código para a conta.
- Objetivo: dado vivo do projeto — escopo de projeto, auditoria (`defineAction`), quem alterou e quando,
  trilha de alterações na própria tela, trava otimista contra edição simultânea.
- Objetivo: exportar a memória (PDF/Word/Excel) pelos mesmos renderizadores da calculadora, para substituir a planilha.
- Não-objetivo: escolher seção de cabo ou disjuntor; estudos hidráulicos; autosave; importar `.shcalc`.
- Anti-objetivo: um número sem fonte virar padrão. **Nenhuma potência típica, fator de demanda ou fator de
  potência vem preenchido**: o engenheiro digita, e o estudo guarda a fonte dos fatores de demanda
  (tabela da concessionária) para constar na memória.

## Decisões **[decisão do agente]**

1. **Um documento por estudo, não uma tabela por linha.** Tabela nova `estudo_projeto` com o conteúdo
   (ambientes → cargas, condições de instalação) em `conteudo JSONB`, validado por Zod no servidor. Razões: o
   motor já recebe exatamente esse formato; gravar o estudo inteiro é tudo-ou-nada; a trava otimista é uma
   coluna (`versao`), no mesmo padrão do `salvarModeloBriefing` (Lote 4). Não há consulta entre estudos que
   exija colunas.
2. **Tipo do estudo.** Coluna `tipo` (`cargas_eletricas` por ora): a aba se chama Estudos e o formato do
   `conteudo` muda por tipo quando vier o hidráulico.
3. **Permissões, sem par novo (sem migração de perfis).**
   - Ver e abrir: interno + `ferramentas:usar` + enxergar o projeto (`projetoVisivel`).
   - Criar, editar, duplicar e excluir: o acima **e** (`projetos:atuar_disciplina_alheia` **ou** ser
     responsável de alguma disciplina do projeto) — a mesma régua do Diário.
   - Se a equipe quiser um par próprio (`projetos:estudos`), vira pedido à parte (exige migração de perfis).
4. **Trava de validação herdada.** O estudo roda o motor `corrente-demanda`. Enquanto a calculadora estiver "em
   validação" (`situacaoValidacao`), a aba só aparece e só abre para quem tem `ferramentas:gerir`, com faixa
   "Motor em validação — não use estes números em projeto"; quem não tem recebe 404 na página e recusa nas
   ações. Validada a versão do motor, a aba abre para todos com a permissão. **Não se guarda resultado** (só as
   entradas): ao validar, o estudo já criado passa a mostrar números do motor validado, sem nada velho gravado.
   Se `versaoCalc` do motor mudar, a aba volta a "em validação" sozinha.
   Isto difere do 5a, que recusa *vínculo de cálculo salvo a projeto*: lá o cálculo guarda resultado; aqui não.
5. **Subtotal por ambiente** = o motor rodado só nas cargas do ambiente, com as mesmas condições. Potência
   instalada, demandada e aparente somam exatamente ao total (teste); fator de potência médio e corrente total
   saem dos totais. Ambiente sem carga não entra no motor.
6. **Rótulo do ponto** (`tipoPonto`: iluminação | tomada de uso geral | tomada de uso específico | outro): só
   rótulo, serve para o subtotal por tipo; não altera conta nenhuma e não traz potência padrão.
7. **Limites**: 200 cargas por estudo (limite do motor), 30 ambientes, 20 estudos por projeto.
8. **Salvar**: botão "Salvar" explícito + Ctrl+S, indicador de alterações não salvas e aviso ao sair. Sem autosave
   (autosave com trava otimista geraria conflito contra si mesmo).
9. **Excluir**: apaga a linha; o `antes` (conteúdo inteiro) fica no `AuditLog`. Sem lixeira.
10. **Memória exportada**: lista achatada, `descricao` = "Ambiente — carga", título do estudo, projeto, fonte dos
    fatores de demanda nas observações. Subtotais por ambiente **não** saem na memória nesta versão (adiado).
11. **Trilha na tela**: seção recolhível "Alterações" com as últimas 20 entradas do `AuditLog`
    (`modulo=estudos`, `entidadeId`=estudo): quem, quando, o quê. Sem diff campo a campo.

## Dados

`estudo_projeto`: `id`, `projetoId` (FK, cascade), `tipo`, `nome`, `conteudo` (JSONB), `versao` (int, começa em 1,
+1 por gravação), `criadoPorId`, `atualizadoPorId` (FK User), `createdAt`, `updatedAt`. Índice `(projetoId, createdAt)`.

`conteudo` (tipo `cargas_eletricas`):

```
{
  ambientes: [{ id, nome, cargas: [{ id, descricao, tipoPonto?, quantidade, potenciaW, fp, rendimento, fd, tensaoV, ligacao }] }],
  condicoes: { isolacao, temperaturaC, circuitosAgrupados, fctManual?, fcaManual?, alimentacaoTensaoV, alimentacaoLigacao },
  fonteFatorDemanda?: string,   // ex.: "Tabela 1 da NDU da concessionária"
  observacoes?: string
}
```

Os campos de carga e de condições são exatamente os do `entradaSchema` do motor (chaves em português persistidas:
nunca renomear).

## Telas

- **Lista** (`/projetos/[id]/estudos`): linhas com nome, tipo, nº de cargas, demanda (kW) e quem/quando alterou;
  menu de contexto e `⋯` (ADR-0002): Abrir, Duplicar, Memória PDF/Word/Excel, Excluir (confirma). "Novo estudo" abre
  um diálogo só com o nome. Estado vazio com ação, esqueleto de carregamento.
- **Estudo** (`/projetos/[id]/estudos/[estudoId]`): cabeçalho (voltar, nome editável, Salvar, `⋯`); faixa de validação
  quando for o caso; seção por **ambiente** (nome editável, cargas com o mesmo menu de contexto da calculadora,
  mais Duplicar/Mover/Remover ambiente); condições de instalação e alimentação (iguais às da calculadora);
  painel de resultado (total + tabela por ambiente + por tipo de ponto); fonte dos fatores de demanda e
  observações; "Alterações" recolhível. Linha de carga reaproveita o componente da calculadora (extraído).

## Fora desta versão (registrado)

Estudos hidráulicos; subtotal por ambiente na memória exportada; autosave; importar cálculo salvo/`.shcalc`;
modelos de ambiente ("banheiro padrão") — dependem de potências com fonte; diff campo a campo na trilha; lixeira.
Manual e guia ilustrado só depois da validação (mesma regra do Lote 5).

## Depende do engenheiro **[validar]**

Nada novo de fórmula. Duas coisas para a ficha de `corrente-demanda`: a soma dos subtotais dos ambientes (aritmética
das potências) e o uso do fator de demanda por linha como única forma de demanda — a ficha ganha um adendo "Estudos".

## Verificação

Testes puros (esquema do conteúdo, cálculo por ambiente com a soma igual ao total, acesso, descritor de ações),
teste de guarda do módulo, smoke `smoke:estudos` no banco de dev (criar, salvar, conflito de versão, escopo, trava de
validação, duplicar, excluir), tela verificada pelo agente (lista, estudo, menus, celular 390×844, gestor × comum),
auditoria nível 3.
