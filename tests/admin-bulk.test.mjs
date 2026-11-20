import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const context={window:{}};
runInNewContext(await readFile('public/admin-bulk.js','utf8'),context);
const {template,read}=context.window.weddingBulkCsv;
const csv=(rows,separator=',')=>'\uFEFF'+rows.map(row=>row.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(separator)).join('\r\n');
const plain=result=>JSON.parse(JSON.stringify(result));
test('every downloadable example imports into the existing invitation fields',()=>{
 const parsed=plain(read(csv(template)));
 assert.equal(parsed.length,7);
 assert.equal(parsed.reduce((sum,row)=>sum+row.seats,0),13);
 assert.deepEqual(parsed[2],{guestName:'Triyono & Ribka',salutation:'bapak_ibu',slug:'triyono-ribka',seats:2,eventIds:['ceremony','reception'],receptionTable:'Galilea-1',phone:'',privateNote:''});
 assert.equal(parsed[3].salutation,'tuan_nyonya');
 assert.deepEqual(parsed[6].eventIds,['ceremony','reception','celebration']);
 assert.deepEqual(plain(read(csv(template,';'))),parsed);
});
test('previous CSV headers, codes and quoted content stay compatible',()=>{
 const rows=[['nama','slug','kursi','acara','sapaan','meja','telepon','catatan'],['Triyono & Ribka','triyono-ribka',4,'ceremony+reception','bapak_ibu','Jordan-10','0812345','Catatan, "keluarga"\nbaris kedua']];
 const result=plain(read(csv(rows)))[0];assert.equal(result.phone,'0812345');assert.equal(result.privateNote,rows[1][7]);assert.equal(result.salutation,'bapak_ibu');
});
test('rejects duplicate links and invalid table/event combinations before upload',()=>{
 const columns=['nama','slug','kursi','acara','sapaan','meja'];
 const row=['Nama','nama',2,'Resepsi I','Bapak & Ibu','Galilea-5'];
 assert.throws(()=>read(csv([columns,row,row])),/Baris 3: slug berulang/);
 assert.throws(()=>read(csv([columns,[...row.slice(0,5),'Galilea-6']])),/meja harus/);
 assert.throws(()=>read(csv([columns,['Nama','nama',2,'Resepsi II','','Galilea-1']])),/meja hanya/);
 assert.throws(()=>read(csv([columns,['Nama','nama',2,'reception+Resepsi I','','']])),/acara tidak valid atau berulang/);
 assert.throws(()=>read(csv([columns,['Nama','nama',2,'constructor','','']])),/acara tidak valid/);
 assert.throws(()=>read(csv([columns,['Nama','nama',0,'reception','','']])),/jumlah orang 1–20/);
});
