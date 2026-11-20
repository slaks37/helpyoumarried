// Owner-only operations for the wedding desk. Counts are totals, not increments,
// so repeating a save never hands out another souvenir or checks in twice.
export async function journeyRoute(request,env,path,admin,h){
 if(!path.startsWith('/api/admin/journey'))return null;
 const {all,first,prep,db,body,json,fail,text,integer,id,stamp,getEvents,receptionTable,checkTableCapacity}=h;
 const method=request.method;
 if(path==='/api/admin/journey'&&method==='GET'){
  const [attendance,tasks,activity,general,stock,links]=await Promise.all([
   all(env,'SELECT * FROM journey_attendance'),all(env,'SELECT * FROM journey_tasks ORDER BY event_id,position,scheduled_at,id'),
   all(env,'SELECT * FROM journey_activity ORDER BY created_at DESC,id DESC LIMIT 50'),
   all(env,'SELECT owner_hash,guest_name,responses FROM general_rsvps ORDER BY guest_name'),
   first(env,"SELECT value FROM settings WHERE key='journey-stock'"),all(env,'SELECT task_id,invitation_id FROM journey_task_invitations')
  ]);
  return json({attendance,tasks:tasks.map(t=>({...t,invitationIds:links.filter(link=>link.task_id===t.id).map(link=>link.invitation_id)})),activity,general:general.map(r=>({key:'general:'+r.owner_hash,name:r.guest_name,responses:JSON.parse(r.responses)})),stock:stock?JSON.parse(stock.value):{ceremony:0,reception:0,celebration:0}});
 }
 if(path==='/api/admin/journey/stock'&&method==='PUT'){
  const input=await body(request),stock=Object.fromEntries(['ceremony','reception','celebration'].map(key=>[key,integer(input[key],0,100000)]));
  await db(env).batch([prep(env,'INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at','journey-stock',JSON.stringify(stock),stamp())]);return json({saved:true});
 }
 if(path==='/api/admin/journey/attendance'&&method==='PUT'){
  const input=await body(request),key=text(input.key,150,true),event=text(input.eventId,30,true);
  let inv=null,general=null,capacity;
  if(key.startsWith('invitation:')){inv=await first(env,'SELECT * FROM invitations WHERE id=?',key.slice(11));if(!inv||!inv.active)fail(404,'Undangan aktif tidak ditemukan.');if(!JSON.parse(inv.event_ids).includes(event))fail(400,'Tamu tidak diundang pada acara ini.');capacity=inv.seats;}
  else if(key.startsWith('general:')){general=await first(env,'SELECT * FROM general_rsvps WHERE owner_hash=?',key.slice(8));if(!general||event!=='celebration')fail(400,'Tamu umum hanya dapat check-in pada Resepsi II.');const answer=JSON.parse(general.responses).find(r=>r.event_id===event);capacity=Math.max(1,answer?.guest_count||1);}
  else fail(400,'Tamu tidak valid.');
  const count=integer(input.checkedIn,0,capacity),seated=integer(input.seated,0,count),souvenirs=integer(input.souvenirs,0,count),note=text(input.note,500),revision=integer(input.revision,0,1000000);
  if(seated&&inv&&event==='reception'&&!inv.reception_table)fail(400,'Tentukan meja Resepsi I sebelum menandai tamu sudah duduk.');
  const old=await first(env,'SELECT * FROM journey_attendance WHERE subject_key=? AND event_id=?',key,event);
  if((old?.revision||0)!==revision)fail(409,'Data telah diubah petugas lain. Perbarui halaman sebelum menyimpan.');
  const now=stamp(),next=revision+1,values={checkedIn:count,seated,souvenirs,note},before=old?{checkedIn:old.checked_in,seated:old.seated,souvenirs:old.souvenirs,note:old.note}:null;
  const statement=old?prep(env,'UPDATE journey_attendance SET checked_in=?,seated=?,souvenirs=?,note=?,revision=?,updated_at=?,updated_by=? WHERE subject_key=? AND event_id=? AND revision=?',count,seated,souvenirs,note,next,now,admin.email,key,event,revision):prep(env,'INSERT INTO journey_attendance (subject_key,event_id,invitation_id,general_owner,checked_in,seated,souvenirs,note,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_key,event_id) DO NOTHING',key,event,inv?.id||null,general?.owner_hash||null,count,seated,souvenirs,note,next,now,admin.email);
  await db(env).batch([statement,prep(env,'INSERT INTO journey_activity (id,subject_key,event_id,action,before_value,after_value,created_at,actor) SELECT ?,?,?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM journey_attendance WHERE subject_key=? AND event_id=? AND revision=? AND updated_at=? AND updated_by=?)',id(),key,event,'attendance',JSON.stringify(before),JSON.stringify(values),now,admin.email,key,event,next,now,admin.email)]);
  const saved=await first(env,'SELECT * FROM journey_attendance WHERE subject_key=? AND event_id=?',key,event);if(saved.updated_at!==now||saved.revision!==next)fail(409,'Data telah berubah. Perbarui halaman sebelum menyimpan.');return json({saved:true});
 }
 if(path==='/api/admin/journey/seating'&&method==='PUT'){
  const input=await body(request),inv=await first(env,'SELECT * FROM invitations WHERE id=?',text(input.invitationId,64,true));if(!inv||!inv.active||!JSON.parse(inv.event_ids).includes('reception'))fail(400,'Pilih undangan aktif Resepsi I.');
  const table=receptionTable(input.table,['reception']);const declined=await first(env,"SELECT status FROM responses WHERE invitation_id=? AND event_id='reception'",inv.id);if(table&&declined?.status==='declined')fail(409,'RSVP tidak hadir diarsipkan. Minta tamu mengubah konfirmasi menjadi hadir sebelum mendapat meja.');if(!table){const arrived=await first(env,'SELECT * FROM journey_attendance WHERE subject_key=? AND event_id=?','invitation:'+inv.id,'reception');if(arrived?.seated)fail(409,'Koreksi jumlah tamu yang sudah duduk sebelum mengosongkan meja.');}await checkTableCapacity(env,table,inv.seats,inv.id);
  const now=stamp();await db(env).batch([prep(env,"UPDATE invitations SET reception_table=?,updated_at=? WHERE id=? AND reception_table=? AND (?='' OR seats+(SELECT COALESCE(SUM(other.seats),0) FROM invitations other WHERE other.id<>? AND other.active=1 AND other.reception_table=? AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.invitation_id=other.id AND r.event_id='reception' AND r.status='declined'))<=?)",table,now,inv.id,inv.reception_table,table,inv.id,table,10),prep(env,'INSERT INTO journey_activity (id,subject_key,event_id,action,before_value,after_value,created_at,actor) SELECT ?,?,?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM invitations WHERE id=? AND reception_table=? AND updated_at=?)',id(),'invitation:'+inv.id,'reception','seating',JSON.stringify(inv.reception_table),JSON.stringify(table),now,admin.email,inv.id,table,now)]);const saved=await first(env,'SELECT * FROM invitations WHERE id=?',inv.id);if(saved.reception_table!==table||saved.updated_at!==now)fail(409,'Meja sudah penuh atau diubah petugas lain. Perbarui halaman.');return json({saved:true});
 }
 const taskMatch=path.match(/^\/api\/admin\/journey\/tasks(?:\/([a-zA-Z0-9-]+))?$/);
 if(taskMatch&&((method==='POST'&&!taskMatch[1])||(method==='PUT'&&taskMatch[1]))){
  const input=await body(request),event=text(input.eventId,30,true);if(!(await getEvents(env)).some(e=>e.id===event))fail(400,'Acara tidak valid.');
  if(!['coordination','tea','photo'].includes(input.kind)||!['planned','ready','active','done','cancelled'].includes(input.status))fail(400,'Tahap atau status tidak valid.');
  const rawIds=input.invitationIds===undefined?(input.invitationId?[input.invitationId]:[]):input.invitationIds;
  if(!Array.isArray(rawIds)||rawIds.length>500||rawIds.some(value=>typeof value!=='string'||! /^[a-zA-Z0-9-]{1,64}$/.test(value)))fail(400,'Daftar undangan tidak valid. Pilih maksimum 500 undangan.');
  const invIds=[...new Set(rawIds)],invId=invIds[0]||null;
  if(invIds.length){const available=await all(env,'SELECT id,active,event_ids FROM invitations');if(invIds.some(key=>!available.some(inv=>inv.id===key&&inv.active&&JSON.parse(inv.event_ids).includes(event))))fail(400,'Semua undangan yang ditautkan harus aktif dan sesuai acara ini.');} 
  const scheduled=text(input.scheduledAt,32);if(scheduled&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(scheduled)||Number.isNaN(Date.parse(scheduled))||new Date(Date.parse(scheduled.slice(0,10)+'T00:00:00Z')).toISOString().slice(0,10)!==scheduled.slice(0,10)))fail(400,'Jadwal harus berupa tanggal dan waktu WIB.');
  const values=[event,input.kind,text(input.familyName,100,true),text(input.members,1000),invId,text(input.assignee,100),text(input.contact,50),scheduled,integer(input.position,1,999),input.status,text(input.location,200),text(input.note,1000)];
  const taskId=taskMatch[1]||id(),old=taskMatch[1]?await first(env,'SELECT * FROM journey_tasks WHERE id=?',taskId):null;
  if(taskMatch[1]&&!old)fail(404,'Agenda tidak ditemukan.');const revision=integer(input.revision,0,1000000);if((old?.revision||0)!==revision)fail(409,'Agenda telah diubah petugas lain. Perbarui halaman.');
  const now=stamp(),next=revision+1,writeToken=id();
  const statement=old?prep(env,'UPDATE journey_tasks SET event_id=?,kind=?,family_name=?,members=?,invitation_id=?,assignee=?,contact=?,scheduled_at=?,position=?,status=?,location=?,note=?,revision=?,write_token=?,updated_at=?,updated_by=? WHERE id=? AND revision=?',...values,next,writeToken,now,admin.email,taskId,revision):prep(env,'INSERT INTO journey_tasks (event_id,kind,family_name,members,invitation_id,assignee,contact,scheduled_at,position,status,location,note,revision,write_token,updated_at,updated_by,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...values,next,writeToken,now,admin.email,taskId);
  await db(env).batch([statement,prep(env,'DELETE FROM journey_task_invitations WHERE task_id=? AND EXISTS (SELECT 1 FROM journey_tasks WHERE id=? AND revision=? AND write_token=? AND updated_by=?)',taskId,taskId,next,writeToken,admin.email),prep(env,"INSERT INTO journey_task_invitations (task_id,invitation_id) SELECT ?,i.id FROM invitations i WHERE ? LIKE '%|' || i.id || '|%' AND EXISTS (SELECT 1 FROM journey_tasks WHERE id=? AND revision=? AND write_token=? AND updated_by=?) ON CONFLICT(task_id,invitation_id) DO NOTHING",taskId,'|'+invIds.join('|')+'|',taskId,next,writeToken,admin.email),prep(env,'INSERT INTO journey_activity (id,subject_key,event_id,action,before_value,after_value,created_at,actor) SELECT ?,?,?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM journey_tasks WHERE id=? AND revision=? AND write_token=? AND updated_by=?)',id(),'task:'+taskId,event,'agenda',JSON.stringify(old?{status:old.status,familyName:old.family_name}:null),JSON.stringify({status:input.status,familyName:values[2],invitationIds:invIds}),now,admin.email,taskId,next,writeToken,admin.email)]);
  const saved=await first(env,'SELECT * FROM journey_tasks WHERE id=?',taskId);if(saved.write_token!==writeToken||saved.revision!==next)fail(409,'Agenda telah berubah. Perbarui halaman.');return json({saved:true,id:taskId},old?200:201);
 }
 fail(405,'Metode guest journey tidak didukung.');
}
