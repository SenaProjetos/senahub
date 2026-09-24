---
titulo: Novidades e Notas de Versão
descricao: O que mudou em cada atualização do SenaHub, em linguagem para o dia a dia.
resumo: Histórico das novidades entregues a cada versão do sistema — funcionalidades novas e melhorias visíveis para quem usa.
tags: [novidades, notas de versão, changelog, atualizações, versão, o que mudou]
palavras-chave: [novidades, notas de versão, changelog, atualização, versão, lançamento, o que há de novo, release]
sinonimos: [release notes, changelog, o que mudou, atualizações do sistema]
---

# Novidades e Notas de Versão

Esta página reúne, em linguagem do dia a dia, o que mudou a cada atualização do
SenaHub. A versão mais recente fica no topo. Para detalhes de uso de cada
funcionalidade, veja a seção correspondente no [manual](README.md).

> Dúvida sobre alguma novidade? Abra um chamado em **Suporte** ou pergunte no **Chat**.

> **Procurando a lista técnica, versão a versão?** Clique no número da versão no rodapé do
> menu lateral (ex.: `v1.13.0`) ou acesse **/versoes**. Aquela página é gerada
> automaticamente a partir dos commits a cada publicação e lista *todas* as mudanças —
> inclusive as internas. Esta aqui é a leitura em linguagem do dia a dia.

---

## Escalas de trabalho por contratação

Em **RH → Escalas**, a escala padrão agora é definida **por contratação** (CLT e Estágio), e
não mais por perfil — é a mesma regra que o ponto, o banco de horas e a folha já usavam. PJ,
autônomo (RPA) e sócio (pró-labore) não têm jornada controlada e continuam sem escala padrão;
se precisar, personalize por usuário.

- A escala de **estágio** não aceita mais do que **30h por semana** (Lei 11.788), nem na escala
  padrão nem na personalizada de um estagiário. Dentro disso, dá para compensar horas entre os
  dias — um dia mais longo e outro mais curto.
- Na ficha da pessoa e em **Minha conta**, a escala "herdada" mostrada é a da contratação — a
  que realmente vale para o cálculo.

---

## Padrão de nomenclatura por versão e sub-disciplina

O padrão de nome de arquivo agora é **versionado**: a gestão publica uma versão nova
(**Configurações → Nomenclatura**) sem mexer na que já está em uso — cada uma, uma vez
publicada, fica fixa. Um projeto novo recebe automaticamente a versão vigente na data em que
é criado; publicar uma versão nova **não muda** projeto nenhum que já existe. No botão
**Nomenclatura** de cada projeto (aba Arquivos), dá para trocar de versão a qualquer momento
— o sistema mostra antes quantos documentos ficariam marcados como "fora do padrão" (nenhum
arquivo é renomeado, é só o alerta) e pede confirmação.

Disciplinas ganharam **sub-disciplina**: uma etiqueta de documento dentro de um card — por
exemplo, Água Fria e Água Quente dentro de Hidrossanitário — sem projetista, prazo ou
pagamento próprios, reconhecida só pelo nome do arquivo no envio. Cadastre em
**Configurações → Disciplinas**. A lista de documentos ganhou filtro e coluna de
sub-disciplina, a Lista Mestre passou a ordenar por ela, e o zip de download organiza os
arquivos numa pasta por sub.

O editor visual do padrão passou a aceitar **texto fixo** no nome (como "SENA"), além dos
blocos de sempre.

Veja a seção "Padrão de nomenclatura do projeto" em [Projetos](projetos/projetos.md).

---

## Desligamento de colaborador

