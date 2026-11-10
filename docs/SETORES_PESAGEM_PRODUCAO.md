# Setores, pesagem e produção — incremento 09.1

Disponível localmente em `/supermercado`, com integração ao `/pdv`. Cabeçalhos pretos, indicadores escuros, ícones e ações douradas, superfícies claras e formulários responsivos seguem as cinco referências do usuário. As configurações pertencem à filial selecionada.

## Operação

1. Cadastre setores, por exemplo açougue, padaria e hortifruti. Inativar setor bloqueia seus produtos no catálogo e na confirmação da venda; cancelamento e devolução continuam sujeitos às regras existentes.
2. Em Produtos por peso, vincule o produto ao setor. Somente unidade-base KG permite pesagem. Atribua PLU de cinco dígitos, diferente de 00000, único e permanente por filial. Produtos de outras unidades podem pertencer ao setor.
3. Cadastre a configuração da balança com nome, modelo opcional, capacidade de até 99,999 kg e resolução de 0,001 a 1 kg. Ativação exige conferência. Modo e prefixo são permanentes; correção exige outra configuração, mantendo o histórico.
4. Em Pesagem e etiquetas, selecione produto, equipamento e lote físico quando houver controle. Informe bruto e tara e confirme o peso estável observado. O servidor verifica capacidade, resolução, preço positivo, lote válido e quantidade. Não existe leitura física automática nesta entrega.
5. Consulte a etiqueta e use a impressão do navegador. Pesagem e impressão não baixam nem reservam estoque. O peso é registrado como manual e inclui preço, produto, equipamento, operador e horário históricos. Repita a mesma confirmação após perda de resposta ou falha na consulta seguinte para consultar o registro já criado; a chave só é liberada quando o fluxo conclui.

## Etiqueta interna por peso

Formato explícito desta implantação: **2 dígitos de prefixo (20–29) + 5 de PLU + 5 de gramas + 1 dígito verificador módulo 10**. Exemplo: prefixo 20, PLU 00001 e 500 g produzem 2000001005002. Não há etiqueta por preço nem seleção automática de layout de fabricante.

Prefixos cadastrados, mesmo inativos, ficam reservados contra códigos estáticos EAN-13 no catálogo da rede. O prefixo é interpretado apenas por configuração ativa e revisada da filial. PLU e produto devem continuar ativos e disponíveis; produto KG precisa pertencer a setor ativo. O código não identifica filial, lote, validade ou autenticidade da pesagem. A etiqueta mostra a filial autorizada; não transportar/reutilizar etiquetas em outra filial, onde o PLU pode ter outra associação: conferir a embalagem e a separação física continua necessário.

A GS1 define códigos de circulação restrita e possibilidades regionais, mas isso não torna este layout universal ou compatível com toda balança. Consulte as [Especificações Gerais GS1](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf). Homologar o layout com os equipamentos escolhidos antes do uso comercial.

A prévia SVG tem barras EAN-13 vetoriais e zona livre; os testes rasterizam a etiqueta e decodificam com ZXing. A impressão do navegador usa largura nominal de 60 mm, barras de 56 mm e altura de 19 mm. Papel, margens, dimensionamento, contraste, leitura real e eventuais informações obrigatórias da embalagem precisam ser conferidos no equipamento. Não foi realizada impressão física.

## Venda por peso no PDV

Adicionar um produto KG abre conferência manual de bruto/tara. Não inclui automaticamente 1 kg. O leitor por câmera ou busca numérica reconhece o formato interno configurado e adiciona gramas; demais códigos seguem a busca normal do catálogo. Pesagens do mesmo produto são agrupadas em uma linha com partes históricas, usando aritmética inteira de milésimos. O servidor decodifica novamente cada etiqueta, exige o mesmo produto e confere a soma com a quantidade da venda.

O PDV usa preço atual do catálogo, não o preço antigo impresso. Alteração direta da quantidade é explicitamente manual e remove a associação com as pesagens anteriores. Clientes antigos da API podem informar quantidade KG diretamente; ela fica identificada como `manual_quantity`. Estoque, reserva, lotes, pagamentos simulados e fiscal mantêm seus bloqueios anteriores. O código da etiqueta não substitui confirmação de peso e lote físico. Não há cobrança real nesta entrega.

## Ficha técnica e produção

