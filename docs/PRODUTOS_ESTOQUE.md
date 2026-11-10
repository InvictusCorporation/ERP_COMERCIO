# Produtos e estoque — incrementos 02.1 / 03.1

Cadastro central da rede e controle manual de estoque por estabelecimento ou depósito. Implementação local sobre a fundação 01.6, seguindo a quarta referência visual e adaptando o conteúdo para celular. As etapas completas 02 e 03 continuam em evolução conforme os limites abaixo.

## Uso

1. Entre com sua conta e selecione a rede. Proprietário e Administrador possuem o novo acesso. Perfis personalizados precisam receber permissões explicitamente; os outros perfis padrão não foram ampliados automaticamente.
2. Abra Produtos e estoque em /produtos ou /estoque. Sem unidade selecionada, o catálogo central fica disponível, sem apresentar um saldo consolidado fictício.
3. Cadastre código interno, nome, descrição, categoria, marca, unidade-base, embalagem/fator, códigos GTIN alternativos, preço, margens desejada/mínima e limites padrão. GTIN é opcional; produtos sem barras usam código/nome. Código interno e unidade-base ficam permanentes após o cadastro. Inativar preserva histórico.
4. Selecione uma filial, CD ou depósito no topo e abra o produto. A aba Estoque mostra físico, reservado e disponível, valor em custo e custo médio. Limites específicos da unidade substituem os padrões do produto.
5. Registre entrada, saída manual, perda/avaria, reserva ou liberação, sempre com motivo. Escolha quantidade em unidade-base ou na embalagem cadastrada. A entrada pede o custo por unidade informada: 1 fardo de 10 a R$ 40 resulta em 10 unidades e R$ 40 de custo total, R$ 4 por unidade-base.
6. Consulte Histórico para movimentos da unidade, data em Fortaleza, responsável congelado, quantidade/fator, variações e saldo após confirmação. O último movimento original pode ser estornado com motivo. O estorno gera uma nova linha; para corrigir movimentos antigos, registre ajuste manual compensatório autorizado, sem reescrever o passado.

## Permissões e isolamento

- products.read: catálogo da rede; stock.read: saldos e histórico nas unidades autorizadas. stock.read requer products.read.
- products.manage: cadastro e preço central, exige products.read, acesso a toda a rede e MFA. Escopo restrito remove essa administração global das permissões efetivas.
- stock.manage: movimentações e limites nas unidades atribuídas, exige as duas consultas e MFA. Administrador restrito pode operar somente o estoque das filiais atribuídas, sem administrar o catálogo global.
- Cada requisição reavalia sessão, vínculo, permissões e unidade disponível. Suspensão, retirada de concessão ou inativação da hierarquia bloqueiam novas consultas/operações da unidade. Para eventos de unidade inativa, a auditoria segue suas regras próprias de consulta histórica.
- Cinco tabelas inventory com RLS forçada, FKs compostas e políticas por rede/permissão/unidade. O papel HTTP não atualiza saldos, não apaga movimentos e não executa funções internas. A escrita no ledger aciona função restrita que recalcula o saldo. Papel comercial invictus_app não recebe acesso ao novo esquema.
- Alteração, saldo, movimento e auditoria confirmam juntos. Gatilhos usam snapshots permitidos, ator e correlação gerados no contexto autenticado; não armazenam credenciais.

## Regras numéricas e de consistência

PostgreSQL numeric preserva quantidades até três casas e valores do estoque até seis casas; a API transporta decimais como texto, sem converter cálculo de saldo em ponto flutuante. Limites de entrada da API: nove algarismos inteiros em quantidade/custo/preço; fator até 999999. A conversão precisa ser representável em três casas, sem arredondamento silencioso da quantidade. Custo é não negativo; entradas gratuitas são permitidas.

Entrada agrega quantidade convertida e valor total informado. Custo médio móvel = valor / físico. Saída/perda usa a proporção do custo médio vigente, arredondada a seis casas no valor, e zera todo o valor residual quando retira o último saldo físico. Reservas/liberações alteram somente o reservado. Disponível = físico − reservado; trânsito e recebimento ainda não são operacionais. Saída/perda não pode consumir quantidade reservada: libere a reserva explicitamente. Movimentos não permitem saldo físico, reservado ou valor negativos, nem reservado maior que físico.

Exemplo validado: 100 a R$ 3 + 100 a R$ 4 = 200 unidades e R$ 700, custo médio R$ 3,50; venda proposta a R$ 5 mostra margem bruta de 30% sobre a receita. A aba Dados mostra margem sobre preço e sugestão pela margem desejada; sugestão usa arredondamento para cima ao centavo na interface e exige salvar o preço para aprovação. É uma referência gerencial, sem tributos/taxas ainda integrados. A sugestão não altera o preço vigente automaticamente e não representa lucro realizado.

Alerta permanece enquanto disponível ≤ mínimo; zero identifica esgotado. Nesta entrega, avisos aparecem na tela e no filtro, sem envio de notificações externas ou automações. Não há fechamento indevido do alerta na igualdade. Saldo vazio é zero e custo médio vazio é zero; no catálogo sem unidade, saldo aparece ausente.

