# Pendências

## Próximo incremento — 01.2

- Disponibilizar PostgreSQL real para validar o Compose e a conectividade bem-sucedida. Docker e psql não foram localizados no PATH. Não interromper serviços de outros projetos.
- Criar schema de identidade/tenants, executor de migrações, papéis separados e RLS conforme `docs/ETAPA_01.md`.
- Não utilizar `invictus_bootstrap` em operações comerciais. Hoje a API só consulta disponibilidade com `SELECT 1`.
- Validar contexto transacional, constraints e isolamento com o papel real da API antes de avançar para autenticação.
- Implementar 01.3–01.6 sequencialmente. A fundação completa continua pendente.

## Entregue em 01.1

Workspace npm com versões fixadas, configuração local sem sobrescrita, health checks, interface responsiva com estados vazios, navegação de implantação/configurações, testes locais e build. Nenhuma credencial real foi versionada.

## Decisões antes de produção

- Infraestrutura, domínio, HTTPS, hospedagem e custos.
- Provedor de e-mail transacional e procedimento seguro para o primeiro administrador.
- Backup, retenção, objetivos RPO/RTO e ensaio de restauração.
- Retenção de auditoria e dados pessoais, termos e política de acesso de suporte.
- Integração de CI e política de revisão. O remoto `origin` foi vinculado a `https://github.com/InvictusCorporation/ERP_COMERCIO.git`, informado pelo usuário; a consulta inicial confirmou ausência de refs remotas.
- A identidade de autoria foi obtida da conta GitHub conectada para configuração local deste repositório, sem alterar a configuração global.
- Envio ao GitHub público: bloqueado pela revisão automática porque faltou autorização explícita para divulgar o escopo completo. O usuário pediu iniciar a criação; isso não foi tratado como autorização de publicação. Não reenviar por outra ferramenta.
- Critérios comerciais de matriz/pessoa jurídica e validações cadastrais finais.

Essas decisões não impedem a implementação local da fundação com adaptadores de teste explicitamente identificados. Sem implantação em produção nesta entrega.

## Etapas posteriores

Provedores Invictus Pay e alternativas, documentação e homologações fiscais, balanças, equipamentos, regras tributárias validadas, limites/preços de planos e integração de IA permanecem sem implementação. Não foram solicitadas credenciais para funcionalidades futuras.
