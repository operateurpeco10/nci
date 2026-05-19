-- Évite les doubles crédits et permet de réparer les bypass déjà « completed »
alter table public.payment_intents
  add column if not exists votes_credited boolean not null default false;

-- Intents déjà complétés avant cette colonne : considérés comme crédités si response_count > 0 sur le choix
-- (sinon un nouveau vote les recréditera via applyResponsesForIntent)
