import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
export async function createLocalDB(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS __local_migrations(name TEXT PRIMARY KEY)');
 for(const name of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name)){sqlite.exec(await readFile('drizzle/'+name,'utf8'));sqlite.prepare('INSERT INTO __local_migrations VALUES (?)').run(name);}
 const execute=(sql,args,mode)=>{const statement=sqlite.prepare(sql);if(mode==='all')return {success:true,results:statement.all(...args)};if(mode==='first')return statement.get(...args)||null;const result=statement.run(...args);return {success:true,meta:{changes:Number(result.changes)}};};
 const prepare=(sql,args=[])=>({bind(...bound){return prepare(sql,bound);},first(){return Promise.resolve(execute(sql,args,'first'));},all(){return Promise.resolve(execute(sql,args,'all'));},run(){return Promise.resolve(execute(sql,args,'run'));},_run(){return execute(sql,args,'run');}});
 return {prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s._run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();},sqlite};
}
