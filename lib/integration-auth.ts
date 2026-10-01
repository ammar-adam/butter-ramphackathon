/** Server-only helpers. Calling token exchange assumes an already-authorized own-business app. */
import type { Env } from './integration-adapters';
const keys = ['RAMP_ACCESS_TOKEN','RAMP_CLIENT_ID','RAMP_CLIENT_SECRET','RAMP_ENVIRONMENT','SQUARE_ACCESS_TOKEN','SQUARE_ENVIRONMENT','SQUARE_LOCATION_ID'] as const;
export function resolveIntegrationEnv(nodeEnv: Env = {}, workerBindings: Record<string, unknown> = {}): Env {
  const result: Env = {};
  for (const key of keys) result[key] = typeof workerBindings[key] === 'string' ? workerBindings[key] as string : nodeEnv[key];
  return result;
}
export async function exchangeRampClientCredentials(env: Env, fetcher: typeof fetch = fetch) {
  if (!env.RAMP_CLIENT_ID?.trim() || !env.RAMP_CLIENT_SECRET?.trim()) throw new Error('Ramp client credentials are not configured on the server.');
  if (env.RAMP_ENVIRONMENT && !['sandbox','production'].includes(env.RAMP_ENVIRONMENT)) throw new Error('Ramp environment must be sandbox or production.');
  const base = env.RAMP_ENVIRONMENT === 'production' ? 'https://api.ramp.com' : 'https://demo-api.ramp.com';
  const bytes = new TextEncoder().encode(`${env.RAMP_CLIENT_ID.trim()}:${env.RAMP_CLIENT_SECRET.trim()}`);
  const basic = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetcher(`${base}/developer/v1/token`, {
      method:'POST', redirect:'error', signal:controller.signal,
      headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
      body:new URLSearchParams({grant_type:'client_credentials',scope:'bills:read'}).toString(),
    });
    if (!response.ok) throw new Error('Ramp token exchange was rejected. Check the existing app credentials and bills:read permission.');
    const data = await response.json() as Record<string, unknown>;
    if(typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in)<=0) throw new Error('Ramp token exchange returned an invalid response.');
    // Internal return only. Never return this object from a public route or log it.
    return {accessToken:data.access_token as string,expiresAt:Date.now()+Number(data.expires_in)*1000};
  } catch(error) {
    const message = error instanceof Error ? error.message : '';
    if(message==='Ramp token exchange was rejected. Check the existing app credentials and bills:read permission.' || message==='Ramp token exchange returned an invalid response.') throw error;
    throw new Error('Ramp token exchange could not complete. Retry later.');
  } finally {clearTimeout(timer);}
}
/** Use a configured access token first; otherwise exchange existing server-side client credentials. */
export async function withRampReadToken(env: Env, fetcher: typeof fetch = fetch): Promise<Env> {
  if(env.RAMP_ACCESS_TOKEN?.trim()) return env;
  const {accessToken} = await exchangeRampClientCredentials(env,fetcher);
  return {...env,RAMP_ACCESS_TOKEN:accessToken};
}

