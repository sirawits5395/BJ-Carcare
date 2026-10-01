import {env} from 'cloudflare:workers';
export async function GET(){const e=env as any;return Response.json({liffId:e.LINE_LIFF_ID||'',enabled:e.CUSTOMER_REGISTRATION_ENABLED==='true',account:'@bjcarcare'},{headers:{'Cache-Control':'no-store'}})}
