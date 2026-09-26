---
titulo: Modelos de EAP (importar do MS Project)
descricao: A estrutura de cronograma que a casa reusa em projeto novo, importada de um arquivo XML do MS Project.
resumo: Um modelo de EAP guarda a árvore de fases, disciplinas, atividades e marcos, com as durações e as dependências, importada do MS Project. Aplicado num projeto, cria a EAP inteira em rascunho; disciplina que o projeto não tem fica de fora. Datas, horas e pessoas não vêm do modelo.
tags: [modelo de eap, template, ms project, importar xml, mspdi, tipo de empreendimento, estrutura padrão, cronograma padrão]
palavras-chave: [modelo de EAP, template de cronograma, importar MS Project, XML, mspdi, tipo de empreendimento, EAP padrão, estrutura padrão, aplicar modelo]
sinonimos: [template de EAP, cronograma padrão, EAP padrão, importar do Project]
---

# Modelos de EAP (importar do MS Project)

## Objetivo

Guardar a **estrutura de cronograma que a casa já usa** e aplicá-la em projeto novo, em vez de digitar
as mesmas 180 linhas a cada contrato. O modelo é montado **no MS Project** e importado aqui.

## Como acessar

**Gestão → Modelos de EAP** (`/planejamento/modelos`). Ver é de quem tem acesso ao Planejamento;
importar e remover é de quem **monta a EAP** (`planejamento:gerir`).

## O que vem do arquivo, e o que não vem

| Vem | Não vem |
| --- | --- |
| A árvore (fases, disciplinas, atividades, marcos) | **Datas** — quem manda nas datas é o motor do SenaHub |
| A duração de cada atividade, em dias úteis | **Horas previstas** — no Project elas são "1 recurso pela duração", não estimativa |
| As dependências, com tipo (TI, II, TT, IT) e atraso | **Pessoas e recursos** — a equipe é decisão do projeto |
| Marcos (duração zero) | Progresso, datas reais, linha de base |

> **Por que as horas não vêm:** no arquivo exportado, o Project grava "trabalho = duração" para toda
> tarefa com recurso genérico. Importar isso encheria o cronograma de estimativas que ninguém fez.

## Importar

1. No **MS Project**: `Arquivo → Salvar como → XML`. O `.mpp` não é lido.
2. Em **Modelos de EAP**, clique em **Importar do MS Project** e escolha o arquivo.
3. **Confira o que o sistema entendeu** (é a parte que importa — veja abaixo).
4. Dê um **nome** ao modelo e, se quiser, escolha o **Tipo de empreendimento**. O projeto desse tipo
   passa a sugerir este modelo.

### A conferência

O sistema lê cada agrupamento do arquivo e tenta casar o nome com o catálogo da casa. Ele acerta o
nome igual (`ESTRUTURAL` → Estrutural), a sigla (`ESTR`), o plural (`FUNDAÇÃO` → Fundações) e o nome
contido (`BÁSICO` → Projeto Básico). **O que ele não adivinha**, você escolhe:

- `GLP` não parece com `Gás`, nem `TELECOMUNICAÇÕES` com `Cabeamento` — escolha a disciplina na lista.
- Agrupamentos do processo (`GESTÃO E INICIAÇÃO`, `EMISSÃO E ENCERRAMENTO`) não são disciplina nem
  fase: deixe em **Agrupamento**.
- A escolha fica **lembrada**: na próxima importação, o mesmo nome já vem respondido.

**Por que isso não é detalhe:** linha sem disciplina não herda o responsável da disciplina, não fecha
o marco da fase e aparece como "sem responsável" na Saúde do projeto.

### Quanto do valor cabe a cada fase

Se o modelo tem fases (Básico, Executivo…), a conferência pede **quanto do valor da disciplina cabe a
cada uma** — é o que divide o pagamento do projetista por fase. A soma tem de fechar **100%**.

Ao aplicar o modelo, essas fases são **cadastradas nas disciplinas do projeto** que ainda não têm
nenhuma, com esses percentuais; disciplina que já tem fase cadastrada não é mexida.

**Deixar em branco é permitido**, e significa "não cadastrar fase". Nesse caso as linhas entram sem
fase, o marco não marca a fase como **Entregue** e o pagamento por fase não tem em que se apoiar — a
tela de aplicar avisa quais disciplinas ficariam assim.

