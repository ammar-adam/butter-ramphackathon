import type {Env} from './integration-adapters';
// Private, short-lived server memory. No credentials are written to source,
// browser storage, logs or response payloads. Isolate restarts clear sessions.
const sessions=new Map<string,{expires:number,env:Env}>();
export function sandboxSession(userId:string):Env{const v=sessions.get(userId);if(!v||v.expires<Date.now()){sessions.delete(userId);return {}}return v.env}
export function saveSandboxSession(userId:string,env:Env){sessions.set(userId,{expires:Date.now()+8*60*60*1000,env:{...sandboxSession(userId),...env}})}
