-- Additive, no row rewrites. Older deployments continue to use attending/declined.
ALTER TABLE public.responses DROP CONSTRAINT responses_status_check;
ALTER TABLE public.responses ADD CONSTRAINT responses_status_check CHECK (status IN ('attending','declined','pending'));
ALTER TABLE wedding_preview.responses DROP CONSTRAINT responses_status_check;
ALTER TABLE wedding_preview.responses ADD CONSTRAINT responses_status_check CHECK (status IN ('attending','declined','pending'));
-- Application rollback keeps this compatible superset. Only narrow the constraint
-- after verifying no pending rows remain; never delete or rewrite RSVP for rollback.
