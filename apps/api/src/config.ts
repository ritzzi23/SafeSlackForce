import 'dotenv/config';
import { z } from 'zod';
export function readConfig(env = process.env) {
  const mode = z.enum(['live', 'fixture']).parse(env.INCIDENTOS_MODE ?? 'fixture');
  const token = env.DASHBOARD_TOKEN ?? '';
  if (token.length < 24) throw new Error('Set DASHBOARD_TOKEN to at least 24 random characters in .env.');
  return {
    mode, token, host: env.HOST ?? '127.0.0.1', port: Number(env.PORT ?? 4100),
    database: env.DATABASE_PATH ?? 'data/incidentos.sqlite', origin: env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    apiKey: env.OPENROUTER_API_KEY ?? '', model: env.INCIDENTOS_MODEL ?? '',
    appToken: env.SLACK_APP_TOKEN ?? '', botToken: env.SLACK_BOT_TOKEN ?? '',
    team: env.SLACK_TEAM_ID ?? 'TDEMO', channel: env.SLACK_DEMO_CHANNEL_ID ?? 'CDEMO',
    supervisors: (env.SLACK_SUPERVISOR_USER_IDS ?? 'USUPERVISOR').split(',').filter(Boolean),
    lead: env.SLACK_LEAD_USER_ID ?? 'ULEAD', backup: env.SLACK_BACKUP_USER_ID ?? 'UBACKUP',
    followupMs: z.coerce.number().positive().parse(env.FOLLOWUP_SECONDS ?? 300) * 1000,
    callLimit: z.coerce.number().int().positive().parse(env.MODEL_CALL_LIMIT ?? 40),
    maxRounds: z.coerce.number().int().min(1).max(10).parse(env.MODEL_MAX_ROUNDS ?? 5),
    modelBudget: z.coerce.number().positive().parse(env.MODEL_BUDGET_USD ?? 1),
    callReserve: z.coerce.number().positive().parse(env.MODEL_CALL_RESERVE_USD ?? 0.05),
    exaKey: env.EXA_API_KEY ?? '', exaEnabled: env.EXA_ENABLED === 'true',
    exaCallLimit: z.coerce.number().int().positive().parse(env.EXA_CALL_LIMIT ?? 5),
  };
}
export type Config = ReturnType<typeof readConfig>;
