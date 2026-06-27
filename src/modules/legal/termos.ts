/**
 * Fonte única de verdade do texto exibido e versionado em app dos Termos de Uso.
 *
 * O conteúdo aqui é o que o usuário lê na tela de aceite e o que é "hasheado"
 * como prova (SHA-256). Os arquivos em `docs/legal/*.md` são a versão rica/para
 * impressão e revisão jurídica — ao revisar com o advogado, replique a mudança
 * aqui E incremente `versao` (isso força o re-aceite de todos no próximo acesso).
 *
 * Módulo puro (sem `server-only`): a página (RSC) lê daqui e passa o texto como
 * prop para o formulário cliente. O hash é calculado no servidor (actions.ts).
 */

export type TipoTermo = "colaborador" | "cliente";

export type Termo = {
  versao: string;
  titulo: string;
  conteudo: string;
};

/** Deriva o termo aplicável pelo perfil: clientes do portal × demais (internos). */
export function tipoTermoPorRole(role: string): TipoTermo {
  return role === "cliente" ? "cliente" : "colaborador";
}

const COLABORADOR = `Termo de Uso e Consentimento — SenaHub (Colaboradores)
Versão 2026-06-23

Este Termo regula o acesso e o uso do sistema SenaHub ("Sistema") por colaboradores, estagiários, prestadores de serviço pessoa jurídica (PJ) e freelancers (em conjunto, "Usuário") de [RAZÃO SOCIAL COMPLETA], inscrita no CNPJ sob o nº [CNPJ], com sede em [ENDEREÇO COMPLETO — CIDADE/UF] ("Empresa").

Ao clicar em "Li e aceito", ou ao utilizar o Sistema, o Usuário declara que leu, compreendeu e concorda integralmente com este Termo.

1. OBJETO
1.1. O Sistema é uma ferramenta corporativa de gestão do escritório (ERP), de uso restrito e exclusivamente profissional, destinada à execução das atividades do Usuário e à gestão de projetos, documentos, ponto, financeiro, comercial e demais módulos disponibilizados.
1.2. O acesso é concedido de forma pessoal, intransferível e revogável, vinculado ao papel (perfil de acesso) atribuído ao Usuário.

2. CREDENCIAIS E RESPONSABILIDADE PELO ACESSO
2.1. As credenciais (login e senha) são pessoais e sigilosas. É vedado compartilhá-las, cedê-las ou permitir seu uso por terceiros.
2.2. O Usuário é responsável por todas as ações praticadas sob sua identificação, salvo comprovação inequívoca de uso fraudulento por terceiro.
2.3. O Usuário deve trocar a senha quando solicitado, adotar senha forte e comunicar imediatamente à Empresa qualquer suspeita de comprometimento, perda ou uso indevido de suas credenciais.

3. USO ACEITÁVEL E CONDUTA
3.1. O Sistema deve ser usado apenas para fins profissionais legítimos. É vedado:
(a) usar o Sistema para fins ilícitos, fraudulentos ou que violem direitos de terceiros;
(b) tentar contornar mecanismos de segurança, autenticação ou permissões; acessar dados ou módulos para os quais não tenha autorização;
(c) extrair, copiar ou exportar dados em massa sem autorização, ou para finalidade alheia ao trabalho;
(d) inserir conteúdo malicioso, automatizar acessos de forma não autorizada ou comprometer a estabilidade do Sistema;
(e) no chat e demais canais, praticar assédio, discriminação, ofensa ou qualquer conduta que viole a política interna e a dignidade dos demais.
3.2. O conteúdo lançado pelo Usuário (mensagens, anexos, comentários, lançamentos) é de sua responsabilidade e deve observar a legislação e as políticas internas.

4. MONITORAMENTO, REGISTRO E AUDITORIA
4.1. O Usuário está ciente e concorda que o Sistema é uma ferramenta de trabalho da Empresa e que, por essa natureza, não há expectativa de privacidade sobre os dados nele inseridos ou trafegados.
4.2. Para fins de segurança, conformidade, qualidade e apuração de responsabilidades, a Empresa registra e pode auditar, de forma proporcional:
(a) o histórico de ações (criação, alteração, exclusão de registros), com data, hora e autor (log de auditoria);
(b) as comunicações no chat corporativo e demais canais internos do Sistema, que não são privadas e podem ser acessadas pela Empresa;
(c) os registros de ponto eletrônico, inclusive metadados como data, hora, dispositivo e, quando aplicável, localização/endereço de rede da marcação.
4.3. O monitoramento se limita às ferramentas corporativas e às finalidades acima; não alcança a esfera estritamente privada do Usuário fora do Sistema.

5. PONTO ELETRÔNICO E JORNADA (aplicável a CLT e estagiários)
5.1. Para colaboradores CLT e estagiários, o registro eletrônico de ponto no Sistema é o registro oficial da jornada. O Usuário deve registrar suas marcações de forma fiel e tempestiva.
5.2. Quando a conexão estiver indisponível, marcações podem ser feitas offline e sincronizadas posteriormente; o Usuário reconhece que a data/hora considerada é a do momento da marcação.
5.3. A inserção de informação falsa no ponto (marcação por terceiro, adulteração de horário) é falta grave, sujeita às medidas cabíveis. Banco de horas, escalas e compensações seguem a política interna e a legislação aplicável.

6. CONFIDENCIALIDADE E SIGILO
6.1. O Usuário terá acesso a informações confidenciais — dados de clientes, projetos, licitações, propostas, valores, dados financeiros e pessoais de terceiros — e se obriga a:
(a) mantê-las em sigilo e usá-las apenas para o exercício de suas funções;
(b) não divulgar, copiar ou repassar tais informações a terceiros sem autorização expressa;
(c) não as utilizar em proveito próprio ou de concorrentes.
6.2. A obrigação de confidencialidade subsiste após o término do vínculo, por prazo indeterminado quanto a segredos de negócio, na forma da legislação.

7. PROPRIEDADE INTELECTUAL
7.1. Projetos, plantas, pranchas, memoriais, cálculos, modelos BIM, documentos e demais entregáveis produzidos com uso do Sistema, no âmbito das atividades para a Empresa, têm seus direitos patrimoniais titularizados pela Empresa e/ou pelo cliente, conforme o respectivo contrato.
7.2. Ficam ressalvados os direitos morais de autor (inalienáveis, na forma da Lei nº 9.610/1998) e a responsabilidade técnica (ART/RRT junto a CREA/CAU), que são pessoais do profissional e não se confundem com a titularidade patrimonial da obra.
7.3. O Usuário não adquire qualquer direito sobre o software do Sistema, marcas ou conteúdos da Empresa pelo simples uso.

8. PROTEÇÃO DE DADOS PESSOAIS (LGPD — Lei nº 13.709/2018)
8.1. A Empresa como controladora dos dados do Usuário.
8.1.1. A Empresa trata dados pessoais do Usuário (identificação, contato, documentos, dados bancários, dados de jornada, entre outros) para finalidades como gestão do vínculo, folha, ponto, comunicação e cumprimento de obrigações legais.
8.1.2. As bases legais incluem, conforme o caso, a execução de contrato, o cumprimento de obrigação legal/regulatória e o legítimo interesse — e, somente quando necessário, o consentimento (por exemplo, contato de emergência, uso de imagem). Para dados tratados com base em contrato ou obrigação legal, o tratamento independe de consentimento.
8.1.3. Os dados são retidos pelos prazos legais aplicáveis e protegidos por medidas de segurança.
8.1.4. O Usuário, como titular, pode exercer os direitos da LGPD (acesso, correção, portabilidade, informação sobre compartilhamento e, quando cabível, eliminação) junto ao Encarregado: [NOME/E-MAIL DO ENCARREGADO (DPO)].
8.2. O Usuário como agente de tratamento de dados de terceiros.
8.2.1. Ao manusear, no Sistema, dados pessoais de clientes e terceiros, o Usuário atua em nome da Empresa e deve: tratá-los apenas para finalidades de trabalho, observar a confidencialidade e a segurança, e não realizar tratamentos não autorizados (extração, compartilhamento externo etc.).
8.3. Consentimento específico.
8.3.1. Quando este aceite servir de base de consentimento (itens marcados como tal), o Usuário o faz de forma livre, informada e inequívoca, podendo revogá-lo a qualquer tempo, ressalvados os tratamentos amparados em outra base legal.

9. SEGURANÇA DA INFORMAÇÃO
9.1. O Usuário deve zelar pela segurança dos dispositivos que usa para acessar o Sistema, não deixar sessões abertas em equipamentos compartilhados e comunicar incidentes de segurança assim que tomar conhecimento.

10. DISPONIBILIDADE E ISENÇÃO
10.1. A Empresa empreenderá esforços razoáveis para manter o Sistema disponível, sem garantia de funcionamento ininterrupto ou livre de falhas. Poderão ocorrer manutenções, indisponibilidades e ajustes. Backups e retenção seguem a política interna.

11. DESCUMPRIMENTO
11.1. O descumprimento deste Termo pode acarretar suspensão ou revogação do acesso, adoção das medidas disciplinares cabíveis conforme a política interna e a relação jurídica do Usuário, sem prejuízo da responsabilização civil e criminal aplicável.

12. VIGÊNCIA, ALTERAÇÕES E ENCERRAMENTO
12.1. Este Termo vigora enquanto o Usuário tiver acesso ao Sistema.
12.2. A Empresa pode atualizá-lo; novas versões exigem novo aceite, e o acesso pode ser condicionado à concordância com a versão vigente. A recusa implica a impossibilidade de uso do Sistema.
12.3. Encerrado o vínculo, o acesso é revogado. As obrigações de confidencialidade (cláusula 6) e de propriedade intelectual (cláusula 7) subsistem ao término.

13. LEI APLICÁVEL E FORO
13.1. Este Termo é regido pela legislação brasileira. Fica eleito o foro da comarca de [COMARCA — CIDADE/UF], sem prejuízo de competências legais específicas (ex.: Justiça do Trabalho para temas trabalhistas).

14. ACEITE ELETRÔNICO
14.1. O Usuário reconhece a validade jurídica do aceite eletrônico deste Termo (MP nº 2.200-2/2001 e Lei nº 12.965/2014 — Marco Civil da Internet).
14.2. O aceite é registrado com data, hora, versão do Termo, identificação do Usuário, endereço IP e agente de navegação, que servem como prova da manifestação de vontade.

Ao clicar em "Li e aceito", declaro que li, compreendi e concordo com este Termo de Uso e Consentimento, na versão 2026-06-23.`;

