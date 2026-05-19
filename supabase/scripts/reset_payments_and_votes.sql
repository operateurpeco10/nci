-- ═══════════════════════════════════════════════════════════════════════════
-- RESET PAIEMENTS + VOTES (tests / démo)
-- Exécuter dans le SQL Editor Supabase — IRRÉVERSIBLE sur les données ciblées.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Option A (défaut) : campagne ACTIVE uniquement ───────────────────────
-- Décommentez l’option B en bas pour tout effacer (toutes campagnes).

do $$
declare
  active_id uuid;
begin
  select id into active_id
  from public.campaigns
  where status = 'active'
  limit 1;

  if active_id is null then
    raise exception 'Aucune campagne active — rien à réinitialiser.';
  end if;

  -- 1) Supprimer les tentatives de paiement de cette campagne
  delete from public.payment_intents
  where campaign_id = active_id;

  -- 2) Remettre les compteurs de votes à zéro (réponses A / B)
  update public.poll_choices
  set
    response_count = 0,
    updated_at = now()
  where campaign_id = active_id;

  raise notice 'Reset OK — campagne active % : paiements supprimés, votes à 0.', active_id;
end $$;

-- Vérification
select
  c.id as campaign_id,
  c.status,
  c.question_text,
  pc.id as choice_slot,
  pc.label,
  pc.response_count
from public.campaigns c
left join public.poll_choices pc on pc.campaign_id = c.id
where c.status = 'active'
order by pc.display_order;

select count(*) as payment_intents_restants
from public.payment_intents pi
join public.campaigns c on c.id = pi.campaign_id and c.status = 'active';

commit;

-- ── Option B : TOUTES les campagnes (historique inclus) ───────────────────
-- Commentez le bloc DO ci-dessus et décommentez ci-dessous si vous voulez tout vider.

/*
begin;

truncate table public.payment_intents restart identity cascade;

update public.poll_choices
set response_count = 0, updated_at = now();

commit;
*/
