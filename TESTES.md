# Testes e evidências

## Fiscal NF-e/NFC-e — 07.1 — 09/11/2026

- Testes em bancos PostgreSQL reais isolados invictus_test_*, com dados fictícios. Migração 017 aditiva, 001–016 e escopo original preservados.
- npm.cmd test: 39 testes unitários aprovados. Fiscal acrescenta 12 casos: CPF/códigos/precisão, bases explícitas, arredondamento, CEST e totais IBS/CBS, bloqueio de produção, vínculo rede/unidade/CNPJ, DV da chave, protocolo/ambiente, retorno perdido, redirecionamentos, tamanho/tipo de arquivos e remoção de credenciais/CPF dos retornos.
- npm.cmd run test:integration: 174 testes aprovados, incluindo agrupadores. Após o ajuste dos campos CEST/totais, a suíte fiscal isolada foi repetida: 13 testes aprovados. Toda a regressão de identidade, usuários, unidades, auditoria, estoque, compras, PDV e financeiro passou.
- Adaptador real FocusGateway exercitado por fetch sintético injetado somente nas fixtures; nenhum contato externo. Casos de modelos 55/65, rejeição, processamento assíncrono, autorização com protocolo completo de ambiente 2, download privado e cancelamento. Não equivale a homologação fiscal real, XSD ou emissão externa autorizada.
- Concorrência/idempotência registra um POST para duas confirmações da mesma chave. Resposta perdida deixa retorno a conciliar e consulta GET recupera autorização, sem repetir o POST. Configuração tributária alterada invalida conferência anterior.
- Falha transacional de auditoria antes de enfileirar impede a rede; falha depois do envio deixa processamento conciliável por consulta. Estoque não é rebaixado novamente, cancelamento fiscal não devolve venda, devolução do PDV com fiscal ativo é bloqueada.
- Rede/filial alheias não leem documentos, perfil de consulta não configura nem emite, e MFA é exigido nas escritas. Papel HTTP sem UPDATE/INSERT direto nas tabelas fiscais. Auditoria fiscal não inclui CPF do destinatário. Verificador exige 31 tabelas com FORCE RLS e 28 capturas.
- Primeira rodada de navegador: 9 aprovados e 4 falhas em seletores getByLabel de selects. Snapshot confirmou os nomes acessíveis dos comboboxes; seletores ajustados para getByRole('combobox'), sem alterar regras fiscais para satisfazer os testes. Regime passou a exigir escolha explícita na tela; edição do emitente não é sobrescrita ao voltar à janela.
- Rodada integral de navegador: 94 aprovados e 12 falhas em carregamento/indisponibilidade de módulos anteriores; os 13 cenários fiscais passaram. Diagnóstico registrado em .local/fiscal-all-e2e.log; traces foram inspecionados na rodada. Auditoria enviou somente a segunda data ao preencher antes da inicialização; teste passa a aguardar o botão Buscar habilitado. Financeiro podia abrir fluxo antes de inicializar as datas: abas agora aguardam unidade e inicialização, com teste segurando a resposta de overview para comprovar o bloqueio.
- Runner de navegador passa a usar 60 segundos por cenário e 10 segundos por asserção para compilação inicial do Next no workspace Windows. Timeouts e limites da aplicação não foram ampliados. Todos os cenários afetados são repetidos explicitamente, sem retries automáticos ou exclusões.
- Migração 017 aplicada no banco local: zero registros em issuer_profiles, product_profiles, documents e operations; quatro tabelas fiscais com RLS forçada e 28 capturas de auditoria ativas. Verificação confirma migrações 001–016 intactas. Variáveis FISCAL_* excluídas do ambiente web em verificação independente.
- Repetição final: 25 cenários aprovados em 3 minutos, reunindo os 12 anteriormente afetados e todos os 13 fiscais. No conjunto das rodadas, os 106 cenários distintos foram aprovados; não foi uma rodada integral única sem falhas. Log final em .local/fiscal-rerun-e2e.log.
- Capturas finais de documentos/detalhe, emitente, tributação e vendas disponíveis em 360/390/768/1440 px, com checagem de overflow e revisão visual de desktop/celular. Arquivos em .local/screenshots/fiscal-*.png, somente fixtures fictícias. Tabelas preservam rolagem interna e formulários empilham campos no celular.
- npm.cmd run build e npm.cmd run typecheck aprovados em contratos, API e web. /fiscal é rota privada dinâmica. next-env normal restaurado sem referência ao cache de E2E.
- Verificação final: diff preparado e JavaScript público sem segredos locais; nenhum arquivo privado rastreado, links Markdown válidos, escopo idêntico ao anexo original e migrações 001–016 preservadas. Git diff --check aprovado. Serviços de teste encerrados; nenhuma publicação ou emissão externa.
- Guia operacional, configuração privada, fontes primárias e limites em [Fiscal](docs/FISCAL.md). Emissão externa e homologação real, dispositivos físicos, produção e publicação permanecem pendentes.


## Financeiro manual — 06.1 — 09/11/2026

