-- Do not grant organization membership when Supabase creates a pending invite.
-- Grant it only after the invited user verifies the email address.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

create or replace function public.mark_org_invitation_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    select * into v_invitation
    from public.user_invitations
    where lower(email)=lower(new.email)
      and accepted_at is null
      and revoked_at is null
      and expires_at>now()
    order by created_at desc
    limit 1
    for update;

    if found then
      insert into public.organization_members(organization_id,user_id,role_id,is_active,invited_by)
      values(v_invitation.organization_id,new.id,v_invitation.role_id,true,v_invitation.invited_by)
      on conflict(organization_id,user_id) do update
        set role_id=excluded.role_id,is_active=true,invited_by=excluded.invited_by;
      update public.user_invitations set accepted_at=now() where id=v_invitation.id;
      insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
      values(v_invitation.organization_id,v_invitation.invited_by,'EMPLOYEE_INVITATION_ACCEPTED',
        'organization_members',new.id::text,
        jsonb_build_object('email',lower(new.email),'role_id',v_invitation.role_id),
        'Employee membership activated after email verification');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.mark_org_invitation_accepted() from public, anon, authenticated;
