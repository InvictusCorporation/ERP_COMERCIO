# Relatórios gerenciais, dashboards e indicadores — incremento 12.1

Dashboard disponível em `/` e `/dashboard` para perfis com `reports.read`; relatórios detalhados em `/relatorios`. A tela inicial de implantação continua disponível para usuários sem acesso gerencial. Configurações permanecem acessíveis em `/configuracoes`. Interface preta, branca e dourada, com filtros e cartões reorganizados no celular e tabelas com rolagem interna.

## Acesso e seleção

`reports.read` depende de consulta de empresas e não concede acesso a outros módulos. Cada indicador exige a permissão de consulta de sua origem: pedidos, PDV, estoque, compras ou financeiro. Sem autorização, o indicador fica indisponível; não simula saldo zero. Custos, resultado bruto e margens comerciais também exigem consulta de estoque. O escopo inclui somente empresas/filiais ativas e autorizadas, validado novamente em cada consulta e exportação.

Ao entrar, a filial selecionada no cabeçalho é o filtro inicial. É possível escolher o consolidado autorizado ou restringir empresa e filial. Período padrão de trinta dias, com máximo de 367 dias por seleção. Datas usam a operação em America/Fortaleza. Comparação usa o período imediatamente anterior, de igual duração; sem receita anterior positiva, o percentual fica sem base. A atualização é sob consulta, com horário visível; não é streaming.

Categoria utiliza o cadastro atual dos produtos e aplica-se às análises comerciais, estoque, compras e perdas. Não filtra o financeiro. Fornecedor é um filtro específico das compras recebidas. Os nomes de lojas, produtos e fornecedores correspondem ao cadastro atual; o nome do responsável é o registrado na operação. Não há dimensão de categoria histórica congelada nos registros anteriores.

## Vendas, resultado bruto e rankings

A origem padrão é Pedidos manuais. Apenas conclusões de pedidos entram como vendas; rascunhos, reservas, separações e cancelamentos anteriores à conclusão ficam fora. Devoluções integrais são negativas na data em que ocorreram. Uma venda anterior devolvida no período atual permanece positiva no período original e negativa no período da devolução. A consulta não apaga o histórico nem transforma a devolução em cancelamento retroativo.

A origem alternativa PDV simulado é explícita e exige `pos.read`. Seus valores são apresentados separadamente e não são somados às vendas manuais. Os registros do financeiro manual continuam independentes da origem de vendas selecionada. Nada comprova cobrança externa ou pagamento real de um provedor.

- Receita líquida: produtos e taxa de entrega, com devoluções assinadas.
- Receita de produtos: valor dos itens com devoluções, sem taxa de entrega. Ao filtrar categoria, a entrega é excluída por não ter atribuição de categoria.
- Custo: custo histórico dos itens congelado na conclusão, com reversão histórica na devolução; não usa o custo médio atual para recalcular vendas antigas.
- Resultado bruto dos produtos: receita líquida de produtos menos seu custo histórico. Margem divide esse resultado pela receita de produtos somente quando a base é positiva.
- Ticket: receita dos documentos concluídos na seleção dividida pelo número dessas conclusões. Devoluções ficam em indicador separado.
- Vendas no último dia: último dia do período escolhido, sem confundir com a data atual quando o filtro é histórico.

Relatórios comerciais: vendas/devoluções por documento, produtos e curva ABC, ranking de lojas e ranking de responsáveis. Quantidade é somada somente dentro do mesmo SKU/unidade-base. Responsáveis são agrupados pelo nome registrado e filial; nomes iguais na mesma filial ficam agregados. Não representa identidade única de vendedor, comissão ou meta.

A curva ABC ordena a receita líquida positiva: A inclui os produtos até cruzar 80% da base, B até cruzar 95%, C o restante. A classificação usa o acumulado anterior ao item, de modo que um único produto dominante continua em A. Valores líquidos sem base positiva ficam Sem classe. A busca na tabela não recalcula a classe da seleção original de período, unidades e categoria.

## Financeiro e conferência

Fluxo realizado usa os lançamentos do financeiro manual pela data financeira registrada. Recebimentos e pagamentos incluem baixas e seus estornos, encargos e descontos efetivamente escriturados. Aberturas, suprimentos, sangrias e transferências ficam em Outros movimentos; não viram receita ou despesa operacional. Variação de caixa/banco soma os movimentos realizados. Saldos das contas são atuais, inclusive contas inativas que ainda conservam saldo.

