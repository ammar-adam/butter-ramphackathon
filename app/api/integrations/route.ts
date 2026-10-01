import {getChatGPTUser} from '../../chatgpt-auth';
import {integrationStatus,fetchRampPurchases,fetchSquareSales} from '@/lib/integration-adapters';
import {env as workerEnv} from 'cloudflare:workers';
import {resolveIntegrationEnv,withRampReadToken} from '@/lib/integration-auth';
import {sandboxSession,saveSandboxSession} from '@/lib/sandbox-session';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getChatGPTUser();
  if(!user) return Response.json({error:'Sign in to access integrations.'},{status:401});
  const provider=new URL(request.url).searchParams.get('provider');
  try {
    // Tokens stay in the server environment and never enter browser bundles.
    const environment={...resolveIntegrationEnv(process.env,workerEnv as unknown as Record<string,unknown>),...sandboxSession(user.userId)};
    if(provider==='ramp') return Response.json(await fetchRampPurchases(await withRampReadToken(environment)),{headers:{'Cache-Control':'no-store'}});
    if(provider==='square') return Response.json(await fetchSquareSales(environment),{headers:{'Cache-Control':'no-store'}});
    if(provider) return Response.json({error:'Unknown provider.'},{status:400});
    return Response.json(integrationStatus(environment),{headers:{'Cache-Control':'no-store'}});
  } catch(error){return Response.json({error:error instanceof Error?error.message:'Integration failed.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'Sign in first.'},{status:401});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
  try{
    const raw=await request.text();if(raw.length>16000)return Response.json({error:'Request too large.'},{status:413});
    const data=JSON.parse(raw) as Record<string,unknown>;
    const value=(key:string)=>typeof data[key]==='string'?(data[key] as string).trim():'';
    if(data.provider==='ramp'){
      const configuration={RAMP_ENVIRONMENT:'sandbox',RAMP_CLIENT_ID:value('clientId'),RAMP_CLIENT_SECRET:value('clientSecret'),RAMP_ACCESS_TOKEN:value('accessToken')};
      const authorized=await withRampReadToken(configuration);const sample=await fetchRampPurchases(authorized,{maxPages:1});
      saveSandboxSession(user.userId,authorized);
      return Response.json({ok:true,provider:'ramp',records:sample.purchases.length},{headers:{'Cache-Control':'no-store'}});
    }
    if(data.provider==='square'){
      const configuration={SQUARE_ENVIRONMENT:'sandbox',SQUARE_ACCESS_TOKEN:value('accessToken'),SQUARE_LOCATION_ID:value('locationId')};
      const sample=await fetchSquareSales(configuration,{maxPages:1});saveSandboxSession(user.userId,configuration);
      return Response.json({ok:true,provider:'square',records:sample.sales.length,location:sample.location.name},{headers:{'Cache-Control':'no-store'}});
    }
    return Response.json({error:'Unknown provider.'},{status:400});
  }catch(error){return Response.json({error:error instanceof Error&&!(error instanceof SyntaxError)?error.message:'Invalid connection request.'},{status:400,headers:{'Cache-Control':'no-store'}})}
}
