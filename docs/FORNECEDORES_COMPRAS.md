# Fornecedores e compras — 02.2 / 04.1

Incremento local de cadastro central de fornecedores e ciclo manual da compra por unidade. Integra fundação, produtos, estoque e auditoria existentes. A etapa 04 completa segue em evolução: este fluxo ainda não importa XML, emite documento fiscal, faz pagamento ou gera conta a pagar.

## Operação

1. Em /fornecedores, cadastre razão social, nome fantasia, CNPJ, inscrição estadual, contato, e-mail, telefone, endereço, prazo de entrega e condições de pagamento. CNPJ numérico/alfanumérico é validado por formato e dígitos, sem consulta externa. O CNPJ fica permanente; mudanças de identidade exigem outro cadastro. Atualizações usam versão otimista; inativação conserva os pedidos.
2. Em /compras, selecione uma unidade autorizada e um fornecedor ativo. Inclua até 50 produtos distintos; informe quantidade, custo por unidade informada e se a quantidade é em embalagem. Cadastros sem barras também são selecionáveis por nome/código.
3. Informe frete, despesas adicionais e desconto; previsão e observações são opcionais. Salvar cria rascunho e não movimenta estoque. Identidade do fornecedor e unidade não mudam após criar o pedido; para outra origem/destino, crie outro rascunho. Editar o rascunho atualiza seus itens e lê novamente o catálogo/fator. A tela bloqueia aprovação enquanto há alterações locais sem salvar.
4. Quem tem purchases.approve aprova o pedido salvo. Isso congela os valores e fatores aprovados e ainda não cria saldo disponível. Mesmo se o catálogo mudar depois, o recebimento usa a conversão do pedido. A mesma pessoa pode criar e aprovar se tiver ambas as permissões; não foi imposta segregação obrigatória entre pessoas.
5. Na aba Receber, informe apenas quantidades fisicamente conferidas, na unidade de compra do pedido. A opção de preencher pendências é explícita. Referência do recebimento e observação são obrigatórias. Há recebimento parcial e integral; excesso, item estranho/repetido, precisão inválida ou versão desatualizada são recusados.
6. Confirmar gera recebimento, movimentos de entrada vinculados, atualização de saldo/custo médio, novo estado do pedido e auditoria na mesma transação. Compras e estoque persistem por unidade; aprovação não conta como mercadoria disponível.
7. A aba Histórico mostra recebimentos paginados de 20 em 20, data em Fortaleza, referência interna, responsável, quantidade/fator, quantidade-base e custo total. No estoque, uma entrada de compra indica sua origem e orienta consultar a compra para estorno.

Referência do recebimento é texto interno: pode ser o número de um documento ou controle de conferência. Não há validação de chave/numeração de NF-e, integração fiscal, verificação de assinatura/XML ou prova de autorização fiscal nesta entrega.

## Estados e correções

| Estado                | Operações disponíveis                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| Rascunho              | Editar por versão, aprovar ou cancelar com motivo; sem estoque.                      |
| Aprovado              | Receber parcialmente/integralmente ou cancelar se não houver recebimento confirmado. |
| Recebido parcialmente | Receber saldo restante; não cancelar ou editar valores.                              |
| Recebido              | Consultar o histórico; não receber além do pedido.                                   |
| Cancelado             | Histórico preservado, sem reabertura ou recebimento.                                 |

Estorno é pela compra, com motivo e chave própria. Requer que cada entrada envolvida ainda seja o último movimento original do produto/unidade, com produto e unidade ativos. Não estorna consumo, reserva ou movimentos posteriores retroativamente. Se um item falhar, todo o estorno é revertido, inclusive os itens anteriores, saldo, custo, estado e eventos. A entrada original permanece; cada estorno cria movimento novo e marca o recebimento. Quantidades/valores recebidos do pedido voltam ao saldo pendente.

Depois de um estorno, a linha de estorno passa a ser o último movimento de estoque; isso pode impedir estornar recebimentos mais antigos. Não há estorno de estorno, recalculadora retroativa ou correção livre de custo por esta interface. Correções que dependam de mercadorias já consumidas precisam de processo próprio em próximo incremento. Estorno isolado da entrada pela API/tela manual de estoque é recusado para não desalinhar o pedido.

Pedido com fornecedor/produto inativo não pode ser criado/aprovado/recebido conforme a etapa; unidade e hierarquia precisam continuar disponíveis. Reativar exige os acessos cadastrais adequados. Histórico cadastral e eventos permanecem preservados. Na consulta operacional, unidade inativa não libera pedidos/recebimentos; a auditoria segue suas regras de leitura histórica.

## Custo e arredondamento

Cálculos de saldo/rateio usam PostgreSQL numeric e valores decimais em texto na API comercial. Quantidades têm três casas; custo unitário e valor do estoque usam seis. Frete/despesas/desconto têm duas. Valor inicial do item = quantidade de compra × custo por unidade de compra, arredondado a seis casas. A quantidade-base é quantidade × fator preservado; fração não representável em três casas é recusada.

