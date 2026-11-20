export const APPLICATION_TABLES=['journey_task_invitations','admin_login_attempts','journey_attendance','reading_progress','guest_messages','journey_activity','journey_tasks','general_rsvps','gift_activity','invitations','responses','settings','gifts','opens'];
export function credentialScope(rows,digest){
 const matches=rows.filter(r=>{let d=digest.length^r.token_hash.length;for(let i=0;i<digest.length;i++)d|=digest.charCodeAt(i)^(r.token_hash.charCodeAt(i)||0);return d===0;});
 if(matches.length!==1)return null;
 return {"sites-worker":'public',"vercel-runtime":'public',"vercel-preview":'wedding_preview'}[matches[0].name]||null;
}
export function scopedSql(sql,scope){
 if(scope==='public')return sql;if(scope!=='wedding_preview')throw Error('Invalid database scope');
 const pattern=new RegExp('\\b(FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+('+APPLICATION_TABLES.join('|')+')\\b','gi');
 return sql.replace(pattern,(_,operation,table)=>operation+' wedding_preview."'+table.toLowerCase()+'"');
}
