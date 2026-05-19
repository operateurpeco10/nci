-- Réparation complète (état partiel après échec de 002)
-- Exécuter ce script ENTIER dans le SQL Editor Supabase.

-- ── 1. Table campaigns ─────────────────────────────────────────────
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

insert into public.campaigns (question_text, votes_closed, status, started_at)
select
  coalesce(
    (select question_text from public.campaign_settings where id = 'default' limit 1),
    'Quel joueur n''a pas été sélectionné pour le mondial ?'
  ),
  coalesce(
    (select votes_closed from public.campaign_settings where id = 'default' limit 1),
    false
  ),
  'active',
  now()
where not exists (select 1 from public.campaigns where status = 'active');

-- ── 2. Colonnes manquantes (AVANT tout UPDATE) ─────────────────────
alter table public.poll_choices
  add column if not exists campaign_id uuid references public.campaigns (id) on delete cascade;

alter table public.poll_choices
  add column if not exists slot text;

alter table public.payment_intents
  add column if not exists campaign_id uuid references public.campaigns (id);

-- ── 3. Supprimer les anciennes FK ──────────────────────────────────
alter table public.payment_intents
  drop constraint if exists payment_intents_choice_id_fkey;

alter table public.payment_intents
  drop constraint if exists payment_intents_choice_fkey;

-- ── 4. Rattacher choix à la campagne active ───────────────────────
update public.poll_choices
set
  campaign_id = (select id from public.campaigns where status = 'active' limit 1),
  slot = case id
    when 'godo' then 'a'
    when 'diakite' then 'b'
    when 'a' then 'a'
    when 'b' then 'b'
    else coalesce(slot, 'a')
  end
where campaign_id is null
   or slot is null;

-- ── 5. Renommer godo/diakite → a/b (PK encore sur id seul) ─────────
update public.poll_choices
set id = 'a'
where id = 'godo';

update public.poll_choices
set id = 'b'
where id = 'diakite';

-- ── 6. Paiements : campagne + choice_id alignés ────────────────────
update public.payment_intents
set campaign_id = (select id from public.campaigns where status = 'active' limit 1)
where campaign_id is null;

update public.payment_intents
set choice_id = case choice_id
  when 'godo' then 'a'
  when 'diakite' then 'b'
  else choice_id
end
where choice_id in ('godo', 'diakite');

-- ── 7. Contraintes NOT NULL ────────────────────────────────────────
alter table public.poll_choices
  alter column campaign_id set not null;

alter table public.poll_choices
  alter column slot set not null;

alter table public.payment_intents
  alter column campaign_id set not null;

-- ── 8. PK composite poll_choices ───────────────────────────────────
alter table public.poll_choices
  drop constraint if exists poll_choices_pkey;

alter table public.poll_choices
  add constraint poll_choices_pkey primary key (campaign_id, id);

create unique index if not exists poll_choices_campaign_slot_idx
  on public.poll_choices (campaign_id, slot);

-- ── 9. FK composite payment_intents ────────────────────────────────
alter table public.payment_intents
  drop constraint if exists payment_intents_choice_fkey;

alter table public.payment_intents
  add constraint payment_intents_choice_fkey
  foreign key (campaign_id, choice_id)
  references public.poll_choices (campaign_id, id);

create index if not exists payment_intents_campaign_id_idx
  on public.payment_intents (campaign_id);

create index if not exists poll_choices_campaign_id_idx
  on public.poll_choices (campaign_id);

-- ── 10. RLS campagnes actives (lecture publique) ───────────────────
alter table public.campaigns enable row level security;

drop policy if exists "campaigns_select_active_anon" on public.campaigns;

create policy "campaigns_select_active_anon"
  on public.campaigns for select
  to anon, authenticated
  using (status = 'active');