Confirmação de movimento usa requestKey UUID e unicidade por rede. Repetir a mesma chave e conteúdo autorizado devolve o mesmo movimento. Reusar com conteúdo diferente falha; chaves não se tornam autorização. O formulário conserva a chave e os dados se a resposta falha, permitindo tentativa idempotente; editar o pedido gera uma nova chave. Recarregar ou fechar a página exige conferir o histórico antes de iniciar outra operação. Não há fila offline persistente.

Operações usam lock transacional da rede já existente, lock do saldo e transação única. Cadastro usa versão otimista: edição desatualizada é recusada. Estorno só aceita o último movimento original do produto/unidade, não permite estornar estorno nem repetir o mesmo estorno e restaura os deltas e o último custo anterior. Essa regra evita recalcular retroativamente movimentos posteriores. Produto/unidade precisa estar ativo para novas operações, inclusive correção.

GTIN aceita 8, 12, 13 ou 14 dígitos com verificação Módulo 10; não consulta propriedade/autenticidade cadastral na GS1. As formas com zeros de preenchimento usam identidade de 14 dígitos para unicidade por rede. Referência primária: [GS1 — calculadora do dígito verificador](https://www.gs1us.org/tools/check-digit-calculator). Código de barras de embalagem não seleciona fator automaticamente: o operador confirma a unidade da entrada.

## API

Todas as rotas abaixo usam /api/v1/inventory, sessão completa e respostas sem cache. POST exige Origin e CSRF válidos e lista estrita de campos. Rede/ator vêm da sessão.

| Rota               | Comportamento                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET products       | Busca literal por nome/código/categoria/barras, situação active/inactive/all/low, page de 0 a 1000; 20 por página. unitId opcional, padrão unidade da sessão se houver stock.read. |
| GET products/:id   | Produto e histórico paginado da unidade autorizada; page de 0 a 1000, 20 movimentos. Sem stock.read não retorna saldo/histórico.                                                   |
| POST products/save | Cadastro/edição por versão. Não recebe saldo inicial; entrada é movimento separado.                                                                                                |
| POST movements     | Movimento idempotente com motivo; nunca recebe saldo final ou ator do cliente.                                                                                                     |
| POST settings      | Mínimo/ideal específicos de produto/unidade.                                                                                                                                       |

## Migrações e atualização

008 cria o catálogo, índices de barras, saldos derivados, limites, ledger e captura de auditoria; acrescenta permissões e RLS. 009 normaliza a identidade GTIN sem apagar o catálogo. Uma colisão preexistente interrompe a migração inteira para revisão, sem mesclar cadastros automaticamente. Migrações anteriores permanecem imutáveis.

Com a API/interface paradas, inicie o banco local, execute npm.cmd run db:migrate e reinicie os serviços. Não aplicar migrações com uma versão antiga da API atendendo requisições: a verificação de prontidão/autenticação exige o novo conjunto de políticas e triggers.

## Limites e próximas integrações

Este incremento entrega o cadastro básico e o estoque manual persistente, auditável e por unidade. Ainda faltam foto/upload, subcategoria, fabricante, fornecedores vinculados, cadastro de unidades personalizadas, múltiplas conversões por produto, preços por filial/atacado, campos/validações fiscais, XML e recebimento de compras com rateio de frete/despesas. Categoria e marca são textos de catálogo neste momento.

Lotes, validade e alertas de vencimento pertencem à etapa 08 e ainda não são coletados ou controlados; o produto não deve ser tratado como rastreado por lote. Inventário contado/aprovação de divergências, ajustes em lote, transferências com trânsito/recebimento, devoluções vinculadas a documentos e reservas ligadas a pedidos serão entregas próprias. As saídas manuais não representam venda, receita, caixa ou comprovante fiscal. Dashboard consolidado e notificações externas também não foram integrados. Os indicadores desta tela usam exclusivamente dados persistidos e autorizados.

Não há implantação, publicação, conta real criada automaticamente ou integração externa realizada nesta entrega. CI remota, SMTP, recuperação de MFA perdido, política de retenção, backup/restauração e infraestrutura de produção continuam pendentes.

## Integração posterior — 02.2 / 04.1

O recebimento manual de compra passou a criar movimentos vinculados, com fator aprovado e valor rateado exato. O histórico de estoque indica a origem e direciona estorno pela compra. Alertas após receber sugerem revisão do preço sem alteração automática. As pendências anteriores de fornecedores/recebimento manual foram atendidas por este incremento; XML, fiscal, lotes e outros complementos continuam pendentes. Guia em [Fornecedores e compras](FORNECEDORES_COMPRAS.md).

## Rede e distribuição — 10.1

Transferências operacionais preservam valor e lotes: expedição baixa origem e registra trânsito; conferência integral cria entrada no destino com o valor exato. Trânsito não integra o disponível e não admite estorno de movimento isolado. Reservas de lotes válidos continuam protegidas. Guia em [Rede e distribuição](REDE_DISTRIBUICAO.md).
