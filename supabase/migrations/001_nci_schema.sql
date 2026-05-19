-- NCI Grand jeu — schéma initial (SQL Editor Supabase ou CLI)
create extension if not exists "pgcrypto";

-- Choix du sondage (Godo / Diakité)
create table if not exists public.poll_choices (
  id text primary key,
  label text not null,
  response_count integer not null default 0 check (response_count >= 0),
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.poll_choices (id, label, display_order)
values
  ('godo', 'Martial Godo', 0),
  ('diakite', 'Oumar Diakité', 1)
on conflict (id) do nothing;

-- Paramètres campagne (question, fermeture)
create table if not exists public.campaign_settings (
  id text primary key default 'default',
  question_text text not null default 'Quel joueur n''a pas été sélectionné pour le mondial ?',
  votes_closed boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.campaign_settings (id, question_text)
values ('default', 'Quel joueur n''a pas été sélectionné pour le mondial ?')
on conflict (id) do nothing;

-- Paiements Mobile Money / DVPass
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  choice_id text not null references public.poll_choices (id),
  nb_votes integer not null check (nb_votes > 0),
  wallet_id text not null,
  msisdn text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  amount_fcfa integer,
  provider_operation_id text,
  hub2_intent_id text,
  hub2_payment_id text,
  failure_code text,
  failure_detail text,
  raw_request jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_choice_id_idx
  on public.payment_intents (choice_id);

create index if not exists payment_intents_created_at_idx
  on public.payment_intents (created_at desc);

create index if not exists payment_intents_hub2_intent_id_idx
  on public.payment_intents (hub2_intent_id)
  where hub2_intent_id is not null;

create index if not exists payment_intents_hub2_payment_id_idx
  on public.payment_intents (hub2_payment_id)
  where hub2_payment_id is not null;

alter table public.poll_choices enable row level security;
alter table public.campaign_settings enable row level security;
alter table public.payment_intents enable row level security;

-- Lecture publique des totaux sondage
create policy "poll_choices_select_anon"
  on public.poll_choices for select
  to anon, authenticated
  using (true);

create policy "campaign_settings_select_anon"
  on public.campaign_settings for select
  to anon, authenticated
  using (true);

comment on table public.payment_intents is 'Tentatives de paiement DVPass — écriture via service role uniquement';