- PostgreSQL real em bancos isolados invictus_test_*, com fixtures fictícias; migrações 015/016 aditivas. Migrações 001–014 e escopo mestre preservados. Nenhuma operação bancária externa ou dado comercial fictício inserido no banco de desenvolvimento.
- npm.cmd test: 27 testes unitários aprovados. Novos casos validam valores decimais, calendário, parcelas até 36, vencimento final até ano 9999, saldo/colunas forjadas e dados de cartão indevidos.
- npm.cmd run test:integration: 161 testes aprovados, incluindo agrupadores. Financeiro acrescenta 15 subcenários e agrupador. Toda a regressão de identidade, acessos, unidades, auditoria, estoque, compras e PDV passou.
- Abertura e criação de títulos idempotentes; parcelas de 100,01 conservam o total em centavos sem movimentar caixa. Baixa parcial separa principal de juros/encargos/desconto; valor líquido é escriturado. Excesso, saldo insuficiente e versões antigas são recusados.
- Confirmações concorrentes com a mesma chave gravam uma baixa. Estorno cria contrapartida, conserva original e recompõe o principal; cancelar com baixas ativas é bloqueado. Falha no evento de auditoria do UPDATE final do título reverte baixa, ledger e saldo.
- Transferência tem duas pernas e não vira receita. Testes verificam insuficiência na origem e falha na segunda perna (destino inativo), com saldo da origem preservado em ambos. Fluxo líquido desconta estornos e mantém saldo inicial/aportes/transferências separados dos títulos.
- Conferência preserva esperado/contado/diferença e bloqueia período. Reabertura fica registrada, sem apagar conferência. Inativação com saldo, retrodatação de caixa e reuso de versão são recusados.
- Recebimento de compra gera título único por valor do servidor, snapshot e documento. Estorno da compra com título ativo retorna conflito financeiro específico e reverte movimentos de estoque já iniciados. Cancelar o vínculo permite o estorno; origem não pode ser importada novamente.
- Vinte e um títulos verificam paginação 20/1, filtros literais e classificação de vencidos. Financeiro limitado à filial recebe MFA obrigatório, baixa sem poder cadastrar ou movimentar caixa, não lê conta da filial alheia e perde acesso após revogação.
- Papel HTTP sem INSERT/UPDATE/DELETE direto no ledger, títulos ou baixas. Categoria financeira e responsável integram auditoria unificada com correlação. Verificador exige 27 tabelas com FORCE RLS e 24 capturas ativas.
- npm.cmd run test:e2e: 93 cenários aprovados na rodada integral final, incluindo 78 regressões e 15 cenários financeiros.
- No navegador: conta inicial, parcelas, recebimento parcial, pagamento, estorno/cancelamento, saldo insuficiente, transferência, conferência/reabertura, importação de compras, detalhe pelo extrato e repetição após resposta perdida. PDV confirmado em sandbox não altera saldo ou contas a receber do financeiro manual.
- Capturas de títulos, detalhe, caixa e fluxo nas larguras 360/390/768/1440 em .local/qa/financeiro*.png, com checagem de overflow global. Tabelas mantêm rolagem interna; formulários e abas se reorganizam no celular.
- Primeiras rodadas detectaram seletores de teste de combobox e a opção oculta Parcial confundida com o indicador. Ajustados para nomes acessíveis dos controles e indicador de situação, sem mudar a regra de baixa que já passava no banco. Revisão móvel reorganizou abas em duas linhas para evitar sobreposição.
- npm.cmd run build e npm.cmd run typecheck aprovados em contratos, API e web. Rotas financeiras privadas e dinâmicas; next-env restaurado sem caminho do cache de E2E.
- Migrações 015/016 aplicadas no banco local. Verificação administrativa na base comercial confirmou zero linhas nas cinco tabelas financeiras; fixtures permaneceram nas bases isoladas.
- Diff preparado e JavaScript público sem segredos da configuração local; nenhum arquivo privado rastreado, links Markdown válidos, escopo original idêntico e git diff --check aprovado.
- Guia e limites em [Financeiro](docs/FINANCEIRO.md). Pagamentos/conciliação bancária externos, homologação contábil e em dispositivos físicos, DRE e publicação permanecem pendentes.


## PDV, vendas e caixa — 05.1 — 09/11/2026

- Testes em bancos isolados invictus_test_*, com dados fictícios. Migrações aditivas 012–014; 001–011 e escopo original preservados. Banco local recebe somente estrutura/permissões, sem cadastros comerciais de teste.
- 24 testes unitários aprovados: validação estrita de itens/formas, precisão, dados arbitrários de cartão e bloqueio do sandbox em produção.
- npm.cmd run test:integration: 145 testes aprovados, incluindo agrupadores. Integração verifica caixa único, idempotência, concorrência, catálogo GTIN, preços no servidor, soma/troco, autorização sem baixa, confirmação única com CMV, cancelamento, recusa, reservas, preço alterado, devolução pelo custo histórico após nova compra, saldo de caixa, sangria/suprimento e diferença no fechamento.
- Falha de auditoria após movimentos e dinheiro reverte o conjunto; papéis HTTP sem DML direto, operador sem poderes de estoque, MFA, limites por filial/rede e revogação imediata testados. Comprovante preserva snapshots.
- Câmera testada com permissão recusada, vídeo sintético, detector nativo simulado com leituras repetidas e ZXing real decodificando EAN no vídeo. Encerramento de tracks ao fechar/trocar aba verificado. Sem homologação física de celulares/leitores.
- npm.cmd run test:e2e: 78 cenários aprovados na rodada integral final, com 62 regressões e 16 cenários de PDV.
- Telas em 360/390/768/1440 px, capturas em .local/screenshots/pdv-*.png. Busca/carrinho, venda/misto, cancelamento/devolução, extrato/fechamento, comprovante, recusa e saldo insuficiente cobertos no navegador. Resposta perdida após escrita seguida de repetição gera só um rascunho. Perfil sem PDV recebe negação. Reabrir o mesmo código inicia um novo turno sem reutilizar a chave da abertura anterior.
- A primeira rodada detectou seletor de alerta também atingindo o anunciador de rota do Next e vídeo sintético sem frames pintados. Corrigidas as fixtures/seletores, sem ocultar erro do produto. Revisão de domínio acrescentou preservação de tentativa recusada no cancelamento em 014.
- A suíte ampliada atingiu o limite real de 60 logins por IP em cinco minutos; 429 foi confirmado no trace, antes de abrir a câmera. A fixture do PDV agora isola somente os contadores de IP de login/MFA no banco invictus_test_* verificado, dentro de uma rede fictícia nova. Não altera limites da aplicação, contadores de conta ou sessão. A preparação exige HTTP 200 antes de usar o segredo.
- npm.cmd run build e npm.cmd run typecheck aprovados em contratos, API e web. /pdv, /vendas e /caixa são rotas privadas dinâmicas. next-env normal restaurado, sem referência ao cache de E2E.
- Diff preparado e JavaScript público sem segredos da configuração local; nenhum arquivo privado rastreado, links Markdown válidos e ESCOPO.md idêntico ao original. Git diff --check aprovado.
- Guia operacional e limites em [PDV, vendas e caixa](docs/PDV_VENDAS.md). Sem pagamento/cobrança real, emissão fiscal, publicação ou execução remota de CI.


