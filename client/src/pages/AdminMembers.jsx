import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, digitsOnly, formatFCFA, formatDate } from '../lib/format.js';
import { useAccountLabel } from '../components/ui.jsx';
import { useBranches } from '../context/BranchesContext.jsx';

export default function AdminMembers() {
  const { lang, t } = useLang();
  const { branches: BRANCHES, headquarters: HEADQUARTERS } = useBranches();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [scope, setScope] = useState(null);

  async function load() {
    setLoading(true);
    const q = branchFilter === 'all' ? '' : `?branch=${encodeURIComponent(branchFilter)}`;
    const { members, scope } = await api(`/admin/members${q}`);
    setMembers(members);
    setScope(scope || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, [branchFilter]);

  async function open(id) {
    const detail = await api(`/admin/members/${id}`);
    setSelected(detail);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (selected) {
    return <MemberDetail data={selected} onBack={() => { setSelected(null); load(); }} onRefresh={() => open(selected.member.id)} />;
  }

  // Group the (already branch-sorted) members by branch for display.
  const groups = {};
  for (const m of members) { (groups[m.branch] = groups[m.branch] || []).push(m); }
  const branchOrder = BRANCHES.filter((b) => groups[b]);
  // Staff are locked to their own branch; managers/admins may filter across all.
  const allBranches = !scope || scope.all_branches;
  const canCreate = !scope || scope.can_edit;

  const MemberRow = ({ m }) => (
    <tr>
      <td>
        <div className="tx-desc">{m.full_name}</div>
        <div className="tx-date">{m.username} · {m.phone}</div>
      </td>
      <td>{m.account_count}</td>
      <td className="amt">{money(m.total_balance)}</td>
      <td className={`amt ${m.outstanding > 0 ? 'debit' : ''}`}>{m.outstanding > 0 ? money(m.outstanding) : '—'}</td>
      <td>{m.review_status === 'pending_review'
        ? <span className="pill-status status-pending">{t('review_pending')}</span>
        : <span className="pill-status status-approved">{t('review_active')}</span>}</td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn-ghost" style={{ padding: '7px 14px' }} onClick={() => open(m.id)}>{t('open_member')}</button>
      </td>
    </tr>
  );

  return (
    <>
      <div className="page-eyebrow">{t('admin_members_eyebrow')}</div>
      <h1 className="page-title">{t('admin_members_title')}</h1>
      <p className="page-intro">{t('admin_members_intro')} {t('grouped_by_branch')}</p>

      <div className="btn-row" style={{ marginBottom: showCreate ? 12 : 18 }}>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? t('create_member_close') : `+ ${t('create_member')}`}
          </button>
        )}
        {scope && scope.role === 'staff' && (
          <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
            {t('scope_your_branch').replace('{branch}', scope.branch)}{scope.can_edit ? '' : ` · ${t('scope_view_only')}`}
          </span>
        )}
      </div>
      {canCreate && showCreate && <CreateMemberForm scope={scope} onCreated={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />}

      {allBranches && (
        <div className="stepper" style={{ marginBottom: 18 }}>
          <button className={'step-chip' + (branchFilter === 'all' ? ' active' : '')} onClick={() => setBranchFilter('all')}>{t('all_branches')}</button>
          {BRANCHES.map((b) => (
            <button key={b} className={'step-chip' + (branchFilter === b ? ' active' : '')} onClick={() => setBranchFilter(b)}>
              {b}{b === HEADQUARTERS ? ' (HQ)' : ''}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="loading">…</div> : branchOrder.length === 0 ? (
        <div className="card"><div className="empty">{lang === 'fr' ? 'Aucun membre.' : 'No members.'}</div></div>
      ) : branchOrder.map((branch) => (
        <div className="card" key={branch}>
          <div className="card-legend" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{branch}{branch === HEADQUARTERS ? ` · ${t('headquarters')}` : ''}</span>
            <span className="muted">{groups[branch].length}</span>
          </div>
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('member')}</th>
                <th>{t('accounts')}</th>
                <th style={{ textAlign: 'right' }}>{t('balance')}</th>
                <th style={{ textAlign: 'right' }}>{t('nav_loanbal')}</th>
                <th>{t('status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups[branch].map((m) => <MemberRow key={m.id} m={m} />)}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function MemberDetail({ data, onBack, onRefresh }) {
  const { lang, t } = useLang();
  const { branches: BRANCHES, headquarters: HEADQUARTERS } = useBranches();
  const accLabel = useAccountLabel();
  const { member, accounts, outstanding } = data;
  const mayEdit = data.may_edit !== false; // server tells us; default permissive for older responses
  // Only managers/admins can move a member between branches. We infer that from
  // whether this member's own branch differs is irrelevant; the reassign control
  // is a cross-branch action, gated on the server to manager/admin. We surface it
  // only when the viewer can edit AND can see all branches (managers/admins).
  const canReassign = mayEdit && (data.all_branches !== false);
  const CARD_COLORS = ['green', 'blue', 'navy'];

  const [accountId, setAccountId] = useState(accounts[0]?.id ? String(accounts[0].id) : '');
  const [kind, setKind] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const isRepay = kind === 'repayment';
  const [branch, setBranch] = useState(member.branch || HEADQUARTERS);

  async function markReviewed() {
    setMsg('');
    try {
      await api(`/admin/members/${member.id}/mark-reviewed`, { method: 'POST' });
      setMsg(t('reviewed_done'));
      onRefresh();
    } catch (err) { setMsg(err.message); }
  }

  async function saveBranch(newBranch) {
    setBranch(newBranch);
    setMsg('');
    try {
      await api(`/admin/members/${member.id}/branch`, { method: 'POST', body: { branch: newBranch } });
      setMsg(t('branch_saved'));
      onRefresh();
    } catch (err) { setMsg(err.message); }
  }

  // Build a readable list of the stored registration profile.
  const profileEntries = member.profile
    ? Object.entries(member.profile).filter(([, v]) => v !== '' && v != null)
    : [];

  async function post(e) {
    e.preventDefault();
    setMsg(''); setBusy(true);
    const raw = parseInt(digitsOnly(amount), 10);
    try {
      if (isRepay) {
        // Debits the member's savings and reduces the outstanding loan.
        await api(`/admin/members/${member.id}/repay`, { method: 'POST', body: { amount: raw, description: desc } });
      } else {
        let amt = raw;
        if (kind === 'withdrawal') amt = -Math.abs(amt);
        const r = await api(`/admin/accounts/${accountId}/entry`, { method: 'POST', body: { amount: amt, kind, description: desc } });
        if (r && r.pending) {
          // Above the approval limit — money did not move; it's awaiting a second approver.
          setMsg(t('entry_sent_for_approval'));
          setAmount(''); setDesc('');
          setBusy(false);
          return;
        }
      }
      setMsg(t('posted'));
      setAmount(''); setDesc('');
      onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>← {t('back_to_list')}</button>

      <div className="page-eyebrow">{member.username}</div>
      <h1 className="page-title">{member.full_name}</h1>
      <p className="page-intro">{member.email} · {member.phone}</p>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-400)', fontWeight: 600 }}>{t('branch')}</div>
          <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 16 }}>{member.branch}{member.branch === HEADQUARTERS ? ` · ${t('headquarters')}` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          {canReassign && (
            <div className="field" style={{ margin: 0 }}>
              <label>{t('reassign_branch')}</label>
              <select value={branch} onChange={(e) => saveBranch(e.target.value)}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b === HEADQUARTERS ? `${b} (HQ)` : b}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {member.review_status === 'pending_review' && (
        <div className="alert" style={{ background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid rgba(183,121,31,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span><strong>{t('new_registrations')}.</strong> {t('reg_intro')}</span>
          {mayEdit && <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={markReviewed}>{t('mark_reviewed')}</button>}
        </div>
      )}
      {msg && <div className={`alert ${msg === t('posted') || msg === t('reviewed_done') ? 'alert-ok' : 'alert-error'}`}>{msg}</div>}

      {profileEntries.length > 0 && (
        <div className="card">
          <div className="card-legend">{t('reg_profile')} · {member.applicant_type === 'business' ? t('reg_type_business') : t('reg_type_individual')}</div>
          <div className="grid3">
            {profileEntries.map(([k, v]) => (
              <div key={k} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink-400)', fontWeight: 600 }}>{k.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 13.5 }}>{String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="account-grid">
        {accounts.map((a, i) => (
          <div key={a.id} className={`account-card ${CARD_COLORS[i % 3]}`}>
            <div className="type">{accLabel(a.type)}</div>
            <div className="num">{a.account_number}</div>
            <div className="bal">{money(a.balance)}</div>
          </div>
        ))}
        {outstanding && (
          <div className="account-card navy">
            <div className="type">{t('lb_outstanding')}</div>
            <div className="num">{outstanding.reference}</div>
            <div className="bal">{money(outstanding.outstanding)}</div>
            <div className="sub">{t('lb_of')} {money(outstanding.amount)}</div>
          </div>
        )}
      </div>

      {mayEdit ? (
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-legend">{t('post_entry')}</div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('entry_hint')}</p>

        <form onSubmit={post}>
          <div className="grid2">
            <div className="field">
              <label>{t('entry_type')}</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="deposit">{t('entry_deposit')}</option>
                <option value="withdrawal">{t('entry_withdrawal')}</option>
                <option value="repayment">{t('entry_repayment')}</option>
                <option value="loan_disbursement">{t('entry_disbursement')}</option>
                <option value="adjustment">{t('entry_adjustment')}</option>
              </select>
            </div>
            {!isRepay && (
              <div className="field">
                <label>{t('select_account')}</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{accLabel(a.type)} · {a.account_number}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {isRepay && (
            <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
              {outstanding
                ? `${t('repay_hint')} · ${t('lb_outstanding')}: ${money(outstanding.outstanding)}`
                : t('no_active_loan')}
            </p>
          )}
          <div className="field">
            <label>{t('amount')}</label>
            <div className="amount-wrap">
              <input className="amount" inputMode="numeric" value={amount}
                onChange={(e) => setAmount(formatFCFA(digitsOnly(e.target.value)))} placeholder="0" />
              <span className="amount-suffix">FCFA</span>
            </div>
          </div>
          <div className="field">
            <label>{t('entry_desc')}</label>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
          </div>
          <button className="btn btn-primary" disabled={busy || (isRepay && !outstanding) || (!isRepay && !accountId)}>{t('post')}</button>
        </form>
      </div>
      ) : (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-legend">{t('post_entry')}</div>
          <p className="muted" style={{ fontSize: 13 }}>{t('scope_view_only_detail')}</p>
        </div>
      )}
    </>
  );
}

/* ── Staff-created member ────────────────────────────────────────────────── */
function CreateMemberForm({ scope, onCreated, onCancel }) {
  const { t } = useLang();
  const { branches: BRANCHES, headquarters: HEADQUARTERS } = useBranches();
  // Staff create members only in their own branch; managers/admins choose.
  const staffLocked = scope && scope.role === 'staff';
  const initialBranch = staffLocked ? scope.branch : HEADQUARTERS;
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', branch: initialBranch, password: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setMsg(null); setBusy(true);
    try {
      const body = staffLocked ? { ...form, branch: scope.branch } : form;
      const r = await api('/admin/members', { method: 'POST', body });
      setMsg({ ok: true, text: `${t('create_member_done')} (${r.username})` });
      setTimeout(onCreated, 900);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-legend">{t('create_member')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('create_member_hint')}</p>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      <div className="grid2">
        <div className="field"><label>{t('reg_surname')} &amp; {t('reg_given')}</label>
          <input value={form.full_name} onChange={set('full_name')} placeholder={t('content_name_ph')} /></div>
        <div className="field"><label>{t('reg_email')} ({t('username')})</label>
          <input type="email" value={form.email} onChange={set('email')} /></div>
        <div className="field"><label>{t('phone')}</label>
          <input value={form.phone} onChange={set('phone')} /></div>
        <div className="field"><label>{t('branch')}</label>
          {staffLocked
            ? <input value={scope.branch} disabled />
            : <select value={form.branch} onChange={set('branch')}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}{b === HEADQUARTERS ? ' (HQ)' : ''}</option>)}
              </select>}
        </div>
        <div className="field"><label>{t('create_member_temp_pw')}</label>
          <input value={form.password} onChange={set('password')} placeholder={t('create_member_temp_pw_ph')} /></div>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{t('create_member')}</button>
        <button className="btn btn-ghost" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
