import type { Config } from './config.js';
import { Budget } from './budget.js';
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: object } };
export type ModelMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_call_id?: string; tool_calls?: ToolCall[] };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type Completion = { content: string | null; tool_calls?: ToolCall[]; usage?: Record<string, number> };
export interface Model { complete(messages: ModelMessage[], tools: ToolSpec[]): Promise<Completion> }
export class OpenRouter implements Model {
  constructor(private config: Config, private budget: Budget) {}
  async complete(messages: ModelMessage[], tools: ToolSpec[]): Promise<Completion> {
    if (!this.config.apiKey || !this.config.model) throw new Error('OpenRouter key and model are not configured');
    if (JSON.stringify(messages).length > 70000) throw new Error('Agent context limit reached');
    const reservation = this.budget.reserve('openrouter', this.config.callLimit, this.config.callReserve, this.config.modelBudget);
    try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'SafeSlackForce' },
      body: JSON.stringify({ model: this.config.model, messages, tools, tool_choice: 'auto', max_tokens: 1000, temperature: 0.1 }),
    });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}`);
    const data = await response.json() as { error?: unknown; choices?: { message: Completion }[]; usage?: Record<string, number> };
    const message = data.choices?.[0]?.message;
    if (data.error || !message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw new Error('Model provider returned an invalid completion');
    this.budget.finish(reservation, 'done', data.usage?.cost, data.usage?.total_tokens);
    return { ...message, usage: data.usage };
    } catch (error) { this.budget.finish(reservation, 'failed'); throw error; }
  }
}
