import type { GenerationStore } from '../db/generations.js';

interface ListArgs {
  limit?: number;
}

interface Context {
  db: GenerationStore;
}

export async function listGenerations(args: ListArgs, ctx: Context) {
  const limit = args.limit ?? 10;
  const generations = await ctx.db.listGenerations(limit);

  const summary = generations.map(gen => ({
    id: gen.id,
    prompt: gen.prompt.slice(0, 80) + (gen.prompt.length > 80 ? '...' : ''),
    model: gen.model,
    created_at: gen.created_at,
    cost: gen.cost,
    selected: gen.selected_index !== null && gen.selected_index !== undefined,
    public_url: gen.public_url,
  }));

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          count: summary.length,
          generations: summary,
        }, null, 2),
      },
    ],
  };
}
