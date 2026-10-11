export async function customerClaimToken(secret:string,messageId:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('bjcarcare-slip-claim:'+messageId)));
 let binary='';for(const byte of signature)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function customerClaimHash(token:string):Promise<string>{
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
 return Array.from(bytes).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
