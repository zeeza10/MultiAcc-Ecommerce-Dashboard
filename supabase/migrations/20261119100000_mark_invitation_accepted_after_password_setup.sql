-- Mark an employee invitation accepted only after the invited user creates a password.
-- Email confirmation happens during verifyOtp and is not proof that setup was completed.
drop trigger if exists on_auth_user_invitation_accepted on auth.users;

create or replace function public.mark_org_invitation_accepted_after_password_setup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation_id uuid;
begin
  if new.encrypted_password is not null
    and new.encrypted_password <> ''
    and old.encrypted_password is distinct from new.encrypted_password
    and new.email_confirmed_at is not null then
    select id into v_invitation_id
    from public.user_invitations
    where lower(email) = lower(new.email)
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;

    if v_invitation_id is not null then
      update public.user_invitations
      set accepted_at = now()
      where id = v_invitation_id
        and accepted_at is null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_invitation_password_set on auth.users;
create trigger on_auth_user_invitation_password_set
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute procedure public.mark_org_invitation_accepted_after_password_setup();