## Fornecedores e compras — 02.2 / 04.1 — 09/11/2026

- PostgreSQL real 18.6; migrações aditivas 010/011, aplicadas também no banco local sem criar cadastros comerciais reais. Migrações 001–009 e escopo mestre original preservados. Fixtures somente em bancos separados com nomes invictus_test_*.
- npm.cmd test: 21 testes unitários aprovados, incluindo três de validações de compras/calendário/versão e campos indevidos.
- npm.cmd run test:integration: 130 testes aprovados no relatório Node, com agrupadores. Nova suíte contém 15 subcenários e agrupador; todas as regressões de autenticação, acessos, unidades, estoque e auditoria passaram.
- Cadastro/versão/CNPJ único e permanente, anonimato, Origin/CSRF/Sec-Fetch-Site, filtros inválidos, inativação, pedidos e isolamento entre redes/filiais verificados.
- Rascunho e aprovação não criam saldo. Edição após aprovação é recusada. Recebimento parcial respeita saldo e versão, conclui integralmente e repete idempotentemente a mesma confirmação; payload diferente com mesma chave falha. Confirmações concorrentes retornam um único recebimento/entrada.
- Exemplo 100 a 3 + 100 a 4 conserva 200 unidades, valor 700 e média 3,50 sem mudar preço de venda. Frete/despesas/desconto rateados cumulativamente; recebimentos parciais conservam o valor exato até seis casas. Itens de valores 1 e 3 com frete 0,01 recebem 1,0025 e 3,0075.
- Fator aprovado é preservado mesmo quando a embalagem do catálogo muda. A ponte do estoque usa valor total exato do recebimento, sem reconstrução por custo unitário arredondado.
- Estorno pela compra preserva origem, cria movimentos novos e recompõe pedido/custo; estorno manual isolado da entrada é recusado. Quando um item do conjunto tem movimento posterior, falha no estorno reverte também os itens já processados. Auditoria induzida a falhar no UPDATE final do pedido reverte recibo, movimentos e saldo que já haviam sido criados.
- Comprador restrito à filial recebe MFA obrigatório, cria rascunho local e não aprova/recebe sem as permissões. Conferente limitado recebe na filial, não administra fornecedor central e perde a escrita na próxima requisição após revogação. Papel HTTP não insere diretamente pedidos, não atualiza recibos ou apaga fornecedores.
- Vinte e um recebimentos confirmaram paginação 20/1. Unidade inativa bloqueia operação/consulta sem excluir histórico. Renomear fornecedor não reescreve snapshot de compra. Custos crescentes geram aviso/sugestão com preço vigente preservado.
- Primeiro banco real detectou colisão da variável id na captura de auditoria; migração 011 corrigiu a função, preservando 010 já aplicada. Suíte repetida com sucesso.

- npm.cmd run test:e2e: 62 cenários aprovados na rodada completa final, com 51 regressões e 11 cenários novos de fornecedores/compras. Cadastro/edição, ciclo de compra na tela, parcial/integral, cancelamento, estorno, conexão, permissões e aviso de margem com preço preservado validados.
- Itens de compra na auditoria exibem nome, quantidade, fator, custo e valores de forma legível. Consulta de detalhe com fonte de compras verificada no navegador.
- Capturas em 360/390/768/1440 px revisadas em .local/qa/fornecedores-*.png, compras-*.png e compras-recebimento-*.png. Sem overflow da página e somente dados fictícios. Menu/cabeçalho preto, cartões e ações douradas e editor lateral/empilhado preservados.
- Uma rodada intermediária durante atualização do ambiente apresentou atrasos de navegação e resposta da API anterior sem o campo de avisos. O cliente passou a tolerar avisos ausentes; a rodada final repetiu integralmente login, MFA, contexto/unidade e compras com sucesso. Avisos de stream cancelado em navegações no dev server continuam possíveis; não equivalem a homologação de produção.
- npm.cmd run build e npm.cmd run typecheck: aprovados em contratos, API e web. /fornecedores e /compras são páginas privadas dinâmicas. next-env normal gerado sem caminho do cache de E2E.

