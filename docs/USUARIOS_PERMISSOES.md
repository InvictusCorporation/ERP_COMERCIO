# Usuários e permissões — incremento 01.4

A administração fica em `/usuarios` e `/permissoes`, no mesmo layout do ERP: menu preto, seleção de empresa, indicadores escuros com acentos dourados, tabela e painel lateral. No celular a lista vira cartões e o editor fica abaixo. Busca, filtro de situação e paginação de cinco registros não alteram o escopo autorizado.

## Cadastrar uma pessoa

1. Entre como proprietário (ou perfil autorizado), conclua MFA e selecione a empresa.
2. Abra **Usuários e permissões → Novo usuário**. Informe nome, e-mail e perfil.
3. O convite é válido por sete dias. Novo convite para o mesmo e-mail substitui o anterior.
4. A pessoa abre o link, confere empresa/perfil e define a própria senha (12–128 caracteres).
5. Se a conta já existir, deve entrar com o e-mail convidado e reabrir o link para aceitar. O convite não troca senha, nome global, MFA ou vínculos existentes.
6. Perfil sensível precisa concluir MFA antes de administrar a empresa.

O administrador não conhece nem define a senha da equipe. Não há autoinscrição pública sem convite, senha padrão ou endpoint de bootstrap remoto. O token fica no fragmento do link, é removido da barra e mantido somente em memória. Recarregar a página exige abrir novamente o link original. O banco armazena somente o hash do token; a mensagem completa fica cifrada na outbox. Nenhum token aparece na resposta de cadastro do convite.

Convites pendentes podem ser revogados. Usados, vencidos, adulterados ou revogados são recusados. A autoridade atual do remetente é revalidada no aceite: suspender o remetente ou retirar sua capacidade de conceder o perfil invalida seus convites pendentes. A aceitação é transacional e serializada por empresa, inclusive em duas confirmações concorrentes.

## E-mail local e SMTP

O transporte existente atende recuperação e convites. Para desenvolvimento, `npm.cmd run auth:mail` consulta a última mensagem do e-mail informado em terminal interativo. Funciona também antes de a conta convidada existir. O comando exige banco local ativo e não expõe um endpoint de depuração.

SMTP real permanece sem configuração/homologação e nenhum e-mail externo foi enviado nesta entrega. Não interpretar “convite preparado” como confirmação de entrega pelo provedor. A interface registra a preparação; a outbox é responsável pelo envio/reentrega. Configuração privada em [Autenticação](AUTENTICACAO.md).

## Perfis e matriz de autorização

Cada vínculo possui um perfil na empresa selecionada. Não existe soma de permissões de empresas diferentes. Vínculos antigos sem perfil continuam sem permissões administrativas; proprietários antigos preservam a propriedade. Perfis padrão são criados por empresa na primeira consulta autorizada, sem popular o banco com equipe fictícia.

| Perfil padrão | Administração de usuários |
| --- | --- |
| Proprietário | Consulta, usuários/convites, perfis e gestão de proprietários; MFA obrigatório |
| Administrador | Consulta, usuários/convites e perfis; MFA obrigatório; não administra proprietários |
| Gerente | Consulta de equipe e perfis |
| Financeiro, Comprador, Estoquista, Operador de caixa, Vendedor, Conferente, Entregador | Sem acesso à administração de usuários |

Esses perfis comerciais identificam a função. Vendas, estoque, financeiro, compras e entregas ainda não possuem endpoints liberados; as permissões desses módulos serão adicionadas e testadas em suas etapas. O perfil Master Invictus não pode ser criado, convidado ou concedido por este módulo. A administração da plataforma SaaS permanece futura.

Perfis padrão são protegidos contra edição. Perfis personalizados podem combinar as permissões implementadas do catálogo, sujeitos ao limite de quem concede. A permissão de proprietário é reservada e não entra em perfil personalizado.

| Permissão | Ação |
| --- | --- |
| `users.read` | Consultar equipe e perfis; convites aparecem apenas para quem gerencia usuários |
| `users.manage` | Convidar/revogar e alterar perfil/situação de vínculos autorizados |
| `roles.manage` | Criar e editar perfis personalizados autorizados |
| `audit.read` | Consultar histórico autorizado, com MFA; escopo restrito permite somente eventos de unidades atribuídas |
| `organizations.read` | Consultar estrutura autorizada |
| `organizations.manage` | Gerenciar empresas e unidades com MFA e escopo global |
| `ownership.manage` | Convidar/alterar proprietários; exclusiva do proprietário |