const CLIENTE = `Termo de Uso e Consentimento — Portal do Cliente (SenaHub)
Versão 2026-06-23

Este Termo regula o acesso ao Portal do Cliente do sistema SenaHub ("Portal") por representantes de clientes ("Usuário") de [RAZÃO SOCIAL COMPLETA], CNPJ [CNPJ], com sede em [ENDEREÇO — CIDADE/UF] ("Empresa").

Ao clicar em "Li e aceito", ou ao utilizar o Portal, o Usuário declara que leu, compreendeu e concorda com este Termo.

1. OBJETO
1.1. O Portal é um ambiente de acompanhamento disponibilizado ao cliente para visualizar informações de seus projetos, documentos, marcos e comunicações relacionadas aos serviços contratados.
1.2. O acesso é pessoal, intransferível e revogável, vinculado ao cliente que o Usuário representa.

2. CREDENCIAIS E RESPONSABILIDADE
2.1. As credenciais são pessoais e sigilosas; é vedado compartilhá-las. O Usuário é responsável pelas ações praticadas sob seu acesso e deve comunicar imediatamente qualquer uso indevido.

3. USO ACEITÁVEL
3.1. O Portal deve ser usado apenas para acompanhar os projetos e serviços do próprio cliente. É vedado tentar acessar dados de terceiros, contornar mecanismos de segurança ou usar o Portal para fins ilícitos.

4. ESCOPO, LIMITAÇÕES E NATUREZA DAS INFORMAÇÕES
4.1. As informações exibidas no Portal têm caráter informativo e de acompanhamento. Em caso de divergência, prevalecem os documentos oficiais e o contrato de prestação de serviços firmado entre as partes.
4.2. Eventuais aceites de marcos/entregas registrados no Portal produzem os efeitos contratuais definidos no contrato de prestação de serviços.
4.3. A Empresa empreenderá esforços razoáveis para manter o Portal disponível, sem garantia de funcionamento ininterrupto, podendo haver manutenções e indisponibilidades.

5. CONFIDENCIALIDADE
5.1. As informações acessíveis pelo Usuário são confidenciais e destinadas exclusivamente ao cliente, que deve protegê-las e não divulgá-las indevidamente a terceiros.

6. PROPRIEDADE INTELECTUAL
6.1. Os projetos, documentos e entregáveis acessíveis pelo Portal permanecem regidos pelo contrato de prestação de serviços. O acesso ao Portal não transfere direitos de propriedade intelectual nem autoriza usos além dos previstos em contrato.

7. PROTEÇÃO DE DADOS PESSOAIS (LGPD — Lei nº 13.709/2018)
7.1. A Empresa, na qualidade de controladora, trata dados pessoais do representante do cliente (como nome, e-mail, telefone e dados de acesso) para as finalidades de viabilizar o acesso ao Portal, comunicar-se sobre os projetos e cumprir o contrato e obrigações legais.
7.2. As bases legais incluem, conforme o caso, a execução do contrato, o cumprimento de obrigação legal e o consentimento, quando aplicável.
7.3. O titular pode exercer os direitos previstos na LGPD (acesso, correção, eliminação quando cabível, informação sobre compartilhamento) junto ao Encarregado: [NOME/E-MAIL DO ENCARREGADO (DPO)].
7.4. Os dados são retidos pelos prazos legais/contratuais aplicáveis e protegidos por medidas de segurança.

8. DESCUMPRIMENTO
8.1. O descumprimento deste Termo pode acarretar a suspensão ou revogação do acesso ao Portal, sem prejuízo das medidas legais cabíveis e do disposto no contrato de prestação de serviços.

9. VIGÊNCIA, ALTERAÇÕES E ENCERRAMENTO
9.1. Este Termo vigora enquanto o Usuário tiver acesso ao Portal. A Empresa pode atualizá-lo; novas versões exigem novo aceite. O acesso pode ser encerrado ao término da relação contratual ou por solicitação das partes.

10. LEI APLICÁVEL E FORO
10.1. Regido pela legislação brasileira; foro da comarca de [COMARCA — CIDADE/UF], sem prejuízo do foro eventualmente eleito no contrato de prestação de serviços.

11. ACEITE ELETRÔNICO
11.1. O Usuário reconhece a validade jurídica do aceite eletrônico (MP nº 2.200-2/2001 e Lei nº 12.965/2014). O aceite é registrado com data, hora, versão, identificação, IP e agente de navegação.

Ao clicar em "Li e aceito", declaro que li, compreendi e concordo com este Termo, na versão 2026-06-23.`;

export const TERMOS: Record<TipoTermo, Termo> = {
  colaborador: {
    versao: "2026-06-23",
    titulo: "Termo de Uso e Consentimento — Colaboradores",
    conteudo: COLABORADOR,
  },
  cliente: {
    versao: "2026-06-23",
    titulo: "Termo de Uso e Consentimento — Portal do Cliente",
    conteudo: CLIENTE,
  },
};
