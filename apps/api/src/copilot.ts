import type express from 'express';
import OpenAI from 'openai';
import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNodeExpressEndpoint } from '@copilotkit/runtime';
import type { Config } from './config.js';

export const COPILOT_ENDPOINT = '/api/copilotkit';

/**
 * CopilotKit runtime for the dashboard copilot. It uses the same OpenRouter key and model as the
 * agents, sits behind the paired-session check, and has its own request cap because CopilotKit
 * calls do not pass through the agent Budget reservations.
 */
export function copilotHandler(config: Config): express.RequestHandler | undefined {
  if (!config.apiKey || !config.model) return undefined;
  const openai = new OpenAI({ apiKey: config.apiKey, baseURL: 'https://openrouter.ai/api/v1' });
  const serviceAdapter = new OpenAIAdapter({ openai: openai as any, model: config.model });
  const handler = copilotRuntimeNodeExpressEndpoint({ runtime: new CopilotRuntime(), serviceAdapter, endpoint: COPILOT_ENDPOINT });
  let calls = 0;
  return (req, res, next) => {
    if (req.method === 'POST' && ++calls > config.copilotCallLimit) { res.status(429).json({ error: 'Copilot request limit reached for this server run' }); return; }
    Promise.resolve(handler(req, res)).catch(next);
  };
}
