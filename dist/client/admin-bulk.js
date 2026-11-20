// The downloadable examples and importer share one format; old CSV codes stay valid.
(() => {
 const headers=['nama','sapaan','slug','kursi','acara','meja','telepon','catatan'];
 const template=[headers,
  ['Rudolf','Bapak','rudolf','2','Pemberkatan Nikah + Resepsi I','Jordan-1','',''],
  ['(nama wanita)','Ibu','tamu-wanita','1','Resepsi II','','',''],
  ['Triyono & Ribka','Bapak & Ibu','triyono-ribka','2','Pemberkatan Nikah + Resepsi I','Galilea-1','',''],
  ['(nama pria) & (nama wanita)','Tuan & Nyonya','tamu-pria-wanita','2','Resepsi I','Pishon-1','',''],
  ['Johanes','Saudara','johanes','1','Pemberkatan Nikah','','',''],
  ['Ashley','Saudari','ashley','1','Resepsi II','','',''],
  ['Keluarga Wijaya','','keluarga-wijaya','4','Pemberkatan Nikah + Resepsi I + Resepsi II','Jordan-2','','']];
 const salutations={'':'',bapak:'bapak',ibu:'ibu',saudara:'saudara',saudari:'saudari',bapak_ibu:'bapak_ibu','bapak-ibu':'bapak_ibu','bapak & ibu':'bapak_ibu','bapak dan ibu':'bapak_ibu',tuan_nyonya:'tuan_nyonya','tuan-nyonya':'tuan_nyonya','tuan & nyonya':'tuan_nyonya','tuan dan nyonya':'tuan_nyonya'};
 const events={ceremony:'ceremony','holy matrimony':'ceremony','pemberkatan nikah':'ceremony',reception:'reception','resepsi i':'reception','resepsi 1':'reception',celebration:'celebration','resepsi ii':'celebration','resepsi 2':'celebration'};
 const tables={galilea:5,jordan:10,pishon:10};
 const normalize=value=>value.trim().toLowerCase().replace(/\s+/g,' ');
 function parseCsv(source){
  source=source.replace(/^\uFEFF/,'');
  const firstLine=source.split(/\r?\n/)[0];
  const delimiter=firstLine.includes(';')&&!firstLine.includes(',')?';':',';
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const finishCell=()=>{row.push(cell);cell='';closed=false;};
  const finishRow=()=>{finishCell();if(row.some(value=>value.trim()))rows.push(row);row=[];};
  for(let i=0;i<source.length;i++){
   const char=source[i];
   if(quoted){if(char==='"'&&source[i+1]==='"'){cell+='"';i++;}else if(char==='"'){quoted=false;closed=true;}else cell+=char;}
   else if(char===delimiter)finishCell();
   else if(char==='\n'||char==='\r'){if(char==='\r'&&source[i+1]==='\n')i++;finishRow();}
   else if(char==='"'){if(cell||closed)throw new Error('Format tanda kutip CSV tidak valid.');quoted=true;}
   else {if(closed)throw new Error('Format tanda kutip CSV tidak valid.');cell+=char;}
  }
  if(quoted)throw new Error('Tanda kutip CSV belum ditutup.');finishRow();return rows;
 }
 function read(source){
  const rows=parseCsv(source);if(rows.length<2||rows.length>51)throw new Error('Isi 1 sampai 50 undangan di bawah baris judul.');
  const columns=rows.shift().map(normalize),required=['nama','slug','kursi','acara'];
  if(required.some(key=>!columns.includes(key)))throw new Error('Kolom wajib: nama, slug, kursi, acara.');
  if(new Set(columns).size!==columns.length)throw new Error('Ada judul kolom CSV yang berulang.');
  if(columns.some(key=>!headers.includes(key)))throw new Error('Ada judul kolom CSV yang tidak dikenali.');
  const slugs=new Set();
  return rows.map((cells,index)=>{
   const fail=message=>{throw new Error(`Baris ${index+2}: ${message}`);};
   if(cells.length!==columns.length)fail('jumlah kolom tidak sesuai.');
   const item=Object.fromEntries(columns.map((key,i)=>[key,cells[i].trim()]));
   if(!item.nama||item.nama.length>100)fail('nama wajib diisi, maksimal 100 karakter.');
   const greeting=normalize(item.sapaan||'');const salutation=Object.hasOwn(salutations,greeting)?salutations[greeting]:undefined;
   if(salutation===undefined)fail('sapaan tidak dikenali. Gunakan pilihan pada template.');
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)||item.slug.length>60)fail('slug harus berupa huruf kecil, angka, atau tanda hubung (maksimal 60 karakter).');
   if(slugs.has(item.slug))fail('slug berulang dalam berkas: '+item.slug+'.');slugs.add(item.slug);
   const seats=Number(item.kursi);if(!Number.isInteger(seats)||seats<1||seats>20)fail('kursi harus berupa jumlah orang 1–20.');
   const eventIds=item.acara.split('+').map(value=>{const key=normalize(value);return Object.hasOwn(events,key)?events[key]:undefined;});
   if(eventIds.some(id=>!id)||new Set(eventIds).size!==eventIds.length)fail('acara tidak valid atau berulang. Pisahkan beberapa acara dengan +.');
   let receptionTable='';
   if(item.meja){
    if(!eventIds.includes('reception'))fail('meja hanya untuk undangan Resepsi I. Kosongkan kolom meja.');
    const match=item.meja.match(/^(galilea|jordan|pishon)[ -]([1-9][0-9]?)$/i);
    if(!match||Number(match[2])>tables[match[1].toLowerCase()])fail('meja harus Galilea-1 sampai Galilea-5, Jordan-1 sampai Jordan-10, atau Pishon-1 sampai Pishon-10.');
    const group=match[1].toLowerCase();receptionTable=group[0].toUpperCase()+group.slice(1)+'-'+match[2];
   }
   if((item.telepon||'').length>30||(item.catatan||'').length>500)fail('telepon maksimal 30 karakter; catatan maksimal 500 karakter.');
   return {guestName:item.nama,salutation,slug:item.slug,seats,eventIds,receptionTable,phone:item.telepon||'',privateNote:item.catatan||''};
  });
 }
 window.weddingBulkCsv={template,read};
})();
