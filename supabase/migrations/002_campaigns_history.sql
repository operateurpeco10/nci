-- Historique multi-campagnes (question + réponses A/B par vague)
-- Ordre important : supprimer l'ancienne FK avant de renommer choice_id.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  votes_closed boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaigns_one_active_idx
  on public.campaigns ((status))
  where status = 'active';

insert into public.campaigns (id, question_text, votes_closed, status, started_at)
select
  gen_random_uuid(),
  coalesce(cs.question_text, 'Quel joueur n''a pas été sélectionné pour le mondial ?'),
  coalesce(cs.votes_closed, false),
  'active',
  now()
from public.campaign_settings cs
where cs.id = 'default'
  and not exists (select 1 from public.campaigns where status = 'active');

insert into public.campaigns (question_text, votes_closed, status, started_at)
select
  'Quel joueur n''a pas été sélectionné pour le mondial ?',
  false,
  'active',
  now()
where not exists (select 1 from public.campaigns where status = 'active');

alter table public.poll_choices
  add column if not exists campaign_id uuid references public.campaigns (id) on delete cascade;

alter table public.poll_choices
  add column if not exists slot text;

update public.poll_choices pc
set
  campaign_id = (select id from public.campaigns where status = 'active' limit 1),
  slot = case pc.id
    when 'godo' then 'a'
    when 'diakite' then 'b'
    when 'a' then 'a'
    when 'b' then 'b'
    else coalesce(pc.slot, 'a')
  end
where pc.campaign_id is null or pc.slot is null;

alter table public.payment_intents
  add column if not exists campaign_id uuid references public.campaigns (id);

update public.payment_intents pi
set campaign_id = (select id from public.campaigns where status = 'active' limit 1)
where pi.campaign_id is null;

-- 1) Ancienne FK (choice_id → poll_choices.id seul) : à retirer AVANT tout rename
alter table public.payment_intents
  drop constraint if exists payment_intents_choice_id_fkey;

alter table public.payment_intents
  drop constraint if exists payment_intents_choice_fkey;

-- 2) Renommer les choix legacy (godo/diakite → a/b) tant que la PK est encore sur id seul
update public.poll_choices
set id = 'a'
where id = 'godo' and not exists (
  select 1 from public.poll_choices pc2 where pc2.id = 'a' and pc2.ctid <> poll_choices.ctid
);

update public.poll_choices
set id = 'b'
where id = 'diakite' and not exists (
  select 1 from public.poll_choices pc2 where pc2.id = 'b' and pc2.ctid <> poll_choices.ctid
);

-- 3) Aligner les paiements sur les nouveaux ids
update public.payment_intents pi
set choice_id = case pi.choice_id
  when 'godo' then 'a'
  when 'diakite' then 'b'
  else pi.choice_id
end
where pi.choice_id in ('godo', 'diakite');

alter table public.poll_choices
  alter column campaign_id set not null;

alter table public.poll_choices
  alter column slot set not null;

alter table public.payment_intents
  alter column campaign_id set not null;

-- 4) PK composite sur les choix
alter table public.poll_choices
  drop constraint if exists poll_choices_pkey;

alter table public.poll_choices
  add constraint poll_choices_pkey primary key (campaign_id, id);

create unique index if not exists poll_choices_campaign_slot_idx
  on public.poll_choices (campaign_id, slot);

-- 5) Nouvelle FK composite
alter table public.payment_intents
  add constraint payment_intents_choice_fkey
  foreign key (campaign_id, choice_id)
  references public.poll_choices (campaign_id, id);

create index if not exists payment_intents_campaign_id_idx
  on public.payment_intents (campaign_id);

create index if not exists poll_choices_campaign_id_idx
  on public.poll_choices (campaign_id);

alter table public.campaigns enable row level security;

drop policy if exists "campaigns_select_active_anon" on public.campaigns;

create policy "campaigns_select_active_anon"
  on public.campaigns for select
  to anon, authenticated
  using (status = 'active');

comment on table public.campaigns is 'Vagues du grand jeu — une seule active, les autres archivées';
