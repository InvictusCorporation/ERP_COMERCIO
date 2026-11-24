# Assistente e IA gerencial — estrutura 14.1

Painel `/assistente`, disponível pelo menu Assistente inteligente, com visual preto, branco e dourado e adaptação para celular. Esta entrega prepara consultas futuras, sem integrar modelos de IA ou apresentar respostas artificiais como análises reais.

## Fluxo disponível

O usuário seleciona a filial autorizada, informa o período e escolhe um tema: vendas/resultados, estoque/reposição, custos/margens, compras/fornecedores ou financeiro/caixa. Cada tema preenche uma pergunta inicial editável. Preparar pergunta valida novamente a sessão e o acesso no servidor e devolve um **rascunho**, com contexto explícito e status IA desconectada.

Não há conversa simulada, indicadores inventados, recomendação automática ou alegação de análise concluída. O vínculo para o módulo operacional permite consultar os recursos já existentes; o usuário ajusta os filtros no módulo de destino. O rascunho não transfere automaticamente seus filtros para esses módulos.

As perguntas são enviadas somente à própria API para validação e devolvidas à tela. Não são persistidas, não formam histórico e não são enviadas a provedor externo. Atualizar, recarregar, trocar tema/filial ou editar filtros limpa o resultado anterior. Conteúdo textual é renderizado como texto, sem HTML ou Markdown executável. Não se coletam dados operacionais para um modelo nesta etapa.

## Autorização e contexto

O acesso exige `reports.read` e `organizations.read`, filtrados pela disponibilidade comercial já existente. Cada tema exige também as permissões de consulta do módulo de origem. As unidades são resolvidas pelo servidor e pelas políticas existentes, nunca por identificador de rede enviado no corpo. Os rascunhos aceitam uma filial explícita; não há consolidação automática de várias redes ou filiais.

- Vendas: `orders.read`, para a origem de pedidos manuais. Vendas simuladas do PDV não entram implicitamente nesse tema.
- Estoque: `stock.read` e `products.read`.
- Margens: `orders.read` e `stock.read`; resultado bruto não equivale a lucro líquido.
- Compras: `purchases.read`.
- Financeiro: `finance.read`, para registros financeiros manuais.

As permissões são verificadas por filial na consulta e novamente ao preparar. Filial alheia/inacessível não é revelada. Vínculo suspenso, sessão inválida, módulo desativado e falta de permissão bloqueiam a API. O acesso Master comercial não concede consultas gerenciais.

## Estrutura técnica

- Contratos compartilhados para temas, capacidades, entrada e rascunho.
- `GET /api/v1/assistant/overview`: contexto de filiais e temas autorizados; status de integração desativado, sem dados de vendas/estoque/financeiro.
- `POST /api/v1/assistant/draft`: origem, JSON, CSRF e validação estrita; pergunta de 5–2000 caracteres, tema de catálogo, UUID de filial e período de até 367 dias. Não recebe `tenantId`, modelo, SQL, papel ou comandos de execução.
- Interface de adaptador `ManagementAssistantGateway`, com implementação desativada que recusa análise. Nenhuma configuração ou chave ativa essa integração nesta versão. O preparo de rascunho não chama o adaptador.
- Sem migração, tabela, fila, tarefa agendada ou armazenamento novo. Migrações 001–032 preservadas.

## Integração posterior

Definir provedor/modelo e credenciais privadas, limites de consumo, retenção de perguntas e consentimento de envio. Implementar extração mínima de evidências de fontes autorizadas, mantendo rede, filial, período, origem, horário e critérios de cálculo explícitos. Revalidar autorização antes de cada consulta e antes de devolver o resultado.

O modelo não deve construir SQL livre nem escolher uma rede a partir da pergunta. Conteúdo de perguntas, cadastros e documentos não concede instruções de sistema ou permissões. Respostas devem distinguir evidência, cálculo, inferência e ausência de dados; sem prometer previsão ou diagnóstico quando não houver base.

Histórico, exportação, auditoria de consultas/execuções, avaliação de qualidade, limites de requisição e proteção de dados enviados ao provedor são próximos incrementos. As sugestões não executam compras, pagamentos, movimentações de estoque ou alterações de preço. Qualquer futura proposta de ação exige fluxo próprio de revisão, autorização, idempotência e auditoria; o adaptador de análise não recebe ferramentas de escrita.
