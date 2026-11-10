# Auditoria unificada e histórico — 01.6

A tela `/auditoria` reúne o histórico autorizado em **Histórico da rede** e **Minha segurança**, mantendo o visual preto, branco e dourado do ERP. Lista, filtros, comparação e detalhe são responsivos; a navegação por teclado continua incluindo o fechamento e retorno do menu móvel.

## Consultar alterações

1. Entre com sessão completa e escolha a rede de acesso.
2. Abra **Auditoria e histórico**. Proprietário/administrador veem a rede. Qualquer conta autenticada pode consultar a própria segurança.
3. Filtre por categoria, responsável, filial/unidade, período ou texto do registro. Datas representam dias completos no horário de Fortaleza (UTC−3).
4. Selecione um evento para conferir responsável, data e os campos modificados, com valores **Antes** e **Depois**.
5. Use **Ver eventos da mesma operação** para reunir os registros de uma mesma requisição, por exemplo empresa e matriz criadas juntas. Cada registro desse grupo continua sujeito à autorização atual.

Os indicadores contam somente eventos autorizados que atendem aos filtros. A paginação permite 10, 20 ou 50 eventos, com limite de 1.000 páginas; para históricos maiores, refine período, registro ou operação. A ordenação é decrescente por data e ID. Novos eventos concorrentes podem deslocar páginas; não é uma exportação de fotografia fixa do banco. Não há exportação ou edição em massa nesta versão.

## O que é registrado

| Origem | Conteúdo do histórico |
| --- | --- |
| Empresas e unidades | Cadastro e alteração de campos legais, nomes, contato/localização e situação; vínculos legíveis no momento do evento |
| Usuários/vínculos | Criação, perfil, propriedade, situação e acesso global |
| Escopo por filial | Concessão/remoção de cada unidade, ligada à mesma operação do vínculo/convite |
| Perfis personalizados | Nome e lista de permissões anteriores/posteriores |
| Convites | Nome/e-mail, perfil, escopo global, validade, aceite e revogação; nenhuma cópia do token |
| Segurança pessoal | Senha validada/recusada, saída, encerramento de sessões, recuperação solicitada/concluída e MFA ativado/verificado |
| Contexto pessoal | Mudança/limpeza de rede e unidade da própria sessão |

Somente campos permitidos são copiados. Senhas, hashes, tokens e identificadores de sessão, cookies, cabeçalhos, corpo da requisição, strings de conexão, chaves, segredo/código MFA e conteúdo cifrado da outbox não são incluídos. Nomes, contatos empresariais e dados cadastrais presentes nas alterações permanecem dados pessoais/empresariais de acesso controlado.

O nome do responsável e o rótulo do registro são preservados no momento do evento. Uma mudança posterior do nome não reescreve o passado. Antes/depois é a comparação dos campos cadastrados, não um mecanismo de restauração. A criação mostra somente valores posteriores; uma remoção de atribuição mostra os anteriores.

Salvar os mesmos valores não gera alteração fictícia por causa de `updated_at`. A revisão de escopo usa diferença de conjuntos, sem revogar/reconceder unidades inalteradas; reordenar as mesmas permissões também não cria alteração. A criação automática de perfis padrão não polui a linha do tempo. Atualizações de atividade da sessão não criam eventos; a correção automática do contexto gera evento apenas quando rede/unidade realmente mudam.

Inativação de uma empresa ou unidade registra a mudança no próprio cadastro. Efeitos derivados sobre disponibilidade dos descendentes não geram um evento artificial para cada filho. Um auditor restrito não recebe o evento de um superior que esteja fora de seu escopo; o administrador global pode examinar a causa na hierarquia.

`login_succeeded` significa **senha validada**, não conclusão do MFA. Os eventos de ativação/verificação de duas etapas registram essa conclusão separadamente. Solicitação de recuperação e senha incorreta são atos não autenticados: o responsável aparece como **Não autenticado**, sem atribuí-los falsamente ao dono da conta. Tentativas sem conta identificada são preservadas no banco, sem listagem pública ou consulta por administradores de rede.

## Autorização e privacidade

A permissão `audit.read` habilita o histórico da rede e exige MFA quando concedida. Proprietário possui todas as permissões; o perfil padrão Administrador recebe consulta de auditoria. Perfis personalizados anteriores não recebem acesso automaticamente. Gerente e perfis operacionais não recebem auditoria da rede por padrão.

