CREATE TABLE IF NOT EXISTS public.journey_task_invitations (
 task_id text NOT NULL REFERENCES public.journey_tasks(id) ON DELETE CASCADE,
 invitation_id text NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
 PRIMARY KEY(task_id,invitation_id)
);
CREATE INDEX IF NOT EXISTS journey_task_invitations_invitation_idx ON public.journey_task_invitations(invitation_id);
ALTER TABLE public.journey_task_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_task_invitations FROM anon,authenticated;
INSERT INTO public.journey_task_invitations (task_id,invitation_id) SELECT id,invitation_id FROM public.journey_tasks WHERE invitation_id IS NOT NULL ON CONFLICT(task_id,invitation_id) DO NOTHING;

ALTER TABLE public.journey_tasks ADD COLUMN IF NOT EXISTS write_token text NOT NULL DEFAULT '';
