import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, formatDate } from '../lib/format.js';
import { StatusPill } from '../components/ui.jsx';

export default function AdminLoans() {
  const { lang, t } = useLang();
  const [filter, setFilter] = useState('pending');
  const [loans, setLoans] = useState([]);
  const [selected, setSelected] = useState(null); // detail object
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const q = filter === 'all' ? '' : `?status=${filter}`;
    const { loans } = await api(`/admin/loans${q}`);
    setLoans(loans);
    setLoading(false);
  }
  useEffect(() => { load(); }, [filter]);

  async function openDetail(id) {
    const { loan } = await api(`/admin/loans/${id}`);
    setSelected(loan);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (selected) {
    return <LoanDetail loan={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  const filters = ['pending', 'under_review', 'approved', 'rejected', 'all'];
  const filterLabel = (f) => f === 'all' ? t('filter_all') : t(`st_${f}`);

  return (
    <>
      <div className="page-eyebrow">{t('admin_loans_eyebrow')}</div>
      <h1 className="page-title">{t('admin_loans_title')}</h1>
      <p className="page-intro">{t('admin_loans_intro')}</p>

      <div className="stepper" style={{ marginBottom: 18 }}>
        {filters.map((f) => (
          <button key={f} className={'step-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
            {filterLabel(f)}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? <div className="loading">…</div> : loans.length === 0 ? (
          <div className="empty">{lang === 'fr' ? 'Aucune demande.' : 'No applications.'}</div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('ref')}</th>
                <th>{t('applicant')}</th>
                <th style={{ textAlign: 'right' }}>{t('amount_col')}</th>
                <th>{t('status')}</th>
                <th>{t('submitted')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="mono" style={{ fontSize: 12.5 }}>{l.reference}</td>
                  <td className="tx-desc">{l.applicant_name}</td>
                  <td className="amt">{money(l.amount)}</td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="tx-date">{formatDate(l.created_at, lang)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost" style={{ padding: '7px 14px' }} onClick={() => openDetail(l.id)}>
                      {t('review')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function LoanDetail({ loan, onBack }) {
  const { lang, t } = useLang();
  const [note, setNote] = useState(loan.decision_note || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const p = loan.payload || {};

  async function decide(decision) {
    setBusy(true); setMsg('');
    try {
      await api(`/admin/loans/${loan.id}/decision`, { method: 'POST', body: { decision, note } });
      setMsg(t('saved'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Renders a labelled value if present.
  const Row = ({ label, value }) => value ? (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-400)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  ) : null;

  return (
    <>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>← {t('back_to_list')}</button>

      <div className="page-eyebrow">{loan.reference}</div>
      <h1 className="page-title">{loan.applicant_name}</h1>
      <p className="page-intro">
        {t('amount_col')}: <strong>{money(loan.amount)}</strong> · <StatusPill status={loan.status} />
      </p>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-legend">{t('application_detail')}</div>
          <Row label={t('purpose')} value={loan.purpose} />
          <Row label={t('applicant')} value={`${loan.applicant_name} (${loan.applicant_username})`} />
          <Row label={t('phone') || 'Phone'} value={loan.applicant_phone} />
          <Row label="Email" value={loan.applicant_email} />
          <Row label={lang === 'fr' ? 'Profession' : 'Profession'} value={p.profession} />
          <Row label={lang === 'fr' ? 'Employeur' : 'Employer'} value={p.employer} />
          <Row label={lang === 'fr' ? 'Salaire net' : 'Net salary'} value={p.net_salary ? money(String(p.net_salary).replace(/\D/g, '')) : null} />
          <Row label={lang === 'fr' ? 'Durée (mois)' : 'Duration (months)'} value={p.duration_months} />
          <Row label={lang === 'fr' ? 'Signé par' : 'Signed by'} value={p.sig_name} />
        </div>

        <div className="card">
          <div className="card-legend">{t('decision')}</div>
          {msg && <div className={`alert ${msg === t('saved') ? 'alert-ok' : 'alert-error'}`}>{msg}</div>}
          <div className="field">
            <label>{t('decision_note')}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={lang === 'fr' ? 'Motif / conditions…' : 'Reason / conditions…'} />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => decide('approved')} disabled={busy}>{t('approve')}</button>
            <button className="btn btn-danger" onClick={() => decide('rejected')} disabled={busy}>{t('reject')}</button>
            <button className="btn btn-ghost" onClick={() => decide('under_review')} disabled={busy}>{t('mark_review')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