| Acesso atual | Consulta permitida |
| --- | --- |
| Proprietário/administrador ou perfil com `audit.read`, escopo global | Eventos da rede selecionada, incluindo cadastros, usuários, perfis e convites |
| Perfil com `audit.read`, limitado a unidades | Eventos dos cadastros de unidades explicitamente atribuídas; sem usuários, perfis, convites, empresas ou outras unidades |
| Conta autenticada sem `audit.read` | Somente **Minha segurança** |

A permissão `audit.read` pode permanecer em um vínculo restrito e não concede administração global. O histórico de uma unidade inativa continua consultável se a atribuição e o vínculo do auditor continuam válidos; isso não libera a operação dessa unidade. Retirar a atribuição ou suspender o vínculo afeta lista, detalhe, opções e contagens nas consultas seguintes, sem novo login.

Eventos globais da conta não são copiados para todas as redes em que a pessoa participa. Um administrador não recebe o histórico de login/recuperação de outro usuário, mesmo que ambos participem da mesma rede. **Minha segurança** continua disponível à conta ativa com sessão completa mesmo sem vínculo de rede ativo.

Não são aceitos tenant/ator enviados no filtro. A identidade vem da sessão. IDs ausentes e eventos fora do acesso têm a mesma resposta 404; contagens e listas de responsáveis/unidades são filtradas pelas mesmas políticas. Identificadores de operação aleatórios não autorizam consulta fora do escopo. O contador interno de transações PostgreSQL não é exposto por HTTP.

## Integridade e correlação

Triggers no banco capturam as alterações dentro da mesma transação do recurso. Uma falha na auditoria provoca rollback, incluindo empresa/matriz, alteração de acesso e redefinição de senha. Eventos antigos de segurança continuam sendo gravados e alimentam o histórico unificado; os registros operacionais antigos de acesso são mantidos, sem duplicar o mesmo ato na lista nova.

Cada requisição recebe um UUID gerado pelo servidor, devolvido em `X-Request-Id`. Um header enviado pelo cliente não substitui esse identificador. O contexto assíncrono leva o mesmo UUID às transações relacionadas, sem copiar os demais dados da requisição. Operações simultâneas não compartilham ator/correlação.

Registros produzidos por scripts ou SQL de manutenção sem identidade de usuário aparecem como **Processo interno**. Podem não ter identificador de requisição. O histórico não alega autenticação humana onde ela não existiu.

A conta HTTP tem somente SELECT em `audit.events`. Não recebe INSERT, UPDATE, DELETE, TRUNCATE ou EXECUTE nas funções de captura. A escrita ocorre pelos triggers definer com `search_path` fixo. RLS é forçada e separa rede, unidade e histórico pessoal. O papel comercial não tem leitura da auditoria. A verificação de papel do serviço recusa ausência de RLS ou desativação dos triggers de captura.

Essas proteções se aplicam às contas da aplicação. Administradores privilegiados do banco/infraestrutura continuam tendo poderes administrativos; não há assinatura criptográfica, arquivo externo imutável ou garantia de resistência a um administrador do PostgreSQL nesta entrega.

## Histórico anterior e migrações

- `006_unified_audit.sql`: catálogo `audit.read`, tabela com índices/RLS, funções e nove triggers de captura; importação dos eventos antigos de identidade e estrutura de importação de acesso.
- `007_legacy_audit_import.sql`: política de leitura exclusiva do migrador na tabela legada de acesso, que também usa FORCE RLS, e importação idempotente por origem.

Aplique essas migrações com a API parada, conforme o fluxo local de atualização. Os registros anteriores mantêm a data/ação original e recebem **Histórico anterior**. Não é possível recuperar antes/depois ou uma correlação inexistente; esses campos ficam vazios. Nomes disponíveis na migração não devem ser interpretados como prova de uma identidade histórica que a fonte antiga não registrou. As migrações já aplicadas permanecem intactas, com checksums verificados.

## Retenção e limites

Os registros são preservados sem expiração ou exclusão automática. Não há endpoint nem botão de exclusão. A política definitiva de retenção/arquivamento, backup, acesso de suporte e eventual eliminação controlada precisa ser definida para a infraestrutura de produção; nenhum prazo legal foi presumido e nenhum histórico foi apagado.

