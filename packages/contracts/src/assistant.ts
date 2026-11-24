export const ASSISTANT_TOPICS = {
  sales: { title: 'Vendas e resultados', description: 'Prepare perguntas sobre vendas de pedidos manuais e evolução do faturamento.', question: 'Como evoluíram as vendas neste período?', href: '/relatorios' },
  stock: { title: 'Estoque e reposição', description: 'Organize a análise de produtos em falta, excesso e necessidade de reposição.', question: 'Quais produtos precisam de reposição?', href: '/estoque' },
  margin: { title: 'Custos e margens', description: 'Prepare a avaliação do resultado bruto dos produtos e das margens.', question: 'Quais produtos precisam de revisão de margem?', href: '/relatorios' },
  purchasing: { title: 'Compras e fornecedores', description: 'Prepare comparações de compras recebidas e custos de fornecedores.', question: 'Quais fornecedores tiveram aumento de custo no período?', href: '/compras' },
  finance: { title: 'Financeiro e caixa', description: 'Organize perguntas sobre os registros financeiros manuais e vencimentos.', question: 'Quais vencimentos merecem atenção neste período?', href: '/financeiro' },
} as const;
export type AssistantTopic = keyof typeof ASSISTANT_TOPICS;
export type AssistantDraftInput = { topic: AssistantTopic; unitId: string; from: string; to: string; question: string };
export type AssistantOverview = {
  state: 'disabled'; provider: null; today: string; from: string; to: string;
  units: { id: string; name: string; companyName: string }[];
  topics: { id: AssistantTopic; unitIds: string[] }[];
};
export type AssistantDraft = AssistantDraftInput & {
  state: 'draft'; generatedAnswer: null; sentToProvider: false;
  unitName: string; companyName: string; preparedAt: string;
};
