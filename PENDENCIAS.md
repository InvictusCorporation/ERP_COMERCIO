# Pendências

## Incremento 12.1 — relatórios e gestão entregues localmente

Dashboards, indicadores, filtros, onze relatórios paginados e CSV auditado implementados. Complementos: DRE/classificação contábil, metas/orçamentos, categoria histórica, identificação única do responsável em pedidos antigos, preferências, relatórios agendados/envio, PDF/XLSX nativos, saldos históricos, previsão, IA e BI. Sem integrações externas presumidas. Guia em [Relatórios e indicadores](docs/RELATORIOS_INDICADORES.md).

## Incremento 11.1 — clientes e atendimento entregues localmente

Cadastro/histórico, crediário aprovado, recebíveis, pontos, pedidos/estoque e entregas manuais implementados. Complementos: governança do cliente entre filiais, juros/cobrança externa, relatórios de inadimplência, expiração/campanhas/cashback, desconto automático por pontos, canais digitais, parcialização, integração fiscal de pedidos e transportadoras. Nenhuma integração ou publicação presumida. Guia em [Clientes, pedidos e entregas](docs/CLIENTES_PEDIDOS_ENTREGAS.md).

## Rede e distribuição — 10.1 entregue localmente

Entregues painel e estoque consolidados, CDs da estrutura existente, transferências operacionais da mesma empresa legal com aprovação/trânsito/conferência integral e compra central com distribuição vinculada. Próximos: divergências/recebimento parcial de transferências, devolução/estorno supervisionado, reservas e separação, fiscal/transporte, interempresas, entrega direta multidestino, alteração de planos, metas, preços/promoções por filial, centros de custo e consolidação financeira/DRE. Guia em [Rede e distribuição](docs/REDE_DISTRIBUICAO.md).

## Supermercado — 09.1 entregue localmente

Implementados setores por filial, peso manual, etiquetas internas por gramas, fichas técnicas, consumo FEFO, custo exato de produção e estorno auditado. Etapa 09 completa pendente: informar equipamentos/protocolos, integrar e homologar hardware, carga de PLUs, formatos por preço/fabricante, impressão/rotulagem real, planejamento/ordens, subprodutos e custo indireto. Não houve comunicação física ou publicação. Guia em [Setores, pesagem e produção](docs/SETORES_PESAGEM_PRODUCAO.md).

## Estoque avançado — 08.1 entregue localmente

Lotes, alertas de validade, classificação sem duplicar saldo, bloqueio, perdas/avarias, estorno, relatório, reposição por limites e baixa/devolução rastreadas no PDV. Compras continuam uma entrada e exigem classificação posterior para produtos controlados. Pendentes: coleta no recebimento com origem/fornecedor, leitura GS1, inventário por lote aprovado, quarentena formal, XML de rastreabilidade, notificações agendadas, promoções com aprovação, previsão de demanda e homologação física. Custos médios e bloqueios de ambiente de produção existentes preservados. Guia em [Lotes, validade e perdas](docs/LOTES_VALIDADE_PERDAS.md).

## Fiscal — 07.1 entregue localmente; homologação externa pendente

Conferência, emitente/produtos por filial, documentos, operações, arquivos e auditoria implementados. Adaptador opcional Focus NFe homologação testado com transporte sintético; nenhum envio real. Falta definir provedor/piloto/UF/CRT, certificado/CSC, credenciamento e validar NF-e/NFC-e, XML/DANFE, rejeições e cancelamento reais com responsável fiscal. Produção permanece bloqueada. Próximos complementos: motor tributário/RTC, contingência, CC-e/inutilização, devolução fiscal, XML de compras, retenção e webhooks. Guia em [Fiscal](docs/FISCAL.md).

## Incremento 06.1 — financeiro manual entregue localmente

Contas a pagar/receber, parcelas, baixas e estornos, caixa/banco manual, fluxo/extrato, transferência interna e conferência, com escopo e auditoria. Compras têm geração explícita de título por recebimento. PDV simulado continua separado. Próximos: provedores/recebíveis, conciliação bancária, CRM/crediário, renegociação, DRE/consolidação e homologação operacional. Guia em [Financeiro](docs/FINANCEIRO.md).

## Incremento 05.1 — PDV de teste entregue localmente

PDV desktop/mobile, caixa, rascunhos, simulação explícita de pagamento misto/troco, baixa, devolução integral e auditoria integrados. Restam pagamento real/reconciliação (06), fiscal (07), devolução parcial, atacado/promoções, cliente/crediário, homologação de balanças/etiquetas, offline, impressão/leitores e homologação em celulares físicos. Uso do PDV em ambiente de produção permanece bloqueado. Guia em [PDV, vendas e caixa](docs/PDV_VENDAS.md).

## Incrementos 02.2 / 04.1

Entregues fornecedores e ciclo manual de compras: rascunho, aprovação, recebimento parcial/integral, custo rateado, entrada de estoque vinculada, estorno, margem e auditoria. Guia em [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md).

Próximos: cotação/comparação, consultas agregadas 30/60/90 dias, fornecedor principal/alternativo no produto, XML/NF-e com conferência fiscal, contas a pagar, revisão após aprovação/entregas, fechamento de saldo não entregue e devoluções. Lotes/validade continuam na etapa 08. Sem mensagens a fornecedores ou integrações externas.

## Incrementos 02.1 / 03.1

Entregues catálogo básico e estoque manual por unidade, com custos, reservas, limites, estornos e auditoria. Ver [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md). Etapas 02 e 03 completas permanecem em evolução.