Cartões de contas a pagar/receber mostram principal atualmente pendente e valores vencidos atuais, independentemente do período de vendas. As tabelas de contas pendentes filtram o vencimento no período escolhido e usam o saldo pendente atual. Não reconstroem uma posição financeira passada. Não exportam contatos dos clientes/fornecedores.

Conferências de caixa mostram registros vigentes pela data de fechamento; conferências reabertas ficam fora. O alerta soma diferenças absolutas, para que faltas e sobras não se anulem. Não inclui os caixas simulados do PDV.

Estes indicadores não são DRE contábil, lucro líquido ou margem de contribuição: não há classificação contábil suficiente de tributos, despesas operacionais, folha, depreciação e custo de entrega. Faturamento, recebimento, saldo e resultado bruto permanecem conceitos distintos.

## Estoque, validade, compras e perdas

Estoque é uma posição atual. Período não recalcula saldo passado; serve para identificar ausência de movimentação física. O custo atual inclui o físico registrado, mesmo quando lotes estão vencidos ou bloqueados. Saldo vendável exclui reservas e, em produto controlado, lotes vencidos, bloqueados e saldo sem classificação. Estoque baixo inclui posições em falta e usa o mínimo da filial quando configurado. Contadores se referem a posições produto/filial; não somam kg, unidades ou SKUs diferentes.

Validade utiliza o prazo de alerta configurado por produto/filial. Próximo do vencimento considera lotes positivos válidos e não bloqueados. Há lote vencido considera quantidade positiva com data passada. Produtos ativos sem saldo também aparecem; inativos aparecem quando ainda têm físico ou reserva. Sem movimento considera posição com físico positivo e nenhuma movimentação física no período; reserva/liberação não conta como movimentação física.

Compras somam recebimentos efetivos, pelos valores rateados dos itens, e seus estornos nas respectivas datas. Incluem frete, despesas e desconto rateados. Pedidos apenas aprovados não viram mercadoria recebida. Filtro por fornecedor usa sua identidade cadastrada; nomes exibidos são atuais. Perdas usam custo histórico dos movimentos de perda e estornos assinados, sem estimar perdas não registradas ou misturar consumo de produção.

## Exportação e auditoria

Exportar CSV exige `reports.export`, MFA e todas as consultas necessárias à origem selecionada. É uma ação explícita com CSRF e verificação de origem. O arquivo inclui todas as páginas da seleção até cinco mil registros, cem filiais e oito MB em UTF-8. Acima desses limites, a exportação é recusada com orientação para refinar filtros; não há truncamento silencioso.

CSV em UTF-8 com BOM, delimitador ponto e vírgula, campos entre aspas e vírgula decimal. Valores numéricos preservam casas e sinais, inclusive custos de seis casas. Textos que poderiam abrir como fórmula de planilha recebem prefixo de proteção. Colunas de contexto registram período, escopo autorizado, origem e horário da geração. Não inclui CPF, CNPJ, telefone, e-mail ou endereço de clientes/fornecedores.

A categoria de auditoria Relatórios e indicadores registra a exportação, responsável, contexto, quantidade e correlação da requisição. Não copia o arquivo inteiro ao log. Consulta comum não cria eventos de alteração de dados comerciais. Se a auditoria falha, o arquivo não é entregue. Nova tentativa de download é uma nova exportação auditada; não modifica estoque ou financeiro.

Migração aditiva 029: permissões, dependências, índices de consulta e função restrita de auditoria. Nenhuma tabela comercial nova; continuam 48 tabelas com FORCE RLS e 45 capturas verificadas no runtime. Consultas de dados usam o papel HTTP com RLS. Catálogo, unidades e saldos do estoque são preparados em conjuntos autorizados para evitar reconsultas por linha. Migrações 001–028 e escopo mestre são preservados.

## Complementos posteriores

DRE/classificação contábil, metas e orçamento, categoria histórica, identificação única do responsável em pedidos antigos, preferências/painéis personalizados, relatórios agendados e envio externo, PDF/XLSX nativos, séries de saldo histórico, previsão de demanda, IA e integrações de BI são complementos posteriores. Este incremento usa regras determinísticas e os registros existentes, sem serviço externo ou publicação.
