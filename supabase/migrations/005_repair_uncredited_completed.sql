-- Réparer les paiements « completed » qui n'ont jamais crédité poll_choices (bug bypass)
-- À lancer après 004_votes_credited.sql

update public.poll_choices pc
set
  response_count = pc.response_count + sub.nb,
  updated_at = now()
from (
  select pi.campaign_id, pi.choice_id, sum(pi.nb_votes)::int as nb
  from public.payment_intents pi
  where pi.status = 'completed'
    and coalesce(pi.votes_credited, false) = false
  group by pi.campaign_id, pi.choice_id
) sub
where pc.campaign_id = sub.campaign_id
  and pc.id = sub.choice_id;

update public.payment_intents
set votes_credited = true, updated_at = now()
where status = 'completed'
  and coalesce(votes_credited, false) = false;