`users.manage` e `roles.manage` exigem também `users.read`. Ninguém pode conceder ou editar um perfil mais privilegiado que o próprio. A exigência de MFA é persistida quando um vínculo ou perfil ganha administração; sua retirada não remove MFA já exigido/configurado. A política é conservadora para contas com vários vínculos.

Suspender um vínculo bloqueia a empresa nas próximas requisições e preserva os outros vínculos, a conta global e o histórico. Uma conta global inativa aparece suspensa e não pode ser reativada por um administrador de empresa. E-mail e nome global de contas existentes não são editáveis neste módulo: isso exige fluxo próprio de identidade.

O último proprietário ativo não pode ser suspenso ou rebaixado. Operações de propriedade usam lock transacional por empresa, impedindo que duas suspensões concorrentes removam ambos. Alterações de perfil são consultadas a cada requisição, sem depender de novo login ou das opções visíveis no navegador.

## Escopo atual e próximo incremento

O incremento 01.5 acrescenta escopo de toda a rede ou somente filiais/CDs/depósitos selecionados, em convites e vínculos existentes. Seletores e API revalidam os acessos atuais; administração global fica indisponível a vínculos restritos. Proprietários mantêm toda a rede. Guia e regras em [Empresas e unidades](EMPRESAS_UNIDADES.md).

## API e banco

Rotas `/api/v1/access`:

| Método / rota | Requisito |
| --- | --- |
| GET `overview` | Sessão completa, vínculo ativo e `users.read` |
| POST `invitations` | `users.manage` e concessão autorizada do perfil |
| POST `invitations/revoke` | `users.manage` e perfil do convite autorizado |
| POST `members/change` | `users.manage`, concessão atual/nova autorizada e proteção de proprietário |
| POST `roles/save` | `roles.manage`, permissões autorizadas e perfil personalizado |
| POST `invitations/preview` | Token válido, limite por IP, Origin e JSON |
| POST `invitations/accept` | Token válido e senha nova; para conta existente, sessão completa da pessoa convidada com CSRF |

Todas as mutações exigem Origin exata e JSON. Mutações autenticadas exigem CSRF. Tenant/ator vêm da sessão e não são aceitos no corpo. IDs alheios recebem a mesma resposta de registro ausente. Erros internos não revelam consultas ou valores.

Migração `004_access_control.sql` cria schema `access`, perfis, convites, eventos, FK composta de vínculo/perfil e destinatário da fila. Usa `invictus_auth`, que passa a inserir novas identidades e inserir/alterar vínculos; continua sem atualizar a identidade global ou escrever dados comerciais. `invictus_app` continua sem acesso ao schema de credenciais/administração. O contexto do pool é transacional, com RLS forçado em todos os recursos de acesso. O papel confiável do serviço de identidade estabelece contexto somente após validar sessão/vínculo. Autorização por ação fica no serviço, não é substituída pela RLS.

Eventos de acesso contêm empresa, ator, ação, alvo e data, na mesma transação da alteração; o papel da aplicação não pode apagá-los ou alterá-los. Falha no evento desfaz a alteração. Auditoria unificada com antes/depois, correlação, consulta e retenção continua em 01.6.

Decisões de autorização seguem [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): negar por padrão e verificar autorização em cada requisição. Evidências de implementação em [Testes](../TESTES.md).

## Histórico de acesso — 01.6

Alterações de vínculo, perfil, escopo e convite são capturadas atomicamente no histórico. Administrador padrão recebe `audit.read`; perfil personalizado precisa de concessão explícita e MFA. Auditor de filial não recebe dados de equipe, perfis ou convites fora de seu escopo de consulta. Segurança de outra conta não é visível por ser proprietário da rede. Guia em [Auditoria](AUDITORIA.md).

## Permissões comerciais 02.1 / 03.1

products.read/products.manage e stock.read/stock.manage integram o catálogo. Escrita de produto exige escopo global; movimentação pode ser limitada à filial. Escritas exigem MFA, inclusive no perfil personalizado, sem conceder poderes sobre pessoas/estrutura. Administrador recebe o módulo; demais perfis padrão permanecem sem ampliação automática. Consultas são dependências da escrita. Ver [Produtos e estoque](PRODUTOS_ESTOQUE.md).

## Fornecedores e compras

suppliers.read/manage e purchases.read/manage/approve/receive acrescentados ao catálogo. Gerenciar fornecedor exige escopo global; ações de compra podem ser restritas à filial, com MFA nas escritas. Recebimento requer stock.manage explicitamente e suas consultas; comprador não ganha aprovação/recebimento automaticamente. Guia e dependências em [Fornecedores e compras](FORNECEDORES_COMPRAS.md).
