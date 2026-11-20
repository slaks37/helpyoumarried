import {storageGateway} from './handler.js';
import tokenHashes from './keys.json' with {type:'json'};
Deno.serve(storageGateway({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),tokenHashes}));
