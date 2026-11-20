import {test,expect} from '@playwright/test';
test('owner records an RSVP from the CMS and the guest moves to and from archive',async({page},info)=>{
 await page.goto('/admin');
 await page.locator('[name=code]').fill('local-wedding-test-code-123456');
 await page.locator('#admin-code-form button').click();
 await expect(page.locator('#admin-email')).toHaveText('owner@example.com');
 const slug='qa-owner-rsvp-'+(info.project.name.includes('desktop')?'desktop':'mobile');
 const response=await page.request.post('/api/admin/invitations',{headers:{Origin:'http://127.0.0.1:4175'},data:{guestName:'QA Owner RSVP',slug,seats:2,eventIds:['reception'],receptionTable:'Pishon-8'}});
 expect(response.status()).toBe(201);const invitation=(await response.json()).invitation;
 try{
  await page.reload();await page.locator('#search').fill(slug);
  await page.locator('#guest-rows [data-action=rsvp]').click();
  await expect(page.locator('#admin-rsvp-dialog')).toBeVisible();
  await page.locator('#admin-rsvp-form [name=status]').selectOption('declined');
  await page.locator('#admin-rsvp-form [name=source]').selectOption('phone');
  await page.locator('#admin-rsvp-save').click();
  await expect(page.locator('#admin-rsvp-dialog')).toBeHidden();
  await page.locator('#detail-dialog [data-close]').click();
  await page.locator('[data-page=archive]').click();
  await expect(page.locator('#archive-rows')).toContainText(slug);
  await page.locator('#archive-rows [data-action=rsvp][data-id="'+invitation.id+'"]').click();
  await page.locator('#admin-rsvp-form [name=status]').selectOption('attending');
  await page.locator('#admin-rsvp-form [name=guestCount]').fill('2');
  await page.locator('#admin-rsvp-save').click();
  await expect(page.locator('#admin-rsvp-dialog')).toBeHidden();
  await page.locator('#detail-dialog [data-close]').click();
  await page.locator('[data-page=archive]').click();
  await expect(page.locator('#archive-rows')).not.toContainText(slug);
  const audit=await (await page.request.get('/api/admin/invitations/'+invitation.id+'/rsvp-log')).json();
  expect(audit.history).toHaveLength(2);
  expect(audit.history.some(x=>x.after.source==='phone')).toBe(true);
 }finally{
  const result=await page.request.delete('/api/admin/invitations/'+invitation.id,{headers:{Origin:'http://127.0.0.1:4175'},data:{slug}});
  expect(result.status()).toBe(200);
 }
});
