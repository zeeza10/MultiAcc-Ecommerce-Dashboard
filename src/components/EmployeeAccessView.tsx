import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, KeyRound, Mail, Plus, RefreshCw, Shield, ShieldCheck, UserMinus, Users, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AdminMfaSetup } from './AdminMfaSetup';

type Role = {
  id: string; organization_id: string | null; code: string; name: string;
  description: string; is_system: boolean; is_custom: boolean; permissions: string[];
};
type Permission = { id: string; code: string; description: string };
type Member = {
  user_id: string; email: string | null; full_name: string; is_active: boolean;
  joined_at: string; role_id: string; role_code: string; role_name: string;
  permission_overrides?: { code: string; effect: 'GRANT' | 'DENY' }[];
};
type Invitation = {
  id: string; email: string; role_id: string; expires_at: string;
  accepted_at: string | null; revoked_at: string | null; created_at: string;
};
type HistoryItem = {
  id: string; actor_id: string | null; action: string; entity: string; entity_id: string;
  before_snapshot: unknown; after_snapshot: unknown; notes: string | null; created_at: string;
};
type AccessData = { members: Member[]; roles: Role[]; permissions: Permission[]; invitations: Invitation[]; history: HistoryItem[] };
type Tab = 'employees' | 'roles' | 'history';

const emptyAccess: AccessData = { members: [], roles: [], permissions: [], invitations: [], history: [] };
const labelFor = (code: string) => code.split('.').map(part => part.replace(/_/g, ' ')).join(' / ').replace(/\b\w/g, c => c.toUpperCase());

