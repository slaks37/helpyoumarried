-- Isolated synthetic data in the EXISTING project. No production guest rows copied.
CREATE SCHEMA IF NOT EXISTS wedding_preview;
REVOKE ALL ON SCHEMA wedding_preview FROM PUBLIC, anon, authenticated;
DO $migration$
DECLARE t text; c record; definition text;
BEGIN
 FOREACH t IN ARRAY ARRAY['invitations','responses','opens','gifts','settings','admin_login_attempts','guest_messages','general_rsvps','gift_activity','reading_progress','journey_attendance','journey_tasks','journey_activity','journey_task_invitations'] LOOP
  EXECUTE format('CREATE TABLE IF NOT EXISTS wedding_preview.%I (LIKE public.%I INCLUDING ALL)',t,t);
  EXECUTE format('ALTER TABLE wedding_preview.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON wedding_preview.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
 FOR c IN SELECT r.relname AS tablename,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class r ON r.oid=con.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND con.contype='f' AND r.relname IN ('invitations','responses','opens','gifts','settings','admin_login_attempts','guest_messages','general_rsvps','gift_activity','reading_progress','journey_attendance','journey_tasks','journey_activity','journey_task_invitations') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint x JOIN pg_class r ON r.oid=x.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='wedding_preview' AND r.relname=c.tablename AND x.conname=c.conname) THEN
   definition=regexp_replace(c.definition,'REFERENCES (public\.)?','REFERENCES wedding_preview.','g');
   EXECUTE format('ALTER TABLE wedding_preview.%I ADD CONSTRAINT %I %s',c.tablename,c.conname,definition);
  END IF;
 END LOOP;
END
$migration$;
INSERT INTO wedding_preview.settings SELECT * FROM public.settings ON CONFLICT(key) DO NOTHING;
-- Hashes of independent random server transport tokens, not guest access tokens.
INSERT INTO wedding_internal.api_tokens(name,token_hash) VALUES
 ('vercel-preview','74ecaab5fb32a51f4ff0c48fad46c841ce4d2421f678c400bdbb219c9cf9767e'),
 ('vercel-runtime','28a1a70555ebed50e23fa88b2ef2400d370ea2d31a7aa0bb810dba3261f0574a')
ON CONFLICT(name) DO NOTHING;
DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM wedding_internal.api_tokens WHERE name='vercel-preview' AND token_hash='74ecaab5fb32a51f4ff0c48fad46c841ce4d2421f678c400bdbb219c9cf9767e') OR NOT EXISTS(SELECT 1 FROM wedding_internal.api_tokens WHERE name='vercel-runtime' AND token_hash='28a1a70555ebed50e23fa88b2ef2400d370ea2d31a7aa0bb810dba3261f0574a') THEN RAISE EXCEPTION 'Server credential name collision'; END IF;
END
$verify$;
