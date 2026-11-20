import {test,expect} from '@playwright/test';

async function login(page){
 await page.goto('/admin');
 await page.locator('[name=code]').fill('local-wedding-test-code-123456');
 await page.locator('#admin-code-form button').click();
 await expect(page.locator('#admin-email')).toHaveText('owner@example.com');
}

async function make(page,slug,eventIds=['reception']){
 const response=await page.request.post('/api/admin/invitations',{
  headers:{Origin:'http://127.0.0.1:4175'},
  data:{guestName:'QA Bulk '+slug,slug,seats:3,eventIds,receptionTable:''}
 });
 expect(response.status()).toBe(201);
 return (await response.json()).invitation;
}

async function remove(page,invitations){
 for(const inv of invitations){
  const response=await page.request.delete('/api/admin/invitations/'+inv.id,{
   headers:{Origin:'http://127.0.0.1:4175'},data:{slug:inv.slug}
  });
  expect(response.status()).toBe(200);
 }
}

test('admin bulk-confirmation moves multiple RSVPs into and out of archive per event',async({page},info)=>{
 await login(page);
 const suffix=info.project.name.includes('desktop')?'desktop':'mobile';
 const prefix='qa-bulk-rsvp-'+suffix+'-';
 const created=[];
 try{
  created.push(await make(page,prefix+'a',['ceremony','reception']));
  created.push(await make(page,prefix+'b'));
  created.push(await make(page,prefix+'c',['ceremony']));
  await page.reload();
  await page.locator('#search').fill(prefix);
  await expect(page.locator('#guest-rows [data-bulk-rsvp-select]')).toHaveCount(3);
  await page.locator('#guest-bulk-select-visible').click();
  await expect(page.locator('#guest-bulk-rsvp-open')).toContainText('(3)');
  await page.locator('#guest-bulk-rsvp-open').click();
  await expect(page.locator('#bulk-rsvp-dialog')).toBeVisible();
  await page.locator('#bulk-rsvp-events [value=reception]').check();
  await page.locator('#bulk-rsvp-events [value=ceremony]').uncheck();
  for(const inv of created.slice(0,2)){
   await page.locator('[data-bulk-rsvp-status="'+inv.id+'"]').selectOption('declined');
  }
  await expect(page.locator('#bulk-rsvp-preview-info')).toContainText('2 undangan cocok');
  await expect(page.locator('#bulk-rsvp-preview-info')).toContainText('1 undangan lain');
  await page.locator('#bulk-rsvp-verify').check();
  await page.locator('#bulk-rsvp-save').click();
  await expect(page.locator('#bulk-rsvp-progress')).toContainText('Selesai');
  await expect(page.locator('#bulk-rsvp-result')).toContainText('2 konfirmasi berhasil diperbarui');
  await page.locator('#bulk-rsvp-dialog [data-close]').first().click();

  await page.locator('[data-page=archive]').click();
  await page.locator('#archive-search').fill(prefix);
  await expect(page.locator('#archive-rows [data-bulk-rsvp-select]')).toHaveCount(2);
  // The ceremony-only invitation remains selected because it was explicitly skipped.
  await expect(page.locator('#archive-bulk-rsvp-open')).toContainText('(1)');
  await page.locator('#archive-bulk-clear').click();
  await page.locator('#archive-bulk-select-visible').click();
  await expect(page.locator('#archive-bulk-rsvp-open')).toContainText('(2)');
  await page.locator('#archive-bulk-rsvp-open').click();
  await page.locator('#bulk-rsvp-events [value=reception]').check();
  await page.locator('#bulk-rsvp-events [value=ceremony]').uncheck();
  for(const inv of created.slice(0,2)){
   await page.locator('[data-bulk-rsvp-status="'+inv.id+'"]').selectOption('attending');
  }
  await expect(page.locator('#bulk-rsvp-review-rows [data-bulk-rsvp-count]')).toHaveCount(2);
  await page.locator('[data-bulk-rsvp-count="'+created[0].id+'"]').fill('2');
  await page.locator('[data-bulk-rsvp-count="'+created[1].id+'"]').fill('1');
  await page.locator('#bulk-rsvp-verify').check();
  await page.locator('#bulk-rsvp-save').click();
  await expect(page.locator('#bulk-rsvp-progress')).toContainText('Selesai');
  await expect(page.locator('#bulk-rsvp-result')).toContainText('2 konfirmasi berhasil diperbarui');
  await page.locator('#bulk-rsvp-dialog [data-close]').first().click();
  await expect(page.locator('#archive-rows')).not.toContainText(prefix);

  const response=await page.request.get('/api/admin/invitations');
  const data=await response.json();
  const rA=data.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='reception');
  const rB=data.responses.find(r=>r.invitation_id===created[1].id&&r.event_id==='reception');
  const rC=data.responses.find(r=>r.invitation_id===created[2].id);
  expect([rA.status,rA.guest_count,rB.status,rB.guest_count]).toEqual(['attending',2,'attending',1]);
  expect(rC).toBeUndefined();
  for(const inv of created.slice(0,2)){
   const log=await (await page.request.get('/api/admin/invitations/'+inv.id+'/rsvp-log')).json();
   expect(log.history).toHaveLength(2);
   expect(log.history[0].after.status).toBe('attending');
   expect(log.history[1].after.status).toBe('declined');
  }
  created.push(await make(page,prefix+'skip'));
  await page.reload();
  await page.locator('#search').fill(prefix);
  await page.locator('#guest-bulk-select-visible').click();
  await page.locator('#guest-bulk-rsvp-open').click();
  await page.locator('#bulk-rsvp-events [value=reception]').check();
  await page.locator('#bulk-rsvp-events [value=ceremony]').uncheck();
  await page.locator('#bulk-rsvp-events [value=ceremony]').check();
  const reception=page.locator('[data-bulk-rsvp-key="'+created[0].id+'|reception"]');
  const ceremony=page.locator('[data-bulk-rsvp-key="'+created[0].id+'|ceremony"]');
  await reception.locator('[data-bulk-rsvp-status]').selectOption('declined');
  await ceremony.locator('[data-bulk-rsvp-status]').selectOption('attending');
  await ceremony.locator('[data-bulk-rsvp-count]').fill('2');
  await page.locator('#bulk-rsvp-events [value=ceremony]').uncheck();
  await expect(ceremony).toHaveCount(0);
  await page.locator('#bulk-rsvp-events [value=ceremony]').check();
  await expect(ceremony.locator('[data-bulk-rsvp-count]')).toHaveValue('2');
  await expect(page.locator('#bulk-rsvp-save')).toBeDisabled();
  await page.locator('#bulk-rsvp-verify').check();
  await expect(page.locator('#bulk-rsvp-save')).toHaveText('Simpan 2 konfirmasi');
  await page.locator('#bulk-rsvp-save').click();
  await expect(page.locator('#bulk-rsvp-progress')).toContainText('2 diperbarui');
  const mixed=await (await page.request.get('/api/admin/invitations')).json();
  const mixedA=mixed.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='reception');
  const mixedB=mixed.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='ceremony');
  expect([mixedA.status,mixedA.guest_count,mixedB.status,mixedB.guest_count]).toEqual(['declined',0,'attending',2]);
  expect(mixed.responses.find(r=>r.invitation_id===created[3].id)).toBeUndefined();
 }finally{await remove(page,created);}
});