Ficha por filial e setor, com versão, produto acabado, rendimento previsto, instruções e até cinquenta insumos distintos. Cada quantidade usa a unidade-base explícita do seu produto; não há conversão implícita entre KG e UN. Fracionamento em outro SKU pode usar uma ficha com um insumo e rendimento conferido; a pesagem do mesmo SKU apenas informa a quantidade de venda. Não permite o produto de saída como insumo. Produção exige ficha ativa/revisada, setor ativo e versão atual.

O fator multiplica rendimento e insumos; resultados precisam caber em três casas decimais. Quantidade realmente produzida deve ser positiva e não superar a prevista. Informe lote e validade conferidos da saída, sem prazo de conservação presumido. A validade não pode estar no passado nem ultrapassar a menor validade dos lotes efetivamente consumidos. Datas usam America/Fortaleza.

A confirmação executa em uma transação: bloqueia saldos, consome os insumos pelo custo médio histórico, separa lotes válidos por primeiro vencimento, registra entradas/saídas e lotes e confirma a produção auditada. Sem saldo ou com falha de auditoria, tudo reverte. A migração corretiva 021 também impede consumir lotes válidos necessários às reservas explícitas do estoque, mesmo quando há estoque físico vencido suficiente. Insumo com controle de lotes exige saldo classificado e não bloqueado. Sem controle, usa saldo físico disponível.

A saída recebe exatamente a soma dos custos consumidos, em seis casas, preservando resíduos de arredondamento. O rendimento menor concentra esse custo no produto acabado. A diferença de rendimento fica no histórico na unidade de saída; não gera outra perda de estoque, que duplicaria o consumo. Mão de obra, energia, embalagens não incluídas como insumo e demais despesas indiretas não são rateadas automaticamente.

A saída recebe controle permanente de lotes. Saldo anterior continua não classificado e não ganha validade inventada. Se houver reserva antiga, a ativação é bloqueada. Código/validade distinguem lotes conforme a etapa 08.1.

Estorno é integral, com motivo e confirmação idempotente. Exige os movimentos originais como últimos de todos os produtos da produção naquela filial e saldo do lote de saída suficiente. A verificação acontece no servidor e qualquer falha reverte o estorno completo. Recompõe custo e lotes originais, sem renovar validade; estorno genérico do estoque não pode desfazer uma produção isoladamente. Não há edição/apagamento de produção confirmada.

## Acesso e persistência

Consulta requer `products.read` e `stock.read`. Configurações, pesagem, fichas e produção usam `stock.manage`, já protegido por MFA. O caixa consulta etiquetas por uma função restrita ao escopo `pos.read`, sem receber acesso direto às tabelas de estoque. Sessão, CSRF, filial ativa e permissões são reavaliados na operação.

Migração 020 cria seis tabelas em `supermarket`, todas com FORCE RLS e captura de auditoria. Validações de inicialização passam a quarenta tabelas RLS e trinta e sete capturas. Escritas usam funções restritas; o papel HTTP não tem INSERT/UPDATE/DELETE direto nessas tabelas. Pontes de movimento e PDV preservam as regras anteriores; migrações 001–019 permanecem intactas.

Históricos de pesagem, produção, fichas e busca de produtos paginam em vinte itens. Cadastros de setores/balanças e seleção de lotes exibem até duzentos registros; expandir a consulta para instalações que excedam esse limite. Busca de produtos consulta o servidor, sem limitar o catálogo a uma lista carregada na abertura.

## Limites e próximos complementos

- Informar marcas/modelos, protocolos e arquivos das balanças e impressoras. Comunicação serial, USB, Bluetooth, rede, carga de PLUs, exportação de arquivos de fabricante e comandos de impressão não foram implementados/homologados. [Web Serial](https://developer.chrome.com/docs/capabilities/serial) é uma possibilidade dependente de navegador e protocolo, não uma integração pronta.
- Homologar peso, estabilidade, tara, capacidade e resolução em equipamentos físicos; calibrar impressão e validar leitura no celular e scanner reais.
- Complementar layouts por preço/fabricante, formatos GS1 de lote/validade, reimpressão supervisionada, rotulagem comercial completa e rastreio físico da embalagem.
- Complementar planejamento/ordens, múltiplas saídas e subprodutos, etapas, rendimento acima do previsto, custo indireto, produção em processo, aprovação e transformações mais complexas.
- Capturas de tela e testes usam dados fictícios em bancos isolados. Nenhuma operação externa, impressão física, publicação ou implantação foi feita. Etapa 09 completa permanece em evolução.
