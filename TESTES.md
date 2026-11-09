# Testes e evidências

## Entrega 01.0 — 09/11/2026

Aplicação, banco e interfaces ainda não existem. Nenhum teste funcional, de segurança, de integração ou visual foi executado. Esta entrega não certifica o funcionamento de módulos.

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
