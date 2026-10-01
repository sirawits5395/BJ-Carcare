import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export function db(){if(!env.DB)throw Error('Database unavailable');return env.DB}
export function bucket(){if(!env.BUCKET)throw Error('Storage unavailable');return env.BUCKET}
export async function owner(){const u=await getChatGPTUser();if(!u)throw new Response('กรุณาเข้าสู่ระบบ', {status:401});return u.userId}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new Response('Forbidden',{status:403})}
export function fail(e:unknown){if(e instanceof Response)return e;console.error(e);return Response.json({error:'ไม่สามารถบันทึกหรือโหลดข้อมูลได้ กรุณาลองอีกครั้ง'}, {status:503})}
