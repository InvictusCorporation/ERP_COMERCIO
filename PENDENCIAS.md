# Pendências

## Próxima entrega — 01.1

- Verificar acesso ao registro npm; fixar versões compatíveis do runtime e dependências. npm local identificado como `11.20.0`.
- Verificar disponibilidade de PostgreSQL/Docker e portas livres. Não instalar nem interromper serviços alheios sem necessidade e autorização apropriada.
- Criar workspace, configuração, health checks e shell responsivo conforme o plano.
- Implementar 01.2–01.6 sequencialmente. A fundação está pendente.

## Decisões antes de produção

- Infraestrutura, domínio, HTTPS, hospedagem e custos.
- Provedor de e-mail transacional e procedimento seguro para o primeiro administrador.
- Backup, retenção, objetivos RPO/RTO e ensaio de restauração.
- Retenção de auditoria e dados pessoais, termos e política de acesso de suporte.
- Integração de CI e política de revisão. O remoto `origin` foi vinculado a `https://github.com/InvictusCorporation/ERP_COMERCIO.git`, informado pelo usuário; a consulta inicial confirmou ausência de refs remotas.
- A identidade de autoria foi obtida da conta GitHub conectada para configuração local deste repositório, sem alterar a configuração global.
- Critérios comerciais de matriz/pessoa jurídica e validações cadastrais finais.

Essas decisões não impedem a implementação local da fundação com adaptadores de teste explicitamente identificados. Sem implantação em produção nesta entrega.

## Etapas posteriores

Provedores Invictus Pay e alternativas, documentação e homologações fiscais, balanças, equipamentos, regras tributárias validadas, limites/preços de planos e integração de IA permanecem sem implementação. Não foram solicitadas credenciais para funcionalidades futuras.