test('bulk confirmation preserves a failed event while other events and guests save',async({page},info)=>{
 await login(page);
 const suffix=info.project.name.includes('desktop')?'desktop':'mobile';
 const prefix='qa-bulk-conflict-'+suffix+'-';
 const created=[];
 try{
  created.push(await make(page,prefix+'a',['reception','ceremony']));
  created.push(await make(page,prefix+'b'));
  await page.reload();await page.locator('#search').fill(prefix);
  await page.locator('#guest-bulk-select-visible').click();
  await page.locator('#guest-bulk-rsvp-open').click();
  await page.locator('#bulk-rsvp-events [value=ceremony]').check();
  const reception=page.locator('[data-bulk-rsvp-key="'+created[0].id+'|reception"]');
  const ceremony=page.locator('[data-bulk-rsvp-key="'+created[0].id+'|ceremony"]');
  await reception.locator('[data-bulk-rsvp-status]').selectOption('attending');
  await reception.locator('[data-bulk-rsvp-count]').fill('1');
  await ceremony.locator('[data-bulk-rsvp-status]').selectOption('declined');
  await page.locator('[data-bulk-rsvp-status="'+created[1].id+'"]').selectOption('declined');
  await expect(page.locator('#bulk-rsvp-preview-info')).toContainText('2 undangan cocok');
  // Other operator changes one RSVP after the bulk form was opened.
  const separate=await page.request.patch('/api/admin/invitations/'+created[0].id+'/rsvp',{
   headers:{Origin:'http://127.0.0.1:4175'},
   data:{eventId:'reception',status:'attending',guestCount:2,expectedUpdatedAt:null,source:'direct',note:'Updated in another session'}
  });
  expect(separate.status()).toBe(200);
  await page.locator('#bulk-rsvp-verify').check();
  await page.locator('#bulk-rsvp-save').click();
  await expect(page.locator('#bulk-rsvp-progress')).toContainText('1 gagal');
  await expect(page.locator('#bulk-rsvp-result')).toContainText('RSVP telah diperbarui');
  await expect(page.locator('#guest-bulk-rsvp-open')).toContainText('(1)');
  const result=await (await page.request.get('/api/admin/invitations')).json();
  const a=result.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='reception');
  const b=result.responses.find(r=>r.invitation_id===created[1].id&&r.event_id==='reception');
  expect(a.status).toBe('attending');
  expect(a.guest_count).toBe(2);
  expect(result.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='ceremony').status).toBe('declined');
  await page.locator('#bulk-rsvp-dialog [data-close]').first().click();
  await page.locator('#guest-bulk-rsvp-open').click();
  await page.locator('#bulk-rsvp-events [value=reception]').check();
  await page.locator('#bulk-rsvp-events [value=ceremony]').uncheck();
  await page.locator('[data-bulk-rsvp-status="'+created[0].id+'"]').selectOption('attending');
  await page.locator('[data-bulk-rsvp-count="'+created[0].id+'"]').fill('1');
  await page.locator('#bulk-rsvp-verify').check();
  await page.locator('#bulk-rsvp-save').click();
  await expect(page.locator('#bulk-rsvp-progress')).toContainText('1 diperbarui');
  const retry=await (await page.request.get('/api/admin/invitations')).json();
  expect(retry.responses.find(r=>r.invitation_id===created[0].id&&r.event_id==='reception').guest_count).toBe(1);
  expect(b.status).toBe('declined');
 }finally{await remove(page,created);}
});
