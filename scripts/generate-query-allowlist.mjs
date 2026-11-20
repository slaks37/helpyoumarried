import {readFile, writeFile} from 'node:fs/promises';

const source=(await Promise.all(['worker/index.js','worker/journey.js'].map(file=>readFile(file,'utf8')))).join('\n');
const pattern=/\b(?:first|all|run|prep)\(env,\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))/g;
const statements=[...source.matchAll(pattern)].map(match=>Function(`return ${match[1]}`)());
if(statements.length<25)throw new Error('Could not discover all Worker SQL statements.');
// Retain the deployed application's queries for staged rollout and app rollback.
const compatibility=JSON.parse(await readFile('supabase/functions/wedding-db/compatibility-sql.json','utf8'));
const unique=[...new Set([...statements,...compatibility])];
const output=`// Generated from worker/index.js and worker/journey.js. Run npm run db:allowlist after changing SQL.\nexport const ALLOWED_SQL = new Set(${JSON.stringify(unique,null,2)});\n`;
await writeFile('supabase/functions/wedding-db/allowlist.ts',output);
console.log(`Wrote ${unique.length} allowed SQL statements.`);