> Cadastrar as fases põe a disciplina no **pagamento por fase**. É por isso que o sistema pede o
> percentual em vez de dividir sozinho: é dinheiro.

### Etapas de terceiro

O sistema **sugere** quais linhas são trabalho de fora da casa pelo nome ("Receber projeto
arquitetônico", "Validação pelo cliente", "Análise na prefeitura"). Desmarque o que for trabalho da
equipe. Essas linhas seguram prazo, mas **não geram card e não cobram hora** — veja
[Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md).

## Aplicar num projeto

Na aba **Planejamento** do projeto, com a **EAP vazia**, aparece **Usar modelo de EAP**. A janela
mostra, para cada modelo, **quantas linhas ele criaria neste projeto** e o que fica de fora.

- **Disciplina que o projeto não tem fica de fora**, com o galho inteiro. O modelo é da casa; o
  projeto contratou algumas disciplinas. O sistema **não cria disciplina** no projeto (ela carrega
  valor, responsáveis e pagamento de projetista).
- As **datas** nascem na âncora do cronograma e o motor reagenda na hora, pela duração e pelas
  dependências.
- O cronograma nasce em **rascunho**: nada vale até alguém revisar e aprovar.
- As linhas herdam o **responsável da disciplina**, como qualquer linha nova (as de terceiro não).
- As **fases da disciplina** são cadastradas com o percentual do modelo, quando a disciplina ainda não
  tem fase nenhuma (veja acima).

**Quando o botão não aparece, ou aparece bloqueado:**

| Situação | O que fazer |
| --- | --- |
| A EAP já tem linhas | O modelo só entra em EAP vazia — apague as linhas ou duplique outro projeto |
| O projeto já tem linha de base aprovada | Aplicar mudaria o combinado; não é permitido |
| Nenhuma disciplina do projeto está ligada ao catálogo | Cadastre as disciplinas pelo catálogo |
| Nenhuma disciplina do modelo está no projeto | Nada sobraria para criar — use outro modelo |

**Se aparecer "sem fase cadastrada":** o modelo não trouxe os percentuais por fase, ou aquela
disciplina já tem fases próprias. Cadastre pelas **Etapas da disciplina** no projeto — veja
[Etapas da disciplina e pagamento por fase](etapas-e-pagamento-por-fase.md).

## Tipo de empreendimento

Campo do projeto (residência, prédio, galpão…), que serve para **sugerir o modelo**. Quando o projeto
nasce de uma negociação aceita, ele já vem preenchido com o tipo que o comercial classificou.

## Editar um modelo

Não se edita linha a linha aqui: a autoria continua no **MS Project**. Ajuste o arquivo, importe de
novo (as respostas da conferência vêm lembradas) e remova o modelo antigo. Remover é **desativar** —
os projetos já criados não mudam.

## Regras de negócio

- **O modelo não tem datas, horas nem pessoas.** Estrutura, duração e dependência, só.
- **Disciplina fora do projeto é podada**, com tudo dentro dela, e a tela diz o que saiu.
- **Aplicar exige EAP vazia** e projeto sem linha de base.
- **Toda linha criada ganha ID corporativo novo** — a identidade é da linha, não do modelo.
- **O percentual por fase soma 100%** ou não é gravado; em branco, nenhuma fase é cadastrada.
- **Editar é reimportar.**

## Funcionalidades relacionadas

- [Planejamento (EAP e cronograma)](planejamento.md) · [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md) ·
  [Etapas da disciplina e pagamento por fase](etapas-e-pagamento-por-fase.md)

## FAQ

**Importei e faltam disciplinas no cronograma.** Elas não estão no projeto, ou o nome do arquivo não
foi casado com o catálogo na conferência. Abra o modelo em **Modelos de EAP** e veja a coluna "o que
cada nome virou".

**O cronograma ficou mais longo que no Project.** No SenaHub a duração é sempre em **dias úteis** e o
calendário tem os feriados da casa. Tarefa com duração "decorrida" no Project (que anda no fim de
semana) fica mais longa aqui — o aviso da importação lista essas linhas.

**Posso aplicar dois modelos no mesmo projeto?** Não. O segundo encontraria a EAP já preenchida e é
recusado. Aplique um e ajuste as linhas na tela.

[← Projetos e planejamento](README.md)
