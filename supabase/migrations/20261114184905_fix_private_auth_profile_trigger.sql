-- The auth.users trigger targets the private helper, not the public compatibility wrapper.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.profiles(id,full_name,email)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),lower(new.email))
  on conflict(id) do update set
    email=excluded.email,
    full_name=case when public.profiles.full_name='' then excluded.full_name else public.profiles.full_name end;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