A ficha da pessoa (**RH → Pessoas**) ganhou o botão **Desligar**. O RH informa o motivo, o
último dia do vínculo e o último dia com login. O ponto e a apuração param na data de saída, o
login cai no dia seguinte à data escolhida, e o histórico fica guardado. Dá para cancelar enquanto
as datas não chegam. Veja [Funcionários → Desligamento](rh-ponto/funcionarios.md#desligamento).

Junto veio uma correção: usuário **desativado** não consegue mais entrar de novo com a senha
antiga. Antes, desativar só derrubava as sessões abertas.

---

## Botão direito e ações em lote nas listas

O menu do **botão direito** (no celular, **tocar e segurar**) chegou às principais listas do
sistema: diretório de **Arquivos**, **Aprovações**, **Clientes**, **Usuários**, **Lançamentos** e
**Contas a pagar/receber**, **Campanhas**, **Parceiros**, **Certidões**, **Acessos**, **Catálogo de
disciplinas**, a planilha do **Orçamento**, o **funil** do Comercial e a **Agenda**. Tudo o que
está no menu continua também no botão **⋯** da linha ou do cartão.

- **Ações em lote.** Marque várias linhas na caixa de seleção e clique com o botão direito em uma
  delas (ou use a barra que aparece na parte de baixo da tela): a ação vale para **todas as
  marcadas**. O sistema mostra quantas deram certo e, se alguma falhar, qual e por quê. O limite é
  de **100 itens por vez**, e ações que apagam pedem confirmação com a contagem ("Excluir 7
  lançamentos?").
- **A seleção acompanha os filtros.** O que você marcou continua marcado quando troca de filtro ou
  de página, e o botão **Selecionados (N)** mostra só as linhas marcadas — útil para juntar itens
  de filtros diferentes. A seleção some ao concluir a ação, ao clicar em **Limpar** e ao recarregar
  a página.
- **Botão direito fora da seleção.** Numa linha que não está marcada, o menu vale só para ela e
  a seleção passa a ser só ela (como no explorador de arquivos do Windows).
- **Ação que não serve para vários** (editar, abrir detalhes) aparece **esmaecida, com o motivo
  escrito** — nunca some sem explicação.
- **Funil e Agenda.** No **funil** do Comercial o menu do cartão tem *Abrir*, *Mover para* (os
  destinos que o funil não permite ficam esmaecidos, com o motivo), *Reabrir* e *Copiar nome*. Na
  **Agenda**, clicar com o botão direito num dia oferece *Novo compromisso neste dia*, e cada
  compromisso ganhou *Editar*, *Duplicar* e *Excluir* — que agora pede confirmação.
- **No celular**, arrastar um cartão do funil pela alça agora arrasta o cartão em vez de rolar a
  página.

Detalhes em [Comercial](clientes-comercial/comercial.md), [Agenda](projetos/agenda.md),
[Lançamentos](financeiro/lancamentos.md) e nas demais páginas de cada tela.

## Botão direito nas tarefas e nos documentos

Nas **tarefas** e na tabela de **documentos** da aba Arquivos do projeto, o botão direito do
mouse agora abre um menu com as ações do item, sem você precisar procurar o botão certo. No
celular, é só **tocar e segurar**.

- **Tarefas:** abrir, mover para outra coluna (sem arrastar), copiar o título e arquivar.
  Na área vazia de uma coluna, **Nova tarefa em [coluna]** já cria a tarefa naquele status.
- **Documentos:** visualizar em nova aba, comparar revisões, baixar, copiar link ou nome,
  histórico, validar, solicitar ajuste, renomear e excluir. Quando o documento tem PDF e DWG,
  baixar e copiar link mostram cada arquivo.

Tudo o que está no menu continua também no botão **⋯** do cartão ou da linha, que funciona
pelo teclado. Fora desses itens — títulos, filtros, textos — o botão direito segue abrindo o
menu normal do navegador, então copiar, colar e abrir em nova aba continuam como sempre. Ao
entrar em **Tarefas** pela primeira vez, um pequeno guia aponta o novo menu.

Detalhes em [Tarefas](projetos/tarefas.md) e em [Projetos](projetos/projetos.md).

---

## Proposta montada no sistema, com texto padrão e parcelas calculadas

**Nova proposta** agora monta a proposta a partir de um **modelo** — com o texto de cada seção
(escopo por disciplina, o que não está incluso, competências, alterações) já pronto e editável.
O **plano de pagamento** é informado em percentual: o sistema calcula o valor de cada parcela, escreve o
valor **por extenso** e avisa enquanto a soma não fecha 100%. A **UF da obra** escolhe a versão certa de
cada cláusula, para uma norma de outro estado nunca aparecer na proposta.

O documento sai com o timbre, o e-mail e os dados bancários de **Configurações → Empresa** (preencha
uma vez), tem link para o cliente e PDF paginado. A **Pré-visualização** mostra o que impede de enviar. A
gestão mantém os modelos e as cláusulas em **Comercial → Modelos de proposta**.

O editor antigo continua na aba **Propostas** como **Proposta simples**, e **Registrar proposta enviada
(PDF)** segue para propostas feitas fora do sistema.

Também nesta versão: no visualizador do Estúdio de Documentos, **Ctrl + roda do mouse** dá zoom só no desenho
(sem ampliar a página inteira), e o modelo em branco de folhas grandes (como o Carimbo A0) deixou de abrir vazio.

---

## Arquivos em pastas: disciplina → fase → formato

O painel da esquerda da aba **Arquivos** virou uma árvore de pastas. Abra uma disciplina e
aparecem as **fases**; abra uma fase e aparecem as pastas por **formato** (PDF, DWG, IFC…),
mais a pasta **Outros** para o que não é formato conhecido. Pasta vazia não existe: a árvore é
montada a partir dos arquivos que estão lá, e cada pasta mostra quantos documentos tem.

Na prática, clicar numa pasta é filtrar a lista da direita — o mesmo filtro de antes, agora
navegável. Documento sem fase preenchida fica numa pasta **Sem fase**, o que também serve de
lembrete do que falta classificar.

O **link público** que o cliente recebe ganhou as mesmas pastas, e ele pode baixar em .zip o
que quiser: um formato, uma fase, a disciplina inteira ou o projeto todo. O zip vem organizado
igual à tela (`Disciplina/Fase/FORMATO/arquivo`).

## Lista Mestre gerada sozinha, a partir dos arquivos aprovados

A aba **Lista Mestre** saiu. Ninguém precisa mais cadastrar folha por folha: na aba
**Arquivos**, o botão **Gerar Lista Mestre** monta a lista da disciplina com os documentos
que já foram **validados**, com número, título, fase, tipo, folha, revisão e formatos
(PDF, DWG…). A lista é salva na própria disciplina como um documento do tipo Lista Mestre —
um **PDF** com timbrado para entregar e uma **planilha** para trabalhar, os dois na mesma
revisão. Gerar de novo não cria arquivo repetido: entra como a próxima revisão da mesma
Lista Mestre, inclusive por cima da que foi enviada à mão antes.

Antes de gerar, uma prévia mostra o que vai entrar, e dá para baixar sem salvar. Documento
sem título sai com o campo vazio — completar o título na lista de documentos e gerar de novo
resolve.

O **padrão de nomenclatura** do projeto e as **siglas próprias** dele, que moravam naquela
aba, agora ficam no botão **Nomenclatura**, ao lado de "Enviar documentos". Quem não tem
permissão de Configurações continua vendo qual padrão está valendo, só não edita.

## Editor visual do padrão de nomenclatura, e ele agora aparece na Lista Mestre

Cada projeto pode ter seu próprio padrão de nome de arquivo — isso já existia, mas o
formulário morava escondido dentro do diálogo "Siglas deste projeto". Agora ele é uma
seção visível fora do diálogo (hoje no botão **Nomenclatura** da aba Arquivos, veja a
novidade acima), com uma etiqueta que já mostra se o projeto
usa o padrão global ou um próprio, sem precisar abrir nada. E editar o padrão deixou de
exigir regex: o **editor visual** monta o nome por blocos (Projeto, Disciplina, Fase,
Número, Tipo, Revisão) — escolha os blocos, a ordem, o separador e o que é opcional, e uma
prévia mostra como o nome ficaria. A mesma tela existe em **Configurações → Lista Mestre**
para o padrão global da empresa.

## Reconhecimento automático do nome do arquivo, tamanho do papel e selo Backup

Ao enviar um arquivo na aba **Arquivos**, o sistema agora lê o **nome do arquivo** e
identifica sozinho fase, tipo de documento e número da prancha (respeitando siglas
alternativas, ex.: `DE`/`DTC` para Detalhe, `PE`/`EXE` para Executivo) — quando a leitura
tem certeza alta, os campos já chegam preenchidos e editáveis; quando não tem certeza, o
sistema mostra um aviso ou uma sugestão com botão, nunca decide por você. Também dá para
enviar um arquivo como **nova versão** de um documento já existente mesmo que o nome tenha
mudado — o caso do backup automático do AltoQi, que carimba a data no nome a cada gravação.

Depois que um PDF é enviado, o **tamanho do papel** (A0 a A4) é lido sozinho da 1ª página —
sem precisar informar nada. A tabela de Documentos ganhou colunas de **Tipo** e **Papel**
(além do Nº e da Fase que já existiam), filtros para as duas, e um filtro por **Categoria de
extensão**. E o pedido mais antigo sobre isso foi resolvido: arquivo de **backup do modelo**
(pacote B, ou qualquer extensão de backup de software) ganhou o selo **Backup** na tabela e
pode ser encontrado pelo filtro **Pacote → Backup** — antes ele aparecia junto dos demais,
sem nenhum sinal de que era um backup. Veja [Projetos → Colunas e filtros da tabela de
arquivos](projetos/projetos.md).

## Histórico de cada documento

Na aba **Arquivos** do projeto, o painel de detalhes de cada documento ganhou a seção
**Histórico**: quem enviou, validou, renomeou ou mudou fase, status, título e descrição —
com o valor anterior e o novo. Para administradores, coordenadores e administrativo, o
histórico também mostra **quem baixou e quem visualizou** cada arquivo, inclusive clientes
pelo link público. Veja [Projetos → Histórico de cada documento](projetos/projetos.md).

Também na tela de Documentos: a coluna **Revisão** passou a mostrar **R00** para a emissão
original (a primeira revisão é a R01), a fase é lida do nome do arquivo no envio e ganhou
coluna própria, e o DWG tem botões separados para baixar e visualizar.

## Anotações no chat

No **Chat** agora dá para criar um espaço de **Anotações** só seu, sem outros membros, para
guardar anotações, links e referências úteis aos projetos. Clique no **+** ao lado de
**Anotações** na lista de conversas. Pode ter mais de um, renomear e excluir — o que
for excluído fica 30 dias na **Lixeira** e pode ser restaurado. Dá para usar tudo que uma conversa já tem:
anexos, áudio, fixar, buscar e encaminhar.

As anotações são visíveis só para você e para os administradores do sistema, e o **Termo de
Uso** foi atualizado para dizer isso — por isso ele será pedido de novo no próximo acesso.
Veja [Chat](comunicacao/chat.md).

---

## Taxa de ART entra no custo do projeto

A taxa informada na ART agora vai sozinha para o Financeiro e aparece na **margem do
projeto**. No cadastro da ART, escolha **quem paga a taxa**: a empresa (vai para contas a
pagar), a empresa com reembolso do cliente (também gera o valor a receber) ou o cliente
direto (não gera lançamento). Não é mais preciso lançar a taxa à mão — e não lance, para não
contar duas vezes. Veja [Projetos](projetos/projetos.md).

ARTs cadastradas antes desta versão só entram no financeiro quando forem editadas e salvas.

---

## Folha CLT direto do PDF do contador, e holerite assinado no sistema

A **Folha CLT** não precisa mais ser digitada rubrica por rubrica. Em **Folha CLT**, abra a
folha do mês e clique em **Importar PDF**: o sistema lê o arquivo que o contador já envia e
monta os holerites de todo mundo.

- **Confere os números antes de gravar.** Se a soma das rubricas não bater com o total
  impresso no PDF, nada é importado — nem pela metade.
- **Rubrica ou matrícula nova** não trava o mês: a tela mostra o que falta cadastrar, você
  resolve ali mesmo e reenvia o mesmo arquivo.
- **Ignorar funcionário** — para quem aparece no PDF mas não usa o sistema (ex.: pró-labore
  de sócio). A matrícula fica de fora dos próximos imports, e dá para desfazer.

**Todo colaborador CLT assina o próprio holerite.** Depois que o RH fecha a folha, o sistema
pede a assinatura no próximo acesso, mostrando proventos, descontos e líquido. O RH vê quem
já assinou e pode mandar um lembrete. A assinatura não atrasa o pagamento.

**13º salário tem folha própria.** Na hora de criar a folha, escolha o tipo **13º salário**:
a de dezembro e a de 13º de dezembro ficam lado a lado. Se alguém tentar importar o PDF de
13º na folha do mês (ou o contrário), o sistema recusa e diz em qual folha importar.

**PDFs com timbrado.** O holerite e o recibo de pagamento de projetista agora saem com logo,
razão social, CNPJ e endereço da empresa no topo. Os dados ficam em
**Configurações → Empresa**.

Detalhes em [Folha CLT](rh-ponto/folha-clt.md) e [Configurações](sistema/configuracoes.md).

---

## Acessos e Credenciais — o cofre da empresa

Chegou uma tela nova em **Gestão → Acessos**: o lugar único para as contas que a
empresa usa para trabalhar — portais de Corpo de Bombeiros e CREA de cada estado,
prefeituras, TQS, AltoQi, Autodesk, plataformas de cliente.

Não é uma planilha de senhas. Duas coisas mudam:

- **A senha fica cifrada** e nunca aparece numa listagem. Ela só é mostrada quando alguém
  autorizado clica para revelar, some sozinha depois de 30 segundos, e o clique fica
  registrado no histórico daquele acesso.
- **Ver o cadastro e ver a senha são permissões separadas.** Dá para alguém saber que a
  conta do CREA-SP existe, quem é o responsável e quando vence, sem poder ler a senha.

Também entrou:

- **Atenção necessária** — licenças perto de vencer, contas bloqueadas e credenciais sem
  revisão há muito tempo, no alto da tela.
- **Aviso automático** de licença vencendo (90, 30 e 7 dias) e de credencial sem revisão,
  para o responsável e para quem tem o acesso compartilhado. Dá para desligar em
  **Minha conta → Preferências → Notificações**.
- **Marcar como revisada** — confirma que você conferiu que o portal ainda funciona e o
  usuário está certo. Não troca a senha.
- **Acessos relacionados** dentro do projeto, na aba **Mais**.

Um acesso recém-cadastrado nasce visível só para administradores: use **Compartilhar**
para liberar para pessoas, perfis ou setores.

Detalhes em [Acessos e Credenciais](gestao/acessos.md).

---

## Campos de valor padronizados (atenção: muda o jeito de digitar)

Todos os campos de dinheiro do sistema passaram a funcionar igual, **como a maquininha de
cartão**: o valor cresce dos centavos para os reais e já aparece formatado enquanto você
digita. O campo mostra **R$**, alinha o número à direita e abre o teclado numérico no
celular.

**O que muda na prática:** antes, digitar `1400` num campo de valor dava R$ 1.400,00. Agora
`1400` dá **R$ 14,00** — para R$ 1.400,00 digite `140000`. Sempre inclua os centavos.

Ponto e vírgula não precisam mais ser digitados (as teclas são ignoradas), e apagar desloca
o número de volta: `1.500,50` → `150,05`. Para recomeçar um valor, selecione tudo
(`Ctrl+A`) e digite de novo. → [Guia de Início Rápido](quick-start.md)

---

## Campos de percentual padronizados

Os campos de porcentagem também ficaram iguais em todo o sistema: **%** fixo no campo,
número alinhado à direita e teclado numérico no celular.

Diferente dos campos de valor, aqui **não** há a regra dos centavos: digite o número
direto — `25` é 25%, `7,5` é 7,5%. O campo se arruma ao sair dele (`25,` vira `25`).
Cada campo aceita só as casas decimais que o dado permite, e margem esperada e reajuste
passam a aceitar percentual negativo (prejuízo previsto, deflação). →
[Guia de Início Rápido](quick-start.md)

---

## Visão Geral de Projetos

A ficha de projeto agora abre com uma **Visão Geral** mais compacta: prazo, progresso,
entregas, pendências, riscos, cronograma e atividade recente ficam reunidos para uma leitura
rápida. O trabalho detalhado de cada disciplina — kanban, arquivos, revisões, validações,
tarefas e responsáveis — passou para a nova aba **Disciplinas**. →
[Projetos](projetos/projetos.md)

A Visão Geral também pode ser organizada por cada pessoa: em tela ampla, **Personalizar
painel** permite mover e redimensionar os blocos. A configuração é individual e fica salva
somente para o projeto aberto. Para trocar dois blocos, mantenha um sobre o outro até aparecer
**Solte para trocar**. → [Projetos](projetos/projetos.md)

Administradores, coordenadores e equipe administrativa agora têm o bloco **Horas registradas no
projeto**, com jornadas e apontamentos da equipe nos últimos 7 dias. →
[Projetos](projetos/projetos.md)

O bloco **Resultado financeiro** passou a mostrar sua composição confirmada em cards largos,
incluindo pagamentos, serviços, custos extras e rateio de horas. →
[Projetos](projetos/projetos.md)

---

## Comercial — reforma do CRM

O Comercial foi reorganizado em um fluxo claro de **prospecção → negociação → proposta → projeto**.
Agora é possível registrar interações e próximos passos, retomar empresas com histórico, consultar a
Empresa 360, acompanhar **Meu Dia**, analisar conversão por canal e baixar o recorte atual em CSV.
O botão **Nova entrada** também atende indicações, demandas espontâneas e clientes recorrentes:
registra o canal e o indicador corretos, separa demandas diferentes da mesma empresa e permite abrir
uma negociação imediatamente quando já existe um pedido concreto.
O novo botão **Guia de uso** explica o fluxo completo, com as telas e os botões de cada etapa. Os
lembretes comerciais também podem ser desligados individualmente em **Preferências**. →
[Comercial](clientes-comercial/comercial.md)

## v1.1.0 — 07/07/2026

Grande atualização que reúne meses de trabalho. Destaques por área:

### ⏱️ Ponto v2 — registro de jornada reformulado
Nova experiência de ponto: **batidas**, **escalas de trabalho**, **espelho do ponto**,
**ajustes** e **alertas/lembretes** de batida. Mais claro para o colaborador e para quem
acompanha as horas. → [Ponto](rh-ponto/ponto.md)

### 📁 Documentos do cliente
Repositório de documentos **ancorado na proposta** e **herdado pelo projeto**. O cliente
pode **enviar arquivos pelo link público da proposta**, e há uma aba **Documentos** na ficha
do cliente e no **portal do cliente**.

### 📐 Pranchas / Lista Mestre
Novo **visualizador de PDF** com **apontamentos** que viram **tarefas** e seguem para
**revisão**. O projeto ganhou **explorer de arquivos** e **histórico**. → [Projetos](projetos/projetos.md)

### 💬 Chat mais completo
**Múltiplos anexos** (dá para **colar** imagem direto), **lightbox** para ampliar,
**catálogo de emojis** por categoria, **indicador de mensagens não lidas** e vários
ajustes visuais. → [Chat](comunicacao/chat.md)

### 🗂️ Disciplinas configuráveis
O administrador agora **configura o catálogo de disciplinas** — criar, **reordenar** e
governar categorias. Incluídos o tipo **"Aprovação"** e a categoria **"Recebidos"**.

### 🔐 Acesso e login
Botão para **exibir a senha** (no login e na troca), **sessão de 16 horas** com renovação
automática e a **animação da marca** ao entrar.

### 📤 Uploads
**Validação parcial de entregas** — arquivo por arquivo, sem travar o envio inteiro por
causa de um item.

---

*As versões anteriores (base de produção) não têm notas publicadas aqui — esta página
passa a registrar as novidades a partir da v1.1.0.*