- Conferência final aprovada: nenhum segredo real no diff preparado ou JavaScript público; nenhum .env, banco, cache, dependência, captura ou resultado privado versionado. Links locais válidos, escopo idêntico ao anexo, migrações anteriores preservadas e git diff --cached --check aprovado. Serviços de QA encerrados com dados do PostgreSQL preservados.

Guia e limitações em [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md).


## Produtos e estoque manual — 02.1 / 03.1 — 09/11/2026

- PostgreSQL real 18.6, migrações aditivas 008/009 com checksum; migrações 001–007 preservadas e escopo original idêntico ao anexo. Banco de desenvolvimento atualizado sem criar cadastros reais; dados fictícios somente em bancos de teste separados.
- npm.cmd test: 18 testes unitários aprovados. GTIN com zeros, dígito/comprimento inválidos, decimais textuais, precisão excessiva, infinito/NaN/coerção e campos de identidade indevidos cobertos.
- npm.cmd run test:integration: 114 testes aprovados, incluindo os agrupadores; suíte de produtos/estoque com 17 subcenários e agrupador. Repetição focada final da suíte: 18 aprovados, incluindo as verificações explícitas de anonimato, Origin, CSRF e Sec-Fetch-Site.
- Catálogo, duplicidade de código/GTIN e preenchimento GTIN de 14 dígitos, dados persistentes, versão otimista, identidade permanente, produto inativo e filtros adulterados verificados. Perfis antigos personalizados não recebem escrita nova automaticamente.
- Exemplo do escopo preservado: 100 a 3 + 100 a 4 = 200, valor 700, custo médio 3,50 e margem gerencial de 30% a preço 5. Saída mantém custo médio e preço; histórico da entrada continua com seu custo original.
- Fardo de 10 comprado por 40 entra como 10 e valor 40. Conversão com fração não representável é recusada sem saldo/movimento parcial. Numeric conserva precisão; saída do último saldo zera resíduo financeiro.
- Reserva reduz disponível e bloqueia consumo reservado/negativo; liberação e perda rastreáveis. Repetição da confirmação é idempotente; mesma chave com outro conteúdo falha. Entradas concorrentes não perdem saldo; duas saídas concorrentes disputam o disponível, uma é recusada sem duplicidade.
- Estorno adiciona linha, restaura deltas/custo anterior e recusa movimento antigo, estorno repetido ou estorno de estorno. Limites por unidade sobrepõem o padrão; igualdade com mínimo mantém alerta e reposição acima dele encerra o alerta na consulta.
- MFA exigido ao conceder stock.manage; sessão parcial não movimenta. Estoquista limitado à filial opera somente nela, não administra produto/preço global, e perde a escrita imediatamente quando a permissão é retirada. Outra rede, filial alheia e unidade inativa negadas; histórico não apagado.
- Papel HTTP sem UPDATE em saldos, DELETE em movimentos ou EXECUTE em funções internas. RLS sem contexto nega dados. Falha induzida na auditoria retorna 503 e reverte produto, saldo e movimento sem efeito parcial.
- Regressão detectou expectativa antiga do Administrador restrito; atualizada para os acessos comerciais agora autorizados, preservando proibição de administração global.
- Inspeção visual desktop/celular levou a ajuste do espaçamento e labels explícitos dos campos multilinha/selects. Edição multilinha mantém texto e normaliza a lista somente ao salvar.
- A regressão encontrou restauração do fragmento do convite após router.refresh; remoção da atualização desnecessária e nova limpeza antes da confirmação. Verificação de aceite, token limpo e suspensão preservada nos testes de navegador.

- npm.cmd run test:e2e: 51 cenários aprovados na rodada completa final, com 42 regressões anteriores e 9 cenários de produtos/estoque. Cadastro por teclado com dois GTINs, busca, recarga persistente, reserva/estorno, limites, falha de conexão e ausência de permissão validados.
- Capturas de produtos e estoque revisadas em 360, 390, 768 e 1440 px, sem overflow da página e somente com cinco produtos fictícios na rede de teste. Evidências em .local/qa/produtos-*.png e estoque-*.png, fora do Git; visual preto/branco/dourado preservado.
- Dev server do Next emitiu aviso de stream cancelado em navegações de regressão; os cenários funcionais passaram. Não tratar esses avisos como evidência de homologação de produção.

- npm.cmd run build e npm.cmd run typecheck: aprovados em contratos, API e web. Páginas /produtos e /estoque geradas como dinâmicas; tipos normais restaurados após o runner E2E.
- Conferência final: nenhum segredo real no diff preparado ou JavaScript público; nenhum banco, .env, cache, dependência, captura ou resultado privado versionado. Links locais válidos, escopo mestre idêntico ao anexo e git diff --cached --check aprovado. Serviços de QA encerrados e dados do PostgreSQL preservados.

Guia operacional e limites em [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md). Lotes/validade, inventário aprovado, fornecedores/compras, transferências e produção continuam pendentes conforme o guia.


## Entrega 01.6 — 09/11/2026

