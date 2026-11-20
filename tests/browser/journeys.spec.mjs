import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 page.on('console',message=>{if(message.type()==='error')failures.push({message:message.text(),url:message.location().url});});
 page.__qaErrors=failures;
});
test.afterEach(async({page})=>{expect(page.__qaErrors,'Browser console and uncaught JavaScript failures').toEqual([]);});
test('personal greeting, correct event, RSVP celebration, persistence, decline and lightbox',async({page,request},info)=>{
 const state=await (await request.get('/__qa/state')).json();await page.goto(state.link);
 await expect(page.locator('#memo-recipient')).toContainText(/Nina.*Owen/);
 await page.locator('#enter-without-music').click();await expect(page.locator('#music-gate')).toBeHidden();await page.locator('.open-invitation').click();
 await expect(page.locator('#rsvp-form textarea')).toHaveCount(0);await expect(page.locator('.rsvp-wishes-link a')).toHaveAttribute('href','#pesan');await expect(page.locator('#rsvp-events fieldset')).toHaveCount(1);await expect(page.locator('#rsvp-events')).toContainText('Resepsi I');
 await page.locator('input[name="status-reception"][value="attending"]').check();await page.locator('select[name="count-reception"]').selectOption('3');
 await page.locator('#rsvp-form button[type="submit"]').click();await expect(page.locator('#rsvp-result')).toBeVisible();await expect(page.locator('#rsvp-result-happy')).toBeVisible();
 await page.locator('#close-rsvp-result').click();await expect(page.locator('#rsvp-calendar')).toBeVisible();
 const calendar=new URL(await page.locator('#rsvp-calendar-links a').first().getAttribute('href'));
 expect(calendar.origin).toBe('https://calendar.google.com');expect(calendar.searchParams.get('action')).toBe('TEMPLATE');expect(calendar.searchParams.get('ctz')).toBe('Asia/Jakarta');expect(calendar.searchParams.get('dates')).toMatch(/^20261212T110000Z\/20261212T/);expect(calendar.searchParams.get('text')).toContain('(nama pria) & (nama wanita)');
 const downloadReady=page.waitForEvent('download');await page.locator('#save-calendar').click();const download=await downloadReady,stream=await download.createReadStream();const parts=[];for await(const part of stream)parts.push(part);const ics=Buffer.concat(parts).toString();
 for(const trigger of ['-P7D','-P1D','-PT1H'])expect(ics).toContain('TRIGGER:'+trigger);expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
 const map=new URL(await page.locator('#event-cards .map-link').first().getAttribute('href'));expect(map.protocol).toBe('https:');expect(['maps.app.goo.gl','www.google.com','maps.google.com','share.google']).toContain(map.hostname);
 await page.locator('#rsvp').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/browser-results/'+info.project.name.replaceAll(' ','-')+'.png'});
 await page.reload();await expect(page.locator('input[name="status-reception"][value="attending"]')).toBeChecked();
 await page.locator('#enter-without-music').click();await expect(page.locator('#music-gate')).toBeHidden();await page.locator('.open-invitation').click();await page.locator('input[name="status-reception"][value="declined"]').check();await page.locator('#rsvp-form button[type="submit"]').click();await expect(page.locator('#rsvp-result-sad')).toBeVisible();await page.locator('#close-rsvp-result').click();
 const after=await (await request.get('/__qa/state')).json();expect(after.responses).toBe(1);expect(after.status).toBe('declined');
 await page.locator('#gallery-grid button').first().click();await expect(page.locator('#lightbox')).toBeVisible();await page.locator('#close-lightbox').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('#guestbook-form input[name="name"]')).toHaveValue(/Nina.*Owen/);
 const wish='Semoga bahagia selalu — browser fixture';await page.locator('#guestbook-form textarea').fill(wish);await page.locator('#guestbook-form button[type="submit"]').click();await expect(page.locator('#guestbook-messages')).toContainText(wish);
 expect(JSON.stringify(await (await request.get('/api/messages?page=1')).json())).not.toContain(wish);
});
test('public invitation only offers reception II, language switch and protected HTML',async({page,request})=>{
 await page.goto('/');await page.locator('#enter-without-music').click();await expect(page.locator('#music-gate')).toBeHidden();await page.locator('.open-invitation').click();await expect(page.locator('#rsvp-form textarea')).toHaveCount(0);await expect(page.locator('.rsvp-wishes-link a')).toHaveAttribute('href','#pesan');await expect(page.locator('#rsvp-events fieldset')).toHaveCount(1);await expect(page.locator('#rsvp-events')).toContainText('Resepsi II');
 await expect(page.locator('#rsvp-general-name')).toBeVisible();expect((await request.get('/wedding-desk-shell.html')).status()).toBe(404);expect((await request.get('/api/admin/invitations')).status()).toBe(401);
 await page.locator('#language-toggle').click();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('#rsvp-events')).toContainText('Reception II');
});
test('admin signs in through the UI and loads Wedding Desk with private APIs',async({page})=>{
 await page.goto('/admin');await page.locator('[name=code]').fill('local-wedding-test-code-123456');await page.locator('#admin-code-form button').click();
 await expect(page.locator('#admin-email')).toHaveText('owner@example.com');await page.getByRole('button',{name:'♧ Keluarga & rundown',exact:true}).click();await expect(page.locator('#rundown-page')).toBeVisible();
 await page.getByRole('link',{name:'Keluar ↗',exact:true}).click();await page.goto('/admin');await expect(page.locator('#admin-code-form')).toBeVisible();
});
test('CMS schedule changes persist and update reception II invitation, RSVP and calendars',async({page,request})=>{
 const original=(await (await request.get('/api/events')).json()).events;
 await page.goto('/admin');await page.locator('[name=code]').fill('local-wedding-test-code-123456');await page.locator('#admin-code-form button').click();
 await page.locator('[data-page="events"]').click();await expect(page.locator('#events-form')).toBeVisible();
 try{
  await page.locator('[name="celebration-date"]').fill('2026-12-20');await page.locator('[name="celebration-start"]').fill('14:30');await page.locator('[name="celebration-end"]').fill('18:30');
  await page.locator('#events-form button[type="submit"]').click();await expect(page.locator('#toast')).toContainText('Detail acara diperbarui');
  await page.reload();await page.locator('[data-page="events"]').click();await expect(page.locator('[name="celebration-date"]')).toHaveValue('2026-12-20');await expect(page.locator('[name="celebration-start"]')).toHaveValue('14:30');await expect(page.locator('[name="celebration-end"]')).toHaveValue('18:30');
  const events=(await (await request.get('/api/events')).json()).events;expect(events.find(e=>e.id==='celebration').start).toBe('2026-12-20T14:30:00+07:00');
  await page.getByRole('link',{name:'Keluar ↗',exact:true}).click();await page.goto('/');await page.locator('#enter-without-music').click();await page.locator('.open-invitation').click();
  await expect(page.locator('#event-cards')).toContainText('20 Desember 2026');await expect(page.locator('#event-cards')).toContainText('14.30–18.30');await expect(page.locator('#rsvp-events')).toContainText('14.30–18.30');
  await page.locator('#rsvp-general-name input').fill('QA Schedule Guest');await page.locator('input[name="status-celebration"][value="attending"]').check();await page.locator('#rsvp-form button[type="submit"]').click();await expect(page.locator('#rsvp-result-happy')).toBeVisible();await page.locator('#close-rsvp-result').click();
  const calendar=new URL(await page.locator('#rsvp-calendar-links a').first().getAttribute('href'));expect(calendar.searchParams.get('dates')).toBe('20261220T073000Z/20261220T113000Z');
  const ready=page.waitForEvent('download');await page.locator('#save-calendar').click();const stream=await (await ready).createReadStream(),parts=[];for await(const part of stream)parts.push(part);const ics=Buffer.concat(parts).toString();expect(ics).toContain('DTSTART:20261220T073000Z');expect(ics).toContain('DTEND:20261220T113000Z');
 }finally{
  const headers={Origin:'http://127.0.0.1:4175'},login=await request.post('/api/admin/login',{headers,data:{code:'local-wedding-test-code-123456'}});expect(login.status()).toBe(200);const cookie=login.headers()['set-cookie'].split(';')[0];expect((await request.put('/api/admin/events',{headers:{...headers,Cookie:cookie},data:{events:original}})).status()).toBe(200);
 }
});

