import {scopedSql} from './scopes.js';

export class WriteConflict extends Error {}

// All gateway writers, including older clients, use the same schema-scoped lock.
// Capacity is checked AFTER the writes, inside this transaction, never from a
// separate HTTP read. Throwing rolls back RSVP, seating, and audit together.
export async function executeBatch(transaction, operations, scope, execute) {
 const writes=operations.some(op=>op.mode==='run');
 if(writes)await transaction`select pg_advisory_xact_lock(hashtext(${scope}), 6241105)`;
 const attendanceGuard=writes&&operations.some(op=>/^(INSERT INTO|UPDATE) (responses|journey_attendance)\b/.test(op.sql));
 const changesRsvp=operations.some(op=>/^(INSERT INTO|UPDATE) responses\b/.test(op.sql));
 const arrivalSql=scopedSql("SELECT r.id,r.updated_at,a.revision FROM responses r JOIN journey_attendance a ON a.invitation_id=r.invitation_id AND a.event_id=r.event_id WHERE "+(changesRsvp?"r.status IN ('declined','pending')":"r.status='declined'")+" AND (a.checked_in>0 OR a.seated>0)",scope);
 const existingArrivals=attendanceGuard?new Set((await transaction.unsafe(arrivalSql,[],{prepare:false})).map(row=>JSON.stringify(row))):new Set();
 const output=[];
 for(const operation of operations){
  const result=await execute(transaction,operation,scope);
  if(operation.mode==='run'&&/^(UPDATE responses SET|INSERT INTO responses )/.test(operation.sql)&&result.count!==1)
   throw new WriteConflict('RSVP changed before save');
  output.push(result);
 }
 if(writes&&operations.some(op=>/^(INSERT INTO|UPDATE|DELETE FROM) (invitations|responses)\b/.test(op.sql))){
  const overbooked=await transaction.unsafe(scopedSql("SELECT i.reception_table FROM invitations i WHERE i.active=1 AND i.reception_table<>'' AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.invitation_id=i.id AND r.event_id='reception' AND r.status='declined') GROUP BY i.reception_table HAVING SUM(i.seats)>10",scope),[],{prepare:false});
  if(overbooked.length)throw new WriteConflict('Reception table capacity changed');
 }
 if(attendanceGuard){
  const conflict=await transaction.unsafe(arrivalSql,[],{prepare:false});
  if(conflict.some(row=>!existingArrivals.has(JSON.stringify(row))))throw new WriteConflict('Guest already checked in');
 }
 return output;
}
