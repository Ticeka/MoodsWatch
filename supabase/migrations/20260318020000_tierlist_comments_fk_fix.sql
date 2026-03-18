-- Fix: tierlist_comments.author_user_id must FK to user_profiles(id)
-- so PostgREST can resolve the join hint tierlist_comments_author_user_id_fkey
alter table public.tierlist_comments
  drop constraint if exists tierlist_comments_author_user_id_fkey;

alter table public.tierlist_comments
  add constraint tierlist_comments_author_user_id_fkey
  foreign key (author_user_id)
  references public.user_profiles (id)
  on delete cascade;