test('declined RSVP is archived and frees the table, then returns on a later attending reply',async({page,browser},info)=>{
 await page.goto('/admin');
 await page.locator('[name=code]').fill('local-wedding-test-code-123456');
 await page.locator('#admin-code-form button').click();
 await expect(page.locator('#admin-email')).toHaveText('owner@example.com');
 const tableName=info.project.name.includes('desktop')?'Pishon-9':'Pishon-10';
 const slug='qa-archive-'+(info.project.name.includes('desktop')?'desktop':'mobile');
 const created=await page.request.post('/api/admin/invitations',{headers:{Origin:'http://127.0.0.1:4175'},data:{guestName:'QA Archive RSVP',slug,seats:2,eventIds:['reception'],receptionTable:tableName}});
 expect(created.status()).toBe(201);
 const invitation=await created.json();
 const tableIndex=tableName.endsWith('-9')?9:10;
 const table=page.locator('#table-groups .table-group').nth(2).locator('.table-card').nth(tableIndex-1);
 await page.locator('[data-page="tables"]').click();
 await page.reload();await page.locator('[data-page="tables"]').click();
 await expect(table).toContainText('2/10 kursi');
 const guestContext=await browser.newContext();
 try{
  const guest=await guestContext.newPage();
  await guest.goto(invitation.sharePath);
  await guest.locator('#enter-without-music').click();
  await guest.locator('.open-invitation').click();
  await guest.locator('input[name="status-reception"][value="declined"]').check();
  await guest.locator('#rsvp-form button[type="submit"]').click();
  await expect(guest.locator('#rsvp-result-sad')).toBeVisible();
  await expect(guest.locator('#rsvp-table')).toBeHidden();
  await page.reload();await page.locator('[data-page="tables"]').click();
  await expect(table).toContainText('0/10 kursi');
  await expect(table).not.toContainText('QA Archive RSVP');
  await page.locator('[data-page="archive"]').click();
  await expect(page.locator('#archive-rows')).toContainText('QA Archive RSVP');
  await page.locator('[data-page="guests"]').click();
  await page.locator('#search').fill(slug);
  await expect(page.locator('#guest-rows')).not.toContainText('QA Archive RSVP');
  await guest.locator('#close-rsvp-result').click();
  await guest.locator('input[name="status-reception"][value="attending"]').check();
  await guest.locator('#rsvp-form button[type="submit"]').click();
  await expect(guest.locator('#rsvp-result-happy')).toBeVisible();
  await page.reload();await page.locator('[data-page="tables"]').click();
  await expect(table).toContainText('2/10 kursi');
  await expect(table).toContainText('QA Archive RSVP');
  await page.locator('[data-page="archive"]').click();
  await expect(page.locator('#archive-rows')).not.toContainText('QA Archive RSVP');
 }finally{
  await guestContext.close();
  const deleted=await page.request.delete('/api/admin/invitations/'+invitation.invitation.id,{headers:{Origin:'http://127.0.0.1:4175'},data:{slug}});
  expect(deleted.status()).toBe(200);
 }
});