- PostgreSQL real 18.6; migrações 006/007 incrementais e testes em bancos fictícios separados. Nenhuma empresa/conta real criada automaticamente.
- `npm.cmd test`: 15 testes aprovados, incluindo filtros (datas reais, ano zero, campos e limites) e correlação assíncrona isolada por requisição.
- `npm.cmd run test:integration`: 96 testes aprovados no relatório Node, incluindo agrupadores. Nova suíte de auditoria tem 17 subcenários e o agrupador, além das regressões anteriores.
- Migração de fonte anterior: banco primeiro preparado até 005; eventos de acesso/identidade e datas antigas criados antes de 006/007. Importação preservou fontes/data, marcou legacy e deixou antes/depois/correlação ausentes. Reexecução de migração idempotente.
- A primeira verificação detectou que FORCE RLS impedia SELECT da fonte legada pelo proprietário migrador. Corrigido por política exclusiva e nova migração 007, mantendo 006 já aplicada intacta; suíte repetida com sucesso.
- Empresa/matriz têm correlação comum gerada pelo servidor, imune ao header do cliente; alterações mostram valores anteriores/posteriores e ator correto. Nome/rótulo históricos não mudam quando o cadastro é renomeado. Salvar os mesmos dados e consultar sessões sem mudança não criam evento falso. Escopo inalterado e reordenação das mesmas permissões também foram confirmados sem novos eventos.
- Perfil, vínculo e atribuição de filial capturados; auditor restrito vê somente eventos de unidades atribuídas, sem metadados, opções, contagens, registros de equipe/perfil/empresa ou outra rede. Histórico de unidade inativa permanece autorizado sem liberar operação; retirada de atribuição/suspensão afeta consultas na mesma sessão.
- Segurança pessoal não se mistura entre contas/redes: operador não consulta rede e proprietário não recebe segurança de funcionário. Credenciais, hashes, tokens, chave, segredos MFA e mensagens cifradas foram buscados nos eventos reais sem ocorrência.
- Papel HTTP sem INSERT/UPDATE/DELETE/TRUNCATE/EXECUTE em auditoria; papel comercial sem SELECT. Detalhes alheios respondem 404. Período, ação, UUID, consulta literal, paginação e filtros adulterados testados.
- Falha induzida na auditoria reverte empresa/matriz e alteração de vínculo; redefine senha com erro 503 preservando hash anterior e sessões válidas. Eventos e recursos são atômicos.
- Operações simultâneas de contas diferentes têm atores/correlações separados. Reinício da API preserva histórico e consulta.
- `npm.cmd run test:e2e`: 42 cenários aprovados integralmente. Nove novos cenários de histórico/antes-depois, mesma operação, busca/período, segurança pessoal, consulta/revogação de filial, falha de conexão e 360/390/768/1440 px. As 33 regressões de login, equipe e unidades continuam aprovadas, incluindo foco do menu móvel.
- Capturas revisadas em `.local/qa/auditoria-1440.png`, `auditoria-768.png`, `auditoria-390.png` e `auditoria-360.png`; somente redes e pessoas fictícias. Visual preto/branco/dourado e comparação lateral/no celular conferidos.
- `npm.cmd run build`: aprovado em contratos, API e web, com TypeScript e geração das páginas. `npm.cmd run typecheck`: aprovado nos três workspaces. Tipos normais gerados sem caminhos aleatórios do cache E2E.
- Verificação final: nenhum segredo real no diff preparado ou JavaScript público; arquivos privados, caches, banco e capturas fora do Git. Escopo original SHA-256 preservado, links locais válidos e `git diff --cached --check` aprovado. PostgreSQL de QA encerrado com dados preservados.
- CI preparada em `.github/workflows/ci.yml`: sintaxe conferida pelo formatador, com PostgreSQL descartável e comandos de validação. Não executada remotamente ou homologada em Linux neste host Windows; sem upload de arquivos privados ou publicação.

Limites: registros anteriores não têm snapshots recuperáveis; retenção local preserva tudo, sem purge/exclusão automática. Proteções da aplicação não limitam administrador privilegiado do banco; não há assinatura externa. Módulos comerciais permanecem futuros. SMTP real, recuperação de fator perdido, infraestrutura, backup/restauração e política final de retenção ainda pendentes antes de produção.

## Entrega 01.5 — 09/11/2026

