---
titulo: Acessos e Credenciais
descricao: Cofre corporativo de contas, portais, softwares e licenças — com senha cifrada, permissão separada para ver o cadastro e para ver a senha, e registro de quem consultou.
resumo: Guarde num lugar só as contas de CREA, Corpo de Bombeiros, prefeituras, softwares e plataformas. Quem pode ver o cadastro e quem pode ver a senha são coisas diferentes, e toda consulta a uma credencial fica registrada.
tags: [acesso, credencial, senha, cofre, portal, licença, software, CREA, bombeiros, prefeitura]
palavras-chave: [acesso, acessos, credencial, credenciais, senha, login, usuário, cofre, portal, órgão, licença, software, CREA, bombeiros, prefeitura, vencimento, revisão, compartilhamento]
sinonimos: [central de acessos, cofre de senhas, gerenciador de senhas, contas da empresa]
---

# Acessos e Credenciais

## Objetivo

Centralizar as contas que a empresa usa para trabalhar: portais de Corpo de Bombeiros e
CREA de cada estado, prefeituras, softwares licenciados (TQS, AltoQi, Autodesk),
plataformas de cliente e serviços em geral.

Duas coisas o diferenciam de uma planilha de senhas:

- **A senha é guardada cifrada** e nunca aparece numa listagem. Ela só é exibida quando
  alguém autorizado clica para revelar — e esse clique fica registrado.
- **Ver o cadastro e ver a senha são permissões separadas.** Alguém pode saber que a conta
  do CREA-SP existe, quem é o responsável e quando vence, sem poder ler a senha.

## Como acessar

- Menu → **Gestão → Acessos** (`/acessos`). Exige a permissão `acessos:ver`.
- Ver a senha exige, além disso, a permissão de credencial **e** que aquele acesso
  específico esteja compartilhado com você. Ter uma sem a outra não basta.

## O que a tela mostra

- **Quatro indicadores** no topo: contas cadastradas, portais públicos, softwares e
  licenças, e acessos restritos. Os números são do que **você** alcança, não do cofre
  inteiro.
- **Atenção necessária:** licenças perto do vencimento, contas bloqueadas, credenciais sem
  revisão há muito tempo e acessos sem responsável definido.
- **Acesso rápido:** atalhos por categoria. Clicar filtra a lista; clicar de novo desmarca.
- **Resumo por status:** quantas contas estão ativas, expirando, em atenção ou bloqueadas.
- **Usados por você:** as últimas credenciais que você consultou. É a sua atividade e só a
  sua — ninguém vê o que os outros usaram por aqui.

## Cadastrar um acesso

**Nova conta**, no canto superior direito. O formulário tem três abas:

- **Básico** — nome (ex.: `CBMMG`), nome completo, categoria, estado, endereço do portal,
  observações e tags.
- **Credencial** — usuário e senha. Se a categoria for software ou licença, aparecem
  também fornecedor, tipo de licença, número e quantidade de assentos.
- **Gestão** — responsável, status, vencimento, próxima revisão e projetos associados.

Ao **editar**, os campos de usuário e senha começam vazios. Isso é proposital: deixar em
branco mantém o que já estava gravado. Só preencha se quiser realmente trocar.

## Ver e copiar a senha

Abra o acesso (botão **Ver** ou clique no nome) e vá até o bloco **Credenciais**.

- **Visualizar** mostra a senha por 30 segundos e depois a esconde sozinha.
- **Copiar** leva usuário ou senha para a área de transferência.

As duas ações ficam registradas no histórico, com quem fez e quando. Não é vigilância: é o
que permite responder "quem teve acesso a essa conta" quando alguém sai da empresa ou uma
senha vaza.

Se você vê o cadastro mas não pode revelar, a tela diz isso — em vez de mostrar um botão
que não funciona.

## Definir quem acessa

No acesso aberto, **Compartilhar** (precisa da permissão de gerenciar compartilhamento).

Você adiciona pessoas, perfis de acesso ou setores inteiros, e marca separadamente o que
cada um pode:

| Permissão | O que libera |
|---|---|
| Ver cadastro | Enxergar que a conta existe, com responsável, vencimento e observações |
| Ver credencial | Revelar e copiar usuário e senha |
| Editar | Alterar os dados do cadastro |
| Compartilhar | Mudar esta própria lista |

Quem é adicionado começa só com **ver cadastro**. Liberar a senha é um clique a mais, de
propósito.

> **Ninguém vê o que não foi compartilhado.** Um acesso que não foi compartilhado com você
> simplesmente não aparece na sua lista — nem na busca, nem pelo projeto.

## Revisar uma credencial

**Marcar como revisada** não troca a senha. Serve para você confirmar que conferiu: o
portal ainda funciona, o usuário está certo, a senha é válida e o responsável está
atualizado. A data fica registrada, e o sistema para de cobrar revisão daquele acesso.

Credenciais sem revisão há mais de 180 dias aparecem em "Atenção necessária" e geram aviso
uma vez por mês para o responsável.

## Avisos automáticos

Todo dia de manhã o sistema verifica e avisa:

- licença vencendo em 90, 30 e 7 dias;
- credencial sem revisão há mais de 180 dias.

O aviso vai para o responsável pelo acesso e para quem o tem compartilhado. Para desligar,
vá em **Minha conta → Preferências → Notificações → Acessos e credenciais**.

## Acessos dentro do projeto

Um acesso pode ser vinculado a projetos. Na ficha do projeto, aba **Mais**, aparece
"Acessos relacionados" — mas só os que você já alcançaria no cofre. O projeto aponta para
a conta central; não existe uma segunda cópia da senha.

## Histórico

Cada acesso tem uma aba **Histórico** com o que aconteceu com ele: quem revelou, quem
copiou, quem alterou o cadastro ou o compartilhamento, e quando. Tentativa negada também
aparece.

Quem tem a permissão de auditoria vê o botão **Histórico** no topo da tela, com a trilha
de todo o cofre e filtros por pessoa, ação e data.

## Perguntas frequentes

**Esqueci a senha de um portal. Posso ver aqui?**
Se o acesso estiver compartilhado com você com permissão de credencial, sim. Senão, peça a
quem administra o cofre — a solicitação é o caminho, não há como contornar pela tela.

**Cadastrei e ninguém mais está vendo.**
Acesso novo nasce visível só para administradores. Use **Compartilhar** para liberar.

**Desativei um acesso por engano.**
Ele não é apagado, só sai das listas. Um administrador consegue restaurá-lo.

**A senha aparece em algum relatório ou exportação?**
Não. Ela não sai em listagem, exportação, e-mail nem no registro de auditoria — só na tela,
para quem tem permissão, no momento em que clica para revelar.