O módulo cobre os fluxos de identidade, acesso e organização atualmente implementados. Não registra conteúdos arbitrários de tabelas internas, todos os GETs, todas as recusas HTTP ou operações comerciais ainda ausentes. Novos módulos precisam declarar sua captura e testar segredo/escopo/rollback; não existe auditoria comercial ou monitoramento global de Master nesta versão.

## API e validação

- GET `/api/v1/audit/events`: `scope=network|personal`, filtros `category`, `action`, `actor`, `unitId`, `entityId`, `requestId`, `from`, `to`, `query`, `page` e `pageSize`.
- GET `/api/v1/audit/events/:id`: mesmo escopo e autorização, evento individual.

Datas reais, UUIDs, categoria/ação e limites são validados. Texto é parâmetro SQL e curingas são tratados literalmente. Não existem rotas de escrita/exclusão.

Evidências locais em [Testes](../TESTES.md). Orientações de implementação: [OWASP — Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), sobre dados excluídos, correlação e proteção do histórico.

## CI preparada

O workflow [Verificações da fundação](../.github/workflows/ci.yml) prepara PostgreSQL descartável no runner e executa instalação, testes unitários, integração, Chromium, interface, build e tipagem. Usa permissões de repositório somente para leitura e uma senha explicitamente temporária de banco de CI, sem reutilizar segredos locais. Não publica o produto nem envia arquivos privados/capturas.

A configuração foi preparada e teve sintaxe conferida; não foi executada no GitHub nem homologada em Linux nesta máquina Windows. O envio do repositório continua sem autorização de publicação. Referências: [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) e [PostgreSQL em GitHub Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## Fontes de produtos e estoque

Incrementos 02.1/03.1 acrescentam categorias products e inventory: cadastro/preço/inativação do produto, limites da unidade e movimentos confirmados. Produto central é evento global da rede; estoquista/auditor restrito recebe somente eventos com unidade atribuída conforme audit.read. Movimentos preservam deltas, fator e saldos após confirmação, com responsável e correlação. Captura é atômica e não altera eventos anteriores. Guia em [Produtos e estoque](PRODUTOS_ESTOQUE.md).

## Fornecedores e compras

Categorias suppliers e purchases capturam cadastro/inativação, rascunho, aprovação, cancelamento, recebimento e estorno com snapshots permitidos. Eventos de pedido/recebimento têm unidade, responsável e correlação com as entradas de estoque; fornecedor central exige escopo global na auditoria. Falha posterior aos movimentos reverte o recebimento inteiro. Guia em [Fornecedores e compras](FORNECEDORES_COMPRAS.md).

## Setores, pesagem e produção — 09.1

Seis novas fontes na categoria Estoque: sector, weighed_product, scale, weighing, recipe e production. Capturas transacionais incluem configuração/versionamento, bruto/tara/líquido e snapshot da pesagem, ficha/insumos/rendimento, custo e reversão da produção. Falha de auditoria reverte também as alterações de estoque/lotes. Eventos de lote identificam consumo e saída de produção e suas contrapartidas. Históricos preservam os registros originais; consulta continua sujeita ao escopo atual da filial. Guia em [Setores, pesagem e produção](SETORES_PESAGEM_PRODUCAO.md).

## Rede e distribuição — 10.1

Transferências geram captura transacional nas duas pontas, com mesma entidade e correlação da solicitação. Cada unidade consulta o histórico no escopo atual. Compra central registra plano e distribuição na central; movimentos e eventos de lote preservam a origem. Falha de auditoria reverte expedição ou recebimento inteiro. Guia em [Rede e distribuição](REDE_DISTRIBUICAO.md).

## Integração com clientes — 11.1

Categoria customers com seis fontes adicionais e remoção de documento/contato/endereço do snapshot; lista de campos alterados conserva evidência de mudanças protegidas. Veja [Clientes, pedidos e entregas](CLIENTES_PEDIDOS_ENTREGAS.md).

## Indicadores e relatórios — 12.1

Exportação gerencial é registrada com contexto e quantidade; falha de auditoria impede entregar o arquivo. Consultas comuns não alteram dados comerciais. Veja [Relatórios e indicadores](RELATORIOS_INDICADORES.md).