- Migração 005 aplicada incrementalmente em PostgreSQL real 18.6, sem editar migrações anteriores ou criar empresas reais.
- `npm.cmd test`: 13 testes unitários/HTTP aprovados, incluindo CNPJ numérico, exemplo alfanumérico oficial e dígitos/caracteres inválidos.
- `npm.cmd run test:integration`: 78 testes aprovados no relatório Node, incluindo agrupadores. Novos 23 cenários de organização e regressão completa de autenticação, usuários/permissões e isolamento.
- Empresa/matriz atômicas, filial, CD, depósito sob filial, CNPJ/raiz/código/UF/CEP, duplicidade, hierarquia inválida e imutabilidade de identidade testados. FKs compostas impedem vínculos e atribuições entre redes/empresas distintas.
- Usuário restrito não consulta matriz, irmãos ou depósitos não atribuídos; adulterar o ID não amplia escopo. Perfil administrativo restrito perde administração global; perfil personalizado pode gerenciar somente estrutura, com MFA, sem administrar equipe.
- Troca de escopo afeta sessão aberta; unidade selecionada é limpa quando perde acesso. Inativar filial/empresa bloqueia dependentes, seleção e leitura comercial; reativação preserva cadastros/atribuições.
- `withUnit` e RLS com o papel comercial real aprovados: unidade ausente/alheia/inativa negada, sem leitura fora do contexto, 16 operações concorrentes entre unidades e redes em pool de duas conexões, sem resíduo no reuso.
- Convite preserva o escopo exato; unidade inativada e remetente que perde escopo global impedem aceite. Falha no evento provoca rollback de empresa e matriz, sem registro parcial.
- API encerrada e iniciada novamente no teste: empresas, unidades, sessão e unidade selecionada preservadas.
- `npm.cmd run test:e2e`: 33 cenários aprovados integralmente. Oito novos cenários cobrem cadastro visual de empresa/matriz/filial, persistência, CNPJ inválido mantendo formulário, configuração de acesso por filial na interface, contexto do operador e inativação/reativação, mais as quatro larguras 360/390/768/1440 px. Regressões de login/dashboard/equipe mantidas.
- Quatro testes de captura responsiva repetidos após ajustar somente o enquadramento ao topo, todos aprovados. Capturas em `.local/qa/empresas-360.png`, `empresas-390.png`, `empresas-768.png` e `empresas-1440.png`, usando redes e pessoas fictícias isoladas.
- `npm.cmd run typecheck`: aprovado nos três workspaces. A aplicação não registrou erro de página no fluxo de cadastro monitorado pelo teste.
- `npm.cmd run build`: aprovado em contratos, API e web, com geração das páginas e TypeScript. Tipos normais restaurados sem caminhos aleatórios de cache de teste.
- Busca por credenciais reais no diff preparado e JavaScript público: nenhuma encontrada. Arquivos privados, bancos, capturas e caches fora do Git; escopo original SHA-256 preservado, links locais válidos e `git diff --cached --check` aprovado.
- A primeira verificação da mensagem de CNPJ encontrou dois role alerts (mensagem e anunciador de navegação do Next); o seletor passou a ser limitado à região do módulo. A repetição completa aprovou os 33 testes.

Limites: validação de CNPJ é somente de formato/DV, sem consulta de situação fiscal. Estoque por depósito, movimentações, transferências, fiscal e consolidação comercial ainda não existem. Auditoria unificada permanece em 01.6; SMTP real e recuperação de fator perdido ainda pendentes antes de produção. Sem implantação, publicação no GitHub ou e-mails externos.

## Entrega 01.4 — 09/11/2026

- PostgreSQL real 18.6, bancos fictícios próprios, sem criar equipe no banco de desenvolvimento. Migração 004 aplicada incrementalmente; migrações anteriores preservadas.
- `npm.cmd test`: 11 testes unitários/HTTP aprovados.
- `npm.cmd run test:integration`: 54 testes aprovados no relatório Node (incluindo agrupadores). Cobrem regressão de identidade/isolamento e 19 cenários de administração de acessos.
- Matriz de autorização real: anônimo/operador negados, consulta limitada, concessão atual/nova limitada ao ator, Master indisponível, perfis padrão protegidos, CSRF/Origin/corpos estritos, IDs de outra empresa e FK composta recusados.
- Mudança de perfil afeta sessão já aberta; suspensão/reativação respeita empresa e conta global inativa. Pessoa com dois vínculos não soma permissões. Perfil sensível exige MFA inclusive em conta nova convidada.
- Convites com fila cifrada, token ausente no HTTP de criação, uso único, conta existente autenticada sem trocar dados globais, expiração/revogação/adulteração, substituição do link anterior e autoridade do remetente revogada.
- Duas confirmações concorrentes criam um único vínculo. Duas suspensões concorrentes preservam um proprietário ativo. Falha induzida no evento reverte a criação do perfil; conta de execução não pode atualizar/apagar eventos.
- `npm.cmd run typecheck`: aprovado nos três workspaces.
- `npm.cmd run test:e2e`: 25 cenários aprovados em uma execução integral, incluindo os 7 novos cenários de administração e as 18 regressões de login/dashboard. Convite → conta nova → aceite → suspensão aprovado com duas sessões de navegador.
- Capturas revisadas: `.local/qa/usuarios-1440.png`, `usuarios-768.png`, `usuarios-390.png` e `usuarios-360.png`. Contas e indicadores dessas capturas são exclusivamente fictícios.
- Durante QA, Strict Mode revelou perda do fragmento na segunda montagem do formulário de convite; corrigido mantendo-o em referência somente em memória. O teste do campo de situação passou a usar o papel acessível combobox, evitando o texto das opções no seletor de label exato.
- `npm.cmd run build`: aprovado em contratos, API e Next.js, incluindo TypeScript e geração das páginas. O build normal restaurou os tipos gerados sem caminhos aleatórios de cache de teste.
- Busca por segredos reais no diff preparado e no JavaScript público: nenhum encontrado. `.env*`, `.local`, caches, dependências e artefatos de execução ficaram fora do Git; `git diff --cached --check` aprovado.
- Prévia funcional validada pelo servidor isolado E2E nas portas 3001/3334; uma tentativa adicional de `dev` em 3000 encontrou a porta ocupada. O orquestrador encerrou seus filhos, sem interromper serviços alheios. Captura desktop aberta no painel do Codex.
- Escopo mestre conferido byte a byte por SHA-256; links locais da documentação conferidos sem destinos ausentes.

Limites: SMTP real sem configuração/homologação; nenhum e-mail externo enviado. Escopo atual é por empresa; restrições por filial dependem de 01.5. Módulos comerciais, Master SaaS, recuperação de fator perdido e auditoria unificada permanecem futuros. Sem implantação/publicação.

