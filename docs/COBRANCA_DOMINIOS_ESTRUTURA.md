# Cobrança e domínios — estrutura 13.2

Preparação local, sem escolha definitiva de fornecedor, cobrança externa ou publicação.

## Entrega atual

- Aba **Cobrança e domínios** em `/plataforma`, para proprietário e Master, com cartões preto, branco e dourado e reorganização em uma coluna no celular.
- `GET /api/v1/commercial/integrations`, autenticado e autorizado novamente no servidor. Consulta somente capacidades globais desativadas, sem expor credenciais, configurações de infraestrutura ou dados de outras redes. Funcionários não recebem essa consulta.
- Contratos TypeScript para solicitação de cobrança de assinatura e verificação de domínio. Interfaces no servidor para substituir por adaptadores quando forem definidos os serviços.
- Adaptadores desativados recusam operações com indisponibilidade. Não há transporte HTTP/DNS, webhook público, tarefa de renovação ou variável que habilite integrações nesta versão.
- Normalização sintática de hostname ASCII, sem protocolo, porta, caminho, IP, curinga ou sufixos locais. A função é uma base interna para a próxima etapa; não comprova propriedade e não ativa roteamento.

Os cartões mostram **aguardando integração**, sem criar faturas ou apresentar pagamentos fictícios. As assinaturas administrativas, sua vigência e os bloqueios comerciais anteriores continuam iguais. Não se presume que os provedores recomendados foram contratados.

Não há tabelas novas ou alterações nas migrações 001–032. Não se armazenam domínio, cliente externo ou credencial nesta entrega. Não há alteração da autenticação, de `APP_ORIGIN`, cookies, `Host` ou identidade do login público. O identificador da identidade visual continua apenas reservado.

## Conexão posterior da cobrança

1. Definir o provedor e criar credenciais privadas de sandbox, separadas de produção. A cobrança é da assinatura do ERP, separada dos pagamentos de vendas no PDV.
2. Criar persistência por rede para cliente externo, faturas, tentativas e eventos, com RLS, autorização Master, versão e auditoria. Valores em centavos inteiros; período e versão do contrato registrados na fatura.
3. Implementar o adaptador com chave de idempotência persistente por rede/contrato/período. Repetir uma tentativa reutiliza a mesma chave. Criar cobrança retorna pendente; não confirma recebimento nem renova a assinatura.
4. Implementar recepção autenticada de eventos, deduplicação por provedor/evento, conciliação e tratamento de respostas perdidas e fora de ordem. Somente eventos verificados podem mudar o estado financeiro. Testar autorização do pagador para recorrência, estornos, cancelamentos e inadimplência antes da ativação.
5. Definir e testar a política de renovação/suspensão. As assinaturas manuais atuais não devem ser convertidas automaticamente em débitos.

## Conexão posterior dos domínios e hospedagem

1. Registrar domínio e escolher hospedagem/DNS. Asaas, Registro.br, Cloudflare e AWS foram recomendações, não configurações ativas.
2. Adicionar registro persistente e exclusivo de hostname por rede, desafio de propriedade com expiração, auditoria e estados pendente/verificado/TLS/ativo/revogado. Sintaxe válida não significa domínio disponível ou pertencente ao solicitante.
3. Implementar o adaptador de verificação sem permitir requisições a URLs arbitrárias, endereços privados ou serviços internos. Revalidar domínio e controlar revogação/reutilização.
4. Configurar TLS e proxy confiável. Resolver a rede somente a partir do cadastro de hosts ativos e verificados. Nunca conceder contexto com `Host`, `X-Forwarded-Host` ou identificador de rede fornecido pelo cliente sem validação.
5. Revisar a origem/CSRF e o vínculo entre host, sessão e rede antes de habilitar login por marca. Preservar cookies seguros por host e isolamento entre redes.
6. Provisionar aplicação Next.js, API NestJS e PostgreSQL com papéis separados; definir processo de execução de tarefas apenas quando existir um executor. Incluir armazenamento, e-mail, backup externo, restauração testada e monitoramento. Medir capacidade antes de operação comercial.

Esta estrutura não implanta serviços, não reserva domínio e não habilita cobrança, PDV ou fiscal de produção.
