import 'dotenv/config';
import { readConfig } from '../src/config.js';
const required = ['DASHBOARD_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_TEAM_ID',
  'SLACK_DEMO_CHANNEL_ID', 'SLACK_SUPERVISOR_USER_IDS', 'SLACK_LEAD_USER_ID',
  'SLACK_BACKUP_USER_ID', 'OPENROUTER_API_KEY', 'SAFESLACKFORCE_MODEL'];
const missing = required.filter(key => !(process.env[key] ?? (key === 'SAFESLACKFORCE_MODEL' ? process.env.INCIDENTOS_MODEL : ''))?.trim());
console.log('SafeSlackForce readiness check (no secret values printed)');
console.log(missing.length ? `Missing live configuration: ${missing.join(', ')}` : 'All required live variables are present');
if (missing.length) process.exitCode = 1;
else {
  const c = readConfig();
  console.log(`Mode: ${c.mode}. Model allowance: $${c.modelBudget}; ${c.callLimit} attempts maximum.`);
  console.log(`Exa: ${c.exaEnabled ? 'enabled; verify its provider balance separately' : 'disabled'}. Vision: ${c.visionEnabled ? 'enabled' : 'disabled'}.`);
  if (process.argv.includes('--live')) {
    let grantedScopes: string[] = [];
    const slack = async (method: string, args: object = {}) => {
      const res = await fetch(`https://slack.com/api/${method}`, { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${c.botToken}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(args as Record<string, string>) });
      const value = await res.json() as any;
      if (!res.ok || !value.ok) throw new Error(`Slack ${method}: ${value.error || res.status}`);
      if (method === 'auth.test') grantedScopes = (res.headers.get('x-oauth-scopes') || '').split(',').map(scope => scope.trim()).filter(Boolean);
      return value;
    };
    try {
      const auth = await slack('auth.test'); if (auth.team_id !== c.team) throw new Error('Bot token belongs to a different workspace');
      const scopes = ['app_mentions:read', 'channels:history', 'channels:read', 'chat:write', ...(c.filesEnabled ? ['files:read'] : [])];
      const missingScopes = scopes.filter(scope => !grantedScopes.includes(scope));
      if (missingScopes.length) throw new Error(`Installed bot permissions could not be verified: ${missingScopes.join(', ')}. Check OAuth scopes and reinstall the Slack app if needed.`);
      const info = await slack('conversations.info', { channel: c.channel });
      if (!info.channel?.is_member) throw new Error('Invite the bot to the configured public demo channel');
      if (info.channel?.is_private) throw new Error('This manifest subscribes to public channels only');
      console.log('Slack bot identity, workspace, granted permissions and public channel membership verified.');
      console.log('Installed event subscriptions are not verified by bot authentication. Check app_mention and message.channels, enable Interactivity, and run only one incident runtime per Slack app. Socket delivery and human actions still require a live rehearsal.');
      const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
      const models = await response.json() as { data?: { id: string; supported_parameters?: string[]; pricing?: { prompt?: string; completion?: string } }[] };
      const model = models.data?.find(m => m.id === c.model);
      if (!model?.supported_parameters?.includes('tools')) throw new Error('Configured model was not found with tool support in the provider catalog');
      console.log('Configured model advertises tool support. Current per-token pricing:', JSON.stringify(model.pricing));
      console.log('No model inference or Exa search was performed. Verify OpenRouter key validity and spending limit in its dashboard.');
    } catch (e) { console.error(e instanceof Error ? e.message : 'Live configuration check failed'); process.exitCode = 1; }
  }
}