Próximos complementos: foto, fornecedores e dados fiscais de produto; compras/recebimento e XML; inventário com aprovação; transferências; preços por filial/atacado; múltiplas conversões. Lotes/validade pertencem à etapa 08. Não há coleta de lote, controle de vencimento ou alerta de validade nesta entrega. Dashboard/central de notificações ainda não consomem este módulo.

## Próximos passos

- Próximo avanço: complementar rastreabilidade no recebimento, notificações e previsão/reposição; Complementar a Etapa 09 com integração/homologação física e produção avançada. Homologações externas do fiscal e financeiro continuam pendentes.
- CI está preparada, mas sua execução no GitHub/Linux depende de publicação/autorização e permanece sem evidência remota.
- Antes de produção: SMTP real, recuperação de fator perdido, infraestrutura/HTTPS, backup/restauração e política definitiva de retenção/arquivamento do histórico.

## Entregue em 01.6

Auditoria unificada de mudanças cadastrais/acesso, segurança pessoal e contexto, com snapshots permitidos, responsável preservado, correlação por requisição, RLS e consulta limitada à rede/unidades atuais. Histórico anterior importado sem inventar antes/depois. Eventos atômicos: falha na auditoria reverte a alteração. Tela responsiva com filtros, paginação, comparação e mesma operação. Guia em [Auditoria](docs/AUDITORIA.md). Sem purge/exclusão automática, assinatura externa ou publicação.

## Entregue em 01.5

Empresas legais com CNPJ numérico/alfanumérico, matriz criada atomicamente, filiais, CDs e depósitos com vínculos compostos e identidades permanentes. Escopo global ou por unidades em usuários e convites; seletores limitados, invalidação de contexto e disponibilidade pela hierarquia. RLS e `withUnit` testados no papel comercial real. Guia em [Empresas e unidades](docs/EMPRESAS_UNIDADES.md). Sem dados reais criados, implantação ou e-mails externos.

A validação de CNPJ é de formato/DV, sem consulta fiscal. Estoques/transferências/consolidação operacional permanecem futuros. SMTP real e suporte de recuperação de fator ainda pendentes antes de produção.

## Entregue em 01.4

Cadastro de usuários por convite de uso único, perfis padrão/personalizados por empresa, suspensão/reativação de vínculo, limites de concessão, proteção concorrente do último proprietário e eventos transacionais imutáveis. API reavalia permissões e vínculos em cada ação. Telas responsivas de equipe, perfis e aceite seguem as referências. Guia em [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).

SMTP real segue pendente; nenhuma mensagem externa enviada. Escopo de filial aguarda 01.5. Perfis comerciais não liberam módulos ainda ausentes. Master SaaS e edição de identidade global permanecem fora deste módulo.

## Entregue em 01.3

Login com Argon2id, cookie HttpOnly, sessões persistentes com validade/revogação, proteção CSRF/Origin, contexto empresarial derivado da sessão, recuperação de uso único e MFA. Telas responsivas de login, recuperação, redefinição, verificação e segurança; bootstrap administrativo local sem senha padrão. Nenhuma conta real criada automaticamente.

Envio SMTP real depende de provedor, remetente e credenciais privados e ainda não foi homologado. Desenvolvimento usa outbox cifrada e consulta explícita no terminal. Códigos de reserva e procedimento de suporte para perda do fator MFA permanecem pendentes antes de produção. Ver `docs/AUTENTICACAO.md`.

## Entregue em 01.2

PostgreSQL 18.6 portátil, migrações com checksum/lock/transação, papéis separados, RLS forçado, contexto transacional, vínculo ativo, constraints compostas e testes em banco real. Parada e retomada sem apagar dados; readiness real via proxy web aprovado. Direção visual das cinco referências preservada.

Docker/Compose permanece alternativa ainda não executada nesta máquina. Não é necessário para o fluxo Windows portátil validado. Não utilizar a conta bootstrap na API: a execução recusa papéis privilegiados.

## Entregue em 01.1

Workspace npm com versões fixadas, configuração local sem sobrescrita, health checks, interface responsiva com estados vazios, navegação de implantação/configurações, testes locais e build. Nenhuma credencial real foi versionada.

## Decisões antes de produção

- Infraestrutura, domínio, HTTPS, hospedagem e custos.
- Provedor de e-mail transacional, remetente e homologação SMTP. O bootstrap seguro do primeiro administrador já existe como comando local interativo.
- Procedimento de recuperação de fator MFA perdido, proteção das chaves de cifra e ajuste de limites/proxy à infraestrutura real.
- Backup, retenção, objetivos RPO/RTO e ensaio de restauração.
- Retenção de auditoria e dados pessoais, termos e política de acesso de suporte.
- Integração de CI e política de revisão. O remoto `origin` foi vinculado a `https://github.com/InvictusCorporation/ERP_COMERCIO.git`, informado pelo usuário; a consulta inicial confirmou ausência de refs remotas.
- A identidade de autoria foi obtida da conta GitHub conectada para configuração local deste repositório, sem alterar a configuração global.
- Envio ao GitHub público: bloqueado pela revisão automática porque faltou autorização explícita para divulgar o escopo completo. O usuário pediu iniciar a criação; isso não foi tratado como autorização de publicação. Não reenviar por outra ferramenta.
- Critérios comerciais de matriz/pessoa jurídica e validações cadastrais finais.

Essas decisões não impedem a implementação local da fundação com adaptadores de teste explicitamente identificados. Sem implantação em produção nesta entrega.

## Etapas posteriores

Provedores Invictus Pay e alternativas, homologações fiscais externas, balanças, equipamentos, regras tributárias validadas, limites/preços de planos e integração de IA permanecem sem implementação. Não foram solicitadas credenciais para funcionalidades futuras.