export const EmployeeAccessView: React.FC = () => {
  const { organizationId, user } = useAuth();
  const [access, setAccess] = useState<AccessData>(emptyAccess);
  const [tab, setTab] = useState<Tab>('employees');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');

  const [roleId, setRoleId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedMemberPermissions, setSelectedMemberPermissions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase.rpc('get_org_employee_access', {
        p_organization_id: organizationId,
      });
      if (loadError) throw loadError;
      const next = (data || emptyAccess) as AccessData;
      setAccess(next);
      if (!inviteRole && next.roles.length) {
        const preferred = next.roles.find(role => role.code === 'OPS_MANAGER') || next.roles[0];
        setInviteRole(preferred.id);
      }
      if (!templateId && next.roles.length) {
        const preferred = next.roles.find(role => role.code === 'OPS_MANAGER') || next.roles.find(role => role.is_system) || next.roles[0];
        setTemplateId(preferred.id);
        setRolePermissions(preferred.permissions || []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Employee access data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, inviteRole, templateId]);

  useEffect(() => { void load(); }, [load]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of access.permissions) {
      const category = permission.code.split('.')[0] || 'general';
      groups.set(category, [...(groups.get(category) || []), permission]);
    }
    return [...groups.entries()];
  }, [access.permissions]);

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = access.roles.find(role => role.id === id);
    setRolePermissions(template?.permissions || []);
  };

  const togglePermission = (code: string) => {
    setRolePermissions(current => current.includes(code)
      ? current.filter(item => item !== code)
      : [...current, code]);
  };

  const selectedMember = access.members.find(member => member.user_id === selectedMemberId) || null;
  const selectedMemberRole = selectedMember ? access.roles.find(role => role.id === selectedMember.role_id) : null;
  const openMemberPermissions = (member: Member) => {
    const defaults = selectedMemberRole?.id === member.role_id
      ? (selectedMemberRole.permissions || [])
      : (access.roles.find(role => role.id === member.role_id)?.permissions || []);
    const overrides = member.permission_overrides || [];
    const effective = new Set(defaults);
    overrides.forEach(item => item.effect === 'GRANT' ? effective.add(item.code) : effective.delete(item.code));
    setSelectedMemberId(member.user_id);
    setSelectedMemberPermissions([...effective]);
  };

  const saveMemberPermissions = async () => {
    if (!selectedMember) return;
    const defaults = access.roles.find(role => role.id === selectedMember.role_id)?.permissions || [];
    const selected = new Set(selectedMemberPermissions);
    const baseline = new Set(defaults);
    const grantCodes = [...selected].filter(code => !baseline.has(code));
    const denyCodes = [...baseline].filter(code => !selected.has(code));
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: saveError } = await supabase.rpc('set_org_member_permission_overrides', {
        p_organization_id: organizationId,
        p_user_id: selectedMember.user_id,
        p_grant_codes: grantCodes,
        p_deny_codes: denyCodes,
      });
      if (saveError) throw saveError;
      setNotice('Individual permissions saved. These changes affect only this employee and override their role defaults.');
      setSelectedMemberId('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Individual permissions could not be saved.');
    } finally { setSaving(false); }
  };

  const toggleMemberPermission = (code: string) => {
    setSelectedMemberPermissions(current => current.includes(code)
      ? current.filter(item => item !== code)
      : [...current, code]);
  };

  const createOrUpdateRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: saveError } = await supabase.rpc('manage_org_role', {
        p_organization_id: organizationId,
        p_role_id: roleId || null,
        p_name: roleName.trim(),
        p_description: roleDescription.trim(),
        p_permission_codes: rolePermissions,
      });
      if (saveError) throw saveError;
      setNotice(roleId ? 'Role permissions updated.' : 'Custom role created.');
      setRoleId(''); setRoleName(''); setRoleDescription('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Role could not be saved.');
    } finally { setSaving(false); }
  };

  const editRole = (role: Role) => {
    if (!role.is_custom) return;
    setRoleId(role.id); setRoleName(role.name); setRoleDescription(role.description || '');
    setRolePermissions(role.permissions || []);
    setTab('roles');
  };

  const copyRoleTemplate = (role: Role) => {
    setRoleId(''); setRoleName(`${role.name} Custom`); setRoleDescription(role.description || '');
    setTemplateId(role.id); setRolePermissions(role.permissions || []);
    setTab('roles');
  };

  const inviteEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.inviteEmployee({ email: inviteEmail.trim(), fullName: inviteName.trim(), roleId: inviteRole });
      setNotice(result.message || 'Invitation sent.');
      setInviteName(''); setInviteEmail('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invitation could not be sent.');
    } finally { setSaving(false); }
  };

  const changeRole = async (member: Member, nextRoleId: string) => {
    if (!nextRoleId || nextRoleId === member.role_id) return;
    const selectedRole = access.roles.find(role => role.id === nextRoleId);
    if (selectedRole?.code === 'SUPER_ADMIN') {
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || assurance?.currentLevel !== 'aal2') {
        setError('Set up and complete multi-factor authentication before granting Super Admin access.');
        return;
      }
    }
    if (!window.confirm(`Change ${member.full_name || member.email || 'this employee'}'s role?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: changeError } = await supabase.rpc('assign_org_member_role', {
        p_organization_id: organizationId, p_user_id: member.user_id, p_role_id: nextRoleId,
      });
      if (changeError) throw changeError;
      setNotice('Employee role updated and recorded in access history.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Role could not be changed.'); }
    finally { setSaving(false); }
  };

  const setMemberActive = async (member: Member, active: boolean) => {
    const action = active ? 'reactivate' : 'suspend and immediately block workspace API access for';
    if (!window.confirm(`Are you sure you want to ${action} ${member.full_name || member.email || 'this employee'}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: updateError } = await supabase.rpc('set_org_member_active', {
        p_organization_id: organizationId, p_user_id: member.user_id, p_is_active: active,
      });
      if (updateError) throw updateError;
      setNotice(active ? 'Employee access restored.' : 'Employee suspended. Workspace API access is now denied, including existing signed-in sessions.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Employee access could not be updated.'); }
    finally { setSaving(false); }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    if (!window.confirm(`Revoke the pending invitation for ${invitation.email}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: revokeError } = await supabase.from('user_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', invitation.id).eq('organization_id', organizationId);
      if (revokeError) throw revokeError;
      setNotice('Invitation revoked.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be revoked.'); }
    finally { setSaving(false); }
  };

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Only your organization Super Admin can manage employee roles and permissions.</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><h1 className="text-xl font-bold text-slate-900">Employee Access & Permissions</h1></div>
          <p className="mt-1 text-sm text-slate-500">Manage employees, predefined role templates, custom permissions and organization access history.</p>
        </div>
        <button onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      <AdminMfaSetup />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Users className="h-4 w-4" /> Employees</div><div className="mt-2 text-2xl font-bold text-slate-900">{access.members.length}</div><div className="text-xs text-slate-500">{access.members.filter(member => member.is_active).length} active</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Shield className="h-4 w-4" /> Available roles</div><div className="mt-2 text-2xl font-bold text-slate-900">{access.roles.length}</div><div className="text-xs text-slate-500">{access.roles.filter(role => role.is_custom).length} custom roles</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Mail className="h-4 w-4" /> Pending invitations</div><div className="mt-2 text-2xl font-bold text-slate-900">{access.invitations.length}</div><div className="text-xs text-slate-500">Invitation links expire after 7 days</div></div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {([['employees','Employees'],['roles','Roles & Permissions'],['history','Access History']] as [Tab,string][]).map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab===id?'border-indigo-600 text-indigo-700':'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading secure employee access data…</div> : null}

      {!loading && tab === 'employees' && (
        <div className="space-y-5">
          <form onSubmit={inviteEmployee} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-600" /><h2 className="font-semibold text-slate-900">Invite an employee</h2></div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">Full name<input required value={inviteName} onChange={e=>setInviteName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" placeholder="Employee name" /></label>
              <label className="text-xs font-semibold text-slate-600">Work email<input required type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" placeholder="name@company.com" /></label>
              <label className="text-xs font-semibold text-slate-600">Assign role<select required value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900">{access.roles.map(role=><option key={role.id} value={role.id}>{role.name}{role.code==='SUPER_ADMIN'?' — full organization access (MFA required)':''}</option>)}</select></label>
              <div className="flex items-end"><button disabled={saving || !inviteRole} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Mail className="h-4 w-4" />{saving?'Sending…':'Send invitation'}</button></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">The employee receives a secure Supabase invitation email. New accounts are linked to this organization and the selected role after invitation creation.</p>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-semibold text-slate-900">Organization employees</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Access</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {access.members.map(member=><tr key={member.user_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-900">{member.full_name || 'Unnamed employee'}</div><div className="text-xs text-slate-500">{member.email || 'Email unavailable'}</div></td>
                    <td className="px-4 py-3"><select disabled={saving || !member.is_active || member.user_id===user.id} value={member.role_id} onChange={e=>void changeRole(member,e.target.value)} className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">{access.roles.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(member.joined_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${member.is_active?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{member.is_active?<CheckCircle2 className="h-3 w-3"/>:<XCircle className="h-3 w-3"/>}{member.is_active?'Active':'Suspended'}</span></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button disabled={saving || member.user_id===user.id} onClick={()=>openMemberPermissions(member)} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">View / edit access</button><button disabled={saving || member.user_id===user.id} onClick={()=>void setMemberActive(member,!member.is_active)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${member.is_active?'border-rose-200 text-rose-700 hover:bg-rose-50':'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{member.is_active?<><UserMinus className="h-3.5 w-3.5"/>Suspend & revoke</>:<><CheckCircle2 className="h-3.5 w-3.5"/>Reactivate</>}</button></div></td>
                  </tr>)}
                  {!access.members.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No employee memberships found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {selectedMember && (
            <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-slate-900">Individual access: {selectedMember.full_name || selectedMember.email}</h2>
                  <p className="mt-1 text-xs text-slate-500">Role: {selectedMember.role_name}. Checked permissions are effective access; role defaults start checked. Changes here apply only to this employee.</p>
                </div>
                <button type="button" onClick={()=>setSelectedMemberId('')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Close</button>
              </div>
              <div className="mt-4 space-y-4">
                {permissionGroups.map(([group,items])=><div key={group} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{labelFor(group)}</h3><span className="text-[11px] text-slate-400">{items.filter(item=>selectedMemberPermissions.includes(item.code)).length}/{items.length} enabled</span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(permission=><label key={permission.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={selectedMemberPermissions.includes(permission.code)} onChange={()=>toggleMemberPermission(permission.code)} className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                      <span><span className="font-semibold">{labelFor(permission.code)}</span><span className="block text-[11px] text-slate-400">{permission.description}</span></span>
                    </label>)}
                  </div>
                </div>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={saving} onClick={()=>void saveMemberPermissions()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save individual permissions'}</button><button type="button" onClick={()=>setSelectedMemberPermissions(access.roles.find(role=>role.id===selectedMember.role_id)?.permissions||[])} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Reset to role defaults</button><span className="text-xs text-slate-500">Only Super Admin can change these settings.</span></div>
            </section>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-semibold text-slate-900">Pending invitations</h2></div>
            <div className="divide-y divide-slate-100">
              {access.invitations.map(invite=><div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="font-medium text-slate-900">{invite.email}</div><div className="text-xs text-slate-500">Expires {new Date(invite.expires_at).toLocaleString()}</div></div><button disabled={saving} onClick={()=>void revokeInvitation(invite)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Revoke invitation</button></div>)}
              {!access.invitations.length && <div className="px-4 py-6 text-center text-sm text-slate-500">No pending invitations.</div>}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'roles' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-900">Role templates</h2><p className="mt-1 text-xs text-slate-500">Preconfigured job responsibilities are already selected for each standard role. System templates stay protected; create an organization-specific copy to customize.</p></div>
            {access.roles.map(role=><div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-slate-900">{role.name}</div><div className="mt-0.5 text-xs text-slate-500">{role.description || (role.is_system?'Built-in responsibility template':'Custom organization role')}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{role.is_system?'System':role.is_custom?'Custom':'Role'}</span></div>
              <div className="mt-2 text-xs text-slate-500">{role.code==='SUPER_ADMIN'?'Full access to this organization only.':(role.permissions||[]).length+' permissions assigned'}</div>
              {role.is_custom ? <button onClick={()=>editRole(role)} className="mt-3 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Edit permissions</button> : role.is_system && role.code !== 'SUPER_ADMIN' ? <button onClick={()=>copyRoleTemplate(role)} className="mt-3 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Customize this role</button> : null}
            </div>)}
          </div>

          <form onSubmit={createOrUpdateRole} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-indigo-600"/><h2 className="font-semibold text-slate-900">{roleId?'Edit custom role':'Create custom role'}</h2></div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">Start from responsibility template<select value={templateId} onChange={e=>chooseTemplate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900">{access.roles.filter(role=>role.is_system).map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Custom role name<input required minLength={2} maxLength={80} value={roleName} onChange={e=>setRoleName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" placeholder="e.g. Senior Warehouse Supervisor"/></label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Description<textarea maxLength={500} value={roleDescription} onChange={e=>setRoleDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" rows={2} placeholder="Describe this role's responsibilities"/></label>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Module permissions</h3><span className="text-xs text-slate-500">{rolePermissions.length} selected</span></div>
              {permissionGroups.map(([group,items])=><div key={group} className="rounded-lg border border-slate-200 p-3"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{labelFor(group)}</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{items.map(permission=><label key={permission.id} className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={rolePermissions.includes(permission.code)} onChange={()=>togglePermission(permission.code)} className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/><span><span className="font-semibold">{labelFor(permission.code)}</span><span className="block text-[11px] text-slate-400">{permission.description}</span></span></label>)}</div></div>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button disabled={saving || !roleName.trim()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving?'Saving…':roleId?'Save role changes':'Create role'}</button><button type="button" onClick={()=>{setRoleId('');setRoleName('');setRoleDescription('');chooseTemplate(templateId);}} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Reset</button></div>
            <p className="mt-3 text-xs text-slate-500">Super Admin is a protected built-in role and cannot be modified. Assigning it grants full access within this organization only.</p>
          </form>
        </div>
      )}

      {!loading && tab === 'history' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-600"/><h2 className="font-semibold text-slate-900">Role, permission and access history</h2></div><p className="mt-1 text-xs text-slate-500">Recent security-sensitive changes for this organization.</p></div>
          <div className="divide-y divide-slate-100">
            {access.history.map(item=><div key={item.id} className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-indigo-700">{item.action.replace(/_/g,' ')}</span><span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</span></div><div className="mt-1 text-sm text-slate-800">{item.entity} · {item.entity_id}</div>{item.notes&&<div className="mt-0.5 text-xs text-slate-500">{item.notes}</div>}</div>)}
            {!access.history.length&&<div className="px-4 py-8 text-center text-sm text-slate-500">No access changes recorded yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
};
