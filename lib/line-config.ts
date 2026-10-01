import {env} from 'cloudflare:workers';
import type {LineConfig} from './line-core';
export function lineConfig():LineConfig {const e=env as any;return {token:e.LINE_CHANNEL_ACCESS_TOKEN||'',secret:e.LINE_CHANNEL_SECRET||'',loginChannelId:e.LINE_LOGIN_CHANNEL_ID||'',liffId:e.LINE_LIFF_ID||'',ownerId:e.BJ_OWNER_ID||'',cronSecret:e.BJ_CRON_SECRET||'',enabled:e.LINE_SEND_ENABLED==='true'}}
