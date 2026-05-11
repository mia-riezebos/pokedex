-- Quick-wins review fixes:
-- 1. thanks_insert_self also blocks self-thanks (defense in depth — API also checks)
-- 2. thanks_delete_self gated by current_user_active() (banned users blocked from un-thanking too)

drop policy if exists thanks_insert_self on public.thanks;
create policy thanks_insert_self on public.thanks for insert
  with check (
    auth.uid() = user_id
    and public.current_user_active()
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id != auth.uid()
    )
  );

drop policy if exists thanks_delete_self on public.thanks;
create policy thanks_delete_self on public.thanks for delete
  using (
    auth.uid() = user_id
    and public.current_user_active()
  );
