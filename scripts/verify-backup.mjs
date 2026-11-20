import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createLocalDB} from './local-db.mjs';

// This verifier never connects to production. It restores application rows into an in-memory DB.
export async function verifyBackup(backup){
 const DB=await createLocalDB();let tables=0,records=0;
 try{
  DB.sqlite.exec('BEGIN; PRAGMA defer_foreign_keys=ON;');
  for(const entry of backup.baseline){
   const rows=backup.rows[entry.name];if(!rows||rows.length!==entry.count)throw new Error('Backup row count mismatch: '+entry.name);
   if(createHash('md5').update(rows.join('')).digest('hex')!==entry.digest)throw new Error('Backup checksum mismatch: '+entry.name);
   if(!entry.name.startsWith('public.'))continue;
   const table=entry.name.slice(7),meta=backup.schema.find(s=>s.schema==='public'&&s.name===table);
   if(!meta||!/^\w+$/.test(table)||meta.columns.some(c=>!/^\w+$/.test(c)))throw new Error('Invalid backup table');
   const sql=`INSERT INTO "${table}" (${meta.columns.map(c=>'"'+c+'"').join(',')}) VALUES (${meta.columns.map(()=>'?').join(',')})`;
   const insert=DB.sqlite.prepare(sql);
   for(const json of rows){const row=JSON.parse(json);insert.run(...meta.columns.map(c=>row[c]));}
   if(DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n!==entry.count)throw new Error('Restore count mismatch');
   tables++;records+=rows.length;
  }
  DB.sqlite.exec('COMMIT');return {tables,records,checksumsVerified:true,isolatedRestoreVerified:true};
 }finally{DB.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const backup=JSON.parse(await readFile(process.argv[2],'utf8'));console.log(JSON.stringify(await verifyBackup(backup)));}
