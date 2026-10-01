import {lineConfig} from '@/lib/line-config';
import {dispatchReminders} from '@/lib/dispatch';
import {fail} from '@/lib/server';
export async function POST(req:Request){try{const c=lineConfig();if(!c.cronSecret||req.headers.get('authorization')!=='Bearer '+c.cronSecret)return new Response('Unauthorized',{status:401});return Response.json(await dispatchReminders())}catch(e){return fail(e)}}