Frete + despesas − desconto são rateados proporcionalmente ao valor inicial de cada item. Quando todos os valores iniciais são zero, o peso é a quantidade-base. Rateio cumulativo e último item conservam exatamente o total, sem resíduos ou linhas negativas por arredondamento. Desconto não pode tornar o pedido negativo. Entradas gratuitas são permitidas; não há preço de custo fictício atribuído automaticamente.

Em recebimento parcial, o valor conferido é a diferença entre o valor proporcional acumulado até a quantidade recebida e o que já foi recebido. A última parcela absorve o saldo exato. O movimento vinculado usa o total exato aprovado/conferido; não multiplica uma estimativa de custo unitário arredondado para reconstruir o valor. O custo unitário exibido/último custo continua arredondado a seis casas como referência, sem substituir o valor total de estoque.

Exemplos testados: 100 a 3 e 100 a 4 resultam em 200 unidades, valor 700 e custo médio 3,50. Uma embalagem de 10 é recebida pelo fator aprovado mesmo se o catálogo passar a 20 depois. Itens de 1 e 3 com frete 0,01 recebem valores 1,0025 e 3,0075. Entregas fracionadas conservam o total até a sexta casa.

Conferência registra os custos previamente aprovados. Divergência de preço/frete exige revisar antes de aprovar ou cancelar/recriar se ainda não houver recebimento; a interface não aceita alterar o custo no momento da chegada. Revisão de pedido já aprovado com entregas e fechamento de saldo não entregue serão fluxos próprios.

Após receber, o serviço compara o custo médio atual da unidade com preço de venda e a maior das margens desejada/mínima. Preço não definido ou margem abaixo do objetivo gera aviso e sugestão: custo médio / (1 − objetivo/100), arredondada para cima ao centavo. É referência gerencial; tributos, taxas e demais despesas comerciais não estão integrados. Somente um usuário com products.manage e escopo global pode aprovar outro preço no cadastro. Não há alteração automática de preço nem lucro de venda realizado nesta operação.

Entradas de API limitam campos numéricos a nove algarismos inteiros; itens convertidos ficam limitados a 999999999999,999 unidades-base por linha por compatibilidade com o ledger. A API aceita ponto decimal; a interface também normaliza vírgula decimal, sem separador de milhar.

## Permissões

| Permissão         | Alcance e dependências                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| suppliers.read    | Catálogo central da rede; não concede acesso aos pedidos de outras unidades.                                    |
| suppliers.manage  | Cadastro/inativação central; exige suppliers.read, escopo global e MFA.                                         |
| purchases.read    | Pedidos, recebimentos e indicadores das unidades autorizadas; exige suppliers.read e products.read.             |
| purchases.manage  | Rascunhos e cancelamento sem recebimento; exige purchases.read e MFA.                                           |
| purchases.approve | Aprovação nas unidades autorizadas; exige purchases.read e MFA.                                                 |
| purchases.receive | Recebimento/estorno nas unidades autorizadas; exige purchases.read, stock.manage e suas consultas, além de MFA. |

Receber envolve escrita de estoque: o perfil deve receber stock.manage explicitamente, com stock.read/products.read. Esse perfil também pode executar os movimentos manuais permitidos por stock.manage; compras não concede essa autorização de forma implícita. Proprietário/Administrador recebem o módulo. Demais perfis padrão e personalizados não foram ampliados automaticamente. Administrador restrito mantém ações locais de compra/estoque, mas perde gerência central de fornecedores/produtos/pessoas/estrutura.

A cada ação a API reavalia sessão completa, conta/vínculo, rede, permissões e unidade disponível. Escopo não herda filiais/depósitos automaticamente nem soma vínculos de outras redes. Usuário comprador sem approve/receive não executa essas ações; conferente sem manage não edita rascunhos. Suspensão/revogação afeta a próxima requisição. Frontend é apresentação, não fronteira de segurança.

## Persistência, idempotência e auditoria

Três tabelas purchasing têm RLS forçada e FKs compostas: suppliers, orders e receipts. O papel HTTP tem escrita cadastral limitada em suppliers, somente leitura direta em orders/receipts e EXECUTE em funções de domínio que reavaliam autorização/unidade. Não pode apagar cadastros/pedidos/recibos. Papel invictus_app continua sem acesso ao esquema. Funções usam search_path fixo e fontes qualificadas; autor vem do contexto autenticado.

A transação de acesso existente serializa operações da rede; pedidos têm lock e versão. Criação de rascunho e recebimento usam requestKey UUID único por rede, comparado com o conteúdo original. Repetição igual retorna o mesmo registro; conteúdo diferente é conflito. Editar um rascunho exige versão atual. Aprovação/cancelamento têm repetição controlada por estado, versão e motivo. Estorno usa chave e motivo próprios. Identificadores não são autorização.

