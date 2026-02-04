import type { GenerationStore } from '../db/generations.js';
import type { Config } from '../config/loader.js';

interface CostsArgs {
  period?: 'day' | 'week' | 'month' | 'all';
}

interface Context {
  db: GenerationStore;
  config: Config;
}

export async function getCosts(args: CostsArgs, ctx: Context) {
  const period = args.period ?? 'month';

  let since: Date | undefined;
  const now = new Date();

  switch (period) {
    case 'day':
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
      break;
    case 'week':
      since = new Date(now);
      since.setDate(since.getDate() - 7);
      break;
    case 'month':
      since = new Date(now);
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      break;
    case 'all':
      since = undefined;
      break;
  }

  const costs = await ctx.db.getCosts(since);

  const budgetRemaining = period === 'month'
    ? Math.max(0, ctx.config.budget.monthly_limit - costs.total)
    : undefined;

  const budgetPercent = period === 'month'
    ? (costs.total / ctx.config.budget.monthly_limit) * 100
    : undefined;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          period,
          total: costs.total,
          generation_count: costs.generation_count,
          by_provider: costs.by_provider,
          by_model: costs.by_model,
          budget_limit: ctx.config.budget.monthly_limit,
          budget_remaining: budgetRemaining,
          budget_percent: budgetPercent?.toFixed(1),
        }, null, 2),
      },
    ],
  };
}