## Entrega 01.3 — 09/11/2026

- `npm.cmd test`: 11 testes aprovados de configuração, health, Argon2id, cifra autenticada, CSRF e cookie Secure de produção.
- `npm.cmd run test:integration`: 34 testes aprovados em PostgreSQL real 18.6, incluindo isolamento multiempresa, identidade e senha Unicode.
- Autenticação validada: credenciais incorretas/ausentes/inativas indistinguíveis, cookies HttpOnly, hash sem senha/token em claro, rotação, CSRF/Origin, corpos adulterados, JSON inválido/excessivo sem reflexão de conteúdo, contexto de empresa autorizado e revogação de sessões.
- Expiração absoluta, inatividade, desativação, MFA obrigatório/optativo, QR, cifragem do segredo e rejeição de código repetido aprovados.
- Recuperação validada com entrega controlada de mensagens fictícias: resposta genérica, token não retornado por HTTP, fila cifrada, validade, uso único, duas confirmações concorrentes, encerramento de sessões e preservação de MFA.
- Papéis de banco não permitem leitura de credenciais pela conta comercial nem atualização/remoção de eventos pela conta de identidade.
- `npm.cmd run test:e2e`: 18 cenários aprovados integralmente, incluindo login real, redirecionamento, HttpOnly, logout individual/global, recuperação, MFA, falha de conexão, sessões no celular com e-mail longo e larguras 360/390/768/1440 px.
- Capturas de login desktop/mobile revisadas em `.local/qa/login-desktop.png` e `.local/qa/login-mobile.png`. Erros de captura durante hidratação foram isolados do aplicativo; a captura final confirmou interatividade e ausência de erro de página.
- Captura adicional de segurança no celular em `.local/qa/seguranca-mobile.png`.
- `npm.cmd run typecheck`: aprovado nos três workspaces. `npm.cmd run build`: aprovado em contratos, API e web, incluindo TypeScript e geração das páginas.

Limites: SMTP real não configurado/homologado; nenhum e-mail externo enviado. Bootstrap e leitor local exigem interação humana no terminal, sem contas reais criadas pelo agente. Recuperação de fator MFA perdido e permissões por ação continuam pendentes antes de produção. Sem implantação ou publicação no GitHub.

## Entrega 01.2 — 09/11/2026

PostgreSQL real 18.6 em Windows x64, loopback 55432, persistência em `.local/postgres`. Sem Docker, mocks de SQL ou serviço instalado no Windows. Bancos de integração separados do banco vazio de desenvolvimento.

- `npm.cmd run test:integration`: 15 testes aprovados no relatório Node (14 subcenários e o agrupador).
- `npm.cmd test`: 6 testes de configuração/HTTP/regressão aprovados.
- Sanitização do ambiente remove credenciais de bootstrap/migração dos serviços e a URL de banco do serviço web; teste de regressão aprovado.
- Integração abrange migração incremental, reexecução idempotente, checksum adulterado, rollback de DDL com erro, negação em schema parcialmente migrado, papel real sem privilégios, leitura/escrita sem contexto, IDs/tenant adulterados, WITH CHECK, FK composta, CRUD autorizado e unicidade por tenant.
- Também aprovados rollback de dados, limpeza de contexto na conexão efetivamente reutilizada, 24 chamadas concorrentes com quatro conexões, usuário/vínculo/tenant inativos e pessoa com dois vínculos sem mistura de escopo.
- Readiness HTTP real retornou 200 com papel restrito; uso da conta privilegiada foi recusado. `/api/v1/tenants` continua 404.
- `db:portable:stop` confirmou diretório e encerrou de forma graciosa. Retomada aplicou zero migrações; as duas empresas fictícias do banco de teste permaneceram salvas.
- `npm.cmd run dev` conectou a API com conta restrita; `/api/v1/health/ready` pelo proxy da interface retornou 200 e `database: up`.
- Playwright: 8 testes aprovados com banco real conectado, cobrindo navegação, falha da API, teclado e as quatro larguras de tela.
- `npm.cmd run typecheck`: aprovado nos três workspaces. Capturas do acompanhamento atualizado revisadas em `.local/qa/fundacao-01-2-desktop.png` e `.local/qa/fundacao-01-2-mobile.png`.
- `npm.cmd run build`: aprovado em contratos, API e web, incluindo TypeScript e geração estática. Serviços de QA encerrados após os testes; dados do PostgreSQL preservados.

Limites: login, sessões, permissões por ação, administração de usuários, matriz/filiais, auditoria e módulos comerciais ainda não implementados. Contexto de tenant é interno e não está exposto por HTTP. Compose não executado; não foi realizada homologação de produção.

## Revisão visual das referências — 09/11/2026

- Fotos originais de dashboard e produtos reabertas e comparadas com a implementação.
- Capturas revisadas: `.local/qa/referencia-desktop.png` (1440 px) e `.local/qa/referencia-mobile.png` (390 px).
- `npm.cmd run typecheck`: aprovado nos três workspaces.
- Playwright: 8 testes aprovados, incluindo as larguras 360, 390, 768 e 1440 px, navegação, ajuda, foco e falha da API.
- Cartões escuros, acentos ouro, seis indicadores, ranking vazio e atalhos conferidos visualmente. Indicadores mantêm ausência explícita de dados, sem faturamento fictício.
- API e regras de negócio não foram alteradas; não houve necessidade de repetir os testes da API nesta revisão visual.
- Build final da web (`next build --webpack`): aprovado, incluindo TypeScript e geração estática.