O formulário conserva a confirmação quando uma resposta falha, e gerar outro conteúdo gera nova chave. Fechar/recarregar a página não mantém uma fila offline: confira o histórico antes de iniciar outra confirmação. Repetir um recebimento já estornado não o reativa; continua o mesmo registro histórico. Não há exclusão para corrigir duplicatas.

Fornecedor, nome/código/unidade do produto, fator, preço de compra e responsável ficam preservados no histórico. Renomear fornecedor ou mudar embalagem/preço atual não reescreve pedidos aprovados/recebimentos. Novas categorias suppliers/purchases integram /auditoria; captura de fornecedores, pedidos e recibos é atômica com as alterações e respeita escopo global/unidade. Credenciais não integram snapshots. Referências de recebimento e observações são dados comerciais informados pelo operador.

Recebimento e seus movimentos compartilham correlação da requisição. O verificador de autenticação agora exige 18 tabelas com RLS forçada e 15 triggers de captura ativos. Uma falha na auditoria posterior aos movimentos também reverte todo o recebimento.

## API

Prefixo /api/v1/purchasing. Sessão completa e cache desabilitado; POST exige Origin e CSRF, com listas estritas de campos. Rede e responsável vêm da sessão.

| Rota                   | Uso                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET suppliers          | Busca literal nome/CNPJ/contato, situação e página; 20 por página.                                                                                                                          |
| GET suppliers/:id      | Cadastro da rede autorizada.                                                                                                                                                                |
| POST suppliers/save    | Criação/edição versionada; CNPJ permanente.                                                                                                                                                 |
| GET options            | Fornecedores/produtos ativos por busca (até 100 opções) e unidades disponíveis autorizadas.                                                                                                 |
| GET orders             | Pedidos e indicadores autorizados, busca por número/fornecedor, situação/unidade/fornecedor e página; 20 por página. Unidade da sessão é padrão; sem seleção, somente unidades autorizadas. |
| GET orders/:id?page=0  | Pedido congelado e recebimentos paginados; total e página incluídos.                                                                                                                        |
| POST orders/save       | Criação idempotente/edição de rascunho, até 50 produtos distintos.                                                                                                                          |
| POST orders/transition | Aprovação ou cancelamento por versão.                                                                                                                                                       |
| POST receipts          | Conferência parcial/integral por versão e chave idempotente.                                                                                                                                |
| POST receipts/reverse  | Estorno transacional do recebimento, com motivo/versão/chave.                                                                                                                               |

Páginas de listas/histórico vão de 0 a 1000. Busca de opções precisa ser refinada para localizar cadastros fora das primeiras 100 opções. A tela de fornecedor mostra até 20 pedidos recentes do acesso/unidade atual. Histórico de compra de um produto pode ser acompanhado nos movimentos vinculados e no pedido; comparador entre fornecedores e consultas específicas de 30/60/90 dias ainda serão incrementos próprios.

## Migrações e atualização

010 acrescenta o módulo, permissões, políticas e ponte de estoque; 011 corrige uma colisão entre variável e coluna na captura de auditoria detectada no primeiro banco de teste, preservando 010 imutável. Migrações 001–009 permanecem inalteradas. Com API/interface paradas, inicie o PostgreSQL local, execute npm.cmd run db:migrate e reinicie a aplicação. Nenhuma conta/fornecedor/compra real foi criada automaticamente.

## Próximos complementos

Cotação e propostas concorrentes, comparação e histórico agregado por produto/fornecedor/período, fornecedor principal/alternativo no produto, XML de NF-e com conferência fiscal, devolução vinculada, revisão após aprovação/recebimento e fechamento de saldo não entregue. Encargos fiscais não integram o custo desta primeira entrada manual. Parcelas, vencimentos e contas a pagar ficam no módulo financeiro; condições de pagamento são texto cadastral/contratual.

Lotes/validade, inventário aprovado e transferências com trânsito/recebimento seguem etapas próprias. Não coletar lote/validade nesta tela como se já houvesse rastreamento. Não há pedido enviado automaticamente a fornecedor, e-mail/WhatsApp externo, pagamento, integração fiscal, publicação ou implantação. CI remota, SMTP, recuperação de fator perdido, backup/restauração e demais pendências de produção permanecem registradas.

## Rede e distribuição — 10.1

Compra central em /rede soma destinações e cria um pedido único na matriz/CD/depósito. Plano congelado impede edição avulsa do rascunho; aprovação/recebimento continuam no módulo existente, também acessíveis pela tela central. Após receber tudo, gerar distribuição cria apenas rascunhos de transferência. Estorno do recebimento bloqueia nova expedição vinculada até regularizar a compra. Guia em [Rede e distribuição](REDE_DISTRIBUICAO.md).