## Entrega 01.1 — 09/11/2026

Ambiente: Windows/PowerShell, Node 26.13.0, npm 11.20.0, Chromium Playwright 1254. Testes realizados localmente, sem implantação e sem acesso a dados comerciais.

| Verificação | Resultado |
| --- | --- |
| Instalação pelo helper Sites, com versões fixadas | Sucesso; lockfile criado; instalação reportou 0 vulnerabilidades conhecidas |
| `npm.cmd test` | 6 testes aprovados |
| `npm.cmd run typecheck` | Aprovado em API, web e contratos |
| `npm.cmd run test:e2e` / CLI equivalente | 8 testes aprovados no Chromium |
| `npm.cmd run build` final | Aprovado em contratos, API e Next.js, incluindo TypeScript e geração estática |
| `npm.cmd run dev` | API e web iniciadas pelo comando único |
| HTTP pelo proxy Next.js | `/` 200, `/api/v1/health/live` 200 e `/api/v1/health/ready` 503 com banco ausente |
| `setup:local` com arquivo existente | SHA-256 de `.env` preservado; sem sobrescrita |
| Revisão visual | Capturas desktop (1440 px) e mobile (390 px) revisadas; fontes ajustadas para legibilidade |
| Arquivos ignorados | `.env`, `.local/qa`, `node_modules`, `dist` e `.next` reconhecidos pelo Git como ignorados |
| Encerramento dos servidores de QA | Portas 3000 e 3333 fechadas após Ctrl+C; sem serviço de teste deixado em execução |

Testes da API: processo encerra sem configuração; leitura da configuração válida; rejeição de configuração ausente; protocolo/credenciais/portas inválidos; integração HTTP liveness/readiness com respostas controladas 200/503; falha de conexão no driver real. Payload de readiness não contém detalhes da conexão. O teste HTTP também confirma ausência de endpoint comercial `/api/v1/tenants`.

Testes E2E: contenção e retorno de foco do menu mobile; dashboard vazio e navegação; ajuda e Escape; API indisponível; quatro larguras (360, 390, 768 e 1440 px) sem overflow horizontal, incluindo navegação móvel. Os indicadores não exibem números comerciais simulados.

Evidências locais: `.local/qa/desktop.png` e `.local/qa/mobile.png` (ignoradas pelo Git). Scripts de teste versionados em `apps/api/src/*spec.ts`, `apps/api/src/health/health.spec.ts` e `tests/e2e/bootstrap.spec.ts`.

Limites: PostgreSQL real não disponível; Compose, conexão bem-sucedida real, migrações e RLS não validados. O retorno de readiness 200 foi validado com adaptador controlado, não com PostgreSQL. Não há autenticação ou cadastro persistente. Nenhum teste desta entrega certifica segurança multiempresa ou prontidão comercial. A Etapa 01 não está concluída.

## Entrega 01.0 — 09/11/2026

Na entrega 01.0, aplicação, banco e interfaces ainda não existiam. Nenhum teste funcional, de segurança, de integração ou visual foi executado naquela entrega documental.

Verificações documentais executadas: SHA-256 de `ESCOPO.md` idêntico ao anexo; 10 arquivos Markdown encontrados e 10 links locais com destino existente; estado Git contendo somente os documentos planejados. `git diff --cached --check` identificou somente três linhas com dois espaços finais no escopo original (quebras de linha Markdown nas linhas 3–5); foram preservadas para manter o anexo idêntico. A conferência dos demais documentos passou sem apontamentos.

## Plano de execução da fundação

| Grupo | Cenários essenciais | Evidência exigida |
| --- | --- | --- |
| Bootstrap | Instalação limpa, build, typecheck, configuração e health | Comando, resultado e versões |
| Isolamento | Dois tenants, ID adulterado, FK cruzada, RLS sem contexto, pool concorrente | Integração em PostgreSQL com papel não privilegiado |
| Sessões | Login, logout, expiração, revogação, recuperação única, MFA | Integração da API e fluxo no navegador |
| Permissões | Operador versus administrador; dois vínculos; acesso direto; último proprietário | Matriz de endpoints e respostas |
| Organização | Pessoas jurídicas, matriz, filial, CD e depósito; restrição por unidade | Persistência e transações verificadas |
| Auditoria | Ator/tenant corretos, imutabilidade no papel da API, rollback | Consulta de banco e falhas induzidas |
| Interface | 360/390/768/1440 px, teclado, foco, labels, estados vazios e erros | Capturas e registro de revisão |

Planejamento detalhado por tarefa em [Etapa 01](docs/ETAPA_01.md). Não usar mocks como única evidência de isolamento ou transações. Banco de testes separado, identificado e descartável; não executar limpeza em banco operacional.

## Regressões futuras obrigatórias

Os 16 cenários da seção 25 do escopo permanecem como critérios dos respectivos módulos: custo médio e histórico; redução de margem; mínimo persistente; embalagem/unidade; leitura mobile; deduplicação de leitura; pagamento misto; pagamento pendente; confirmação duplicada; devolução; transferência; queda de conexão; isolamento entre empresas; preço sem permissão; inventário autorizado; validade e alertas.

## Registro por entrega

Anotar comando, ambiente, resultado, limitações e evidências. Cenário planejado não é cenário aprovado. Falhas devem ser corrigidas antes de considerar o incremento concluído.
