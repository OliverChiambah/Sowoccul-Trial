import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { loan } from '../lib/loanStrings.js';
import { digitsOnly, formatFCFA } from '../lib/format.js';

const NATURE_KEYS = [
  'agriculture', 'inputs_delivery', 'agro_pastoral_fishing', 'transport_equipment',
  'commerce', 'transformation', 'consumption_social', 'education', 'equipment',
  'market', 'health', 'real_estate', 'state_immobilized', 'other',
];

const TOTAL = 6;

export default function ApplyLoan() {
  const { lang } = useLang();
  const L = loan[lang];

  const [step, setStep] = useState(1);
  const [data, setData] = useState({ loan_nature: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // holds reference on success

  function set(name, value) {
    setData((d) => ({ ...d, [name]: value }));
  }
  function toggleNature(key) {
    setData((d) => {
      const has = d.loan_nature.includes(key);
      return { ...d, loan_nature: has ? d.loan_nature.filter((k) => k !== key) : [...d.loan_nature, key] };
    });
  }

  // Current requested amount, used for conditional co-obligor / collateral rules.
  const amountValue = parseInt(digitsOnly(data.loan_amount_figures), 10) || 0;

  // Minimal required-field validation per step.
  function validate() {
    setError('');
    if (step === 1 && (!data.surname || !data.given_names || !data.phone)) {
      setError(L.required_star + ': ' + [L.surname, L.given_names, L.phone].join(', '));
      return false;
    }
    if (step === 3) {
      if (!data.loan_purpose || !digitsOnly(data.loan_amount_figures)) {
        setError(L.required_star + ': ' + [L.loan_purpose, L.loan_amount_figures].join(', '));
        return false;
      }
      // Above 2M XAF a co-obligor (with the amount they stand in for) is required.
      if (amountValue > 2000000 && (!data.coobligor_name || !digitsOnly(data.coobligor_amount))) {
        setError(L.err_coobligor);
        return false;
      }
      // Above 3M XAF collateral evidence must be uploaded.
      if (amountValue > 3000000 && !data.collateral_filename) {
        setError(L.err_collateral);
        return false;
      }
    }
    if (step === 6 && (!data.sig_name || !data.decl_honor_accepted)) {
      setError(L.required_star + ': ' + L.sig_name);
      return false;
    }
    return true;
  }

  function next() { if (validate()) { setStep((s) => Math.min(s + 1, TOTAL)); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
  function back() { setError(''); setStep((s) => Math.max(s - 1, 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function submit() {
    if (!validate()) return;
    setBusy(true); setError('');
    try {
      const payload = {
        ...data,
        loan_amount_figures: digitsOnly(data.loan_amount_figures),
        language: lang,
      };
      const { reference } = await api('/loans', { method: 'POST', body: payload });
      setDone(reference);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- success screen ---
  if (done) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '20px auto', textAlign: 'center', padding: '40px 32px' }}>
        <div className="auth-seal" style={{ margin: '0 auto 18px' }}>✓</div>
        <h1 className="page-title" style={{ fontSize: 24 }}>{L.confirm_title}</h1>
        <p className="page-intro" style={{ margin: '0 auto 18px' }}>{L.confirm_text}</p>
        <div className="mono" style={{ fontWeight: 600, marginBottom: 22 }}>{L.ref_label}: {done}</div>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link to="/loans" className="btn btn-primary">{lang === 'fr' ? 'Mes prêts' : 'My loans'}</Link>
          <button className="btn btn-ghost" onClick={() => { setDone(null); setData({ loan_nature: [] }); setStep(1); }}>
            {L.new_app}
          </button>
        </div>
      </div>
    );
  }

  const T = (name, opts = {}) => (
    <div className={`field ${opts.full ? 'full' : ''}`}>
      <label>{opts.label}{opts.req && <span className="req">*</span>}</label>
      {opts.amount ? (
        <div className="amount-wrap">
          <input className="amount" inputMode="numeric" value={data[name] || ''}
            onChange={(e) => set(name, formatFCFA(digitsOnly(e.target.value)))} />
          <span className="amount-suffix">FCFA</span>
        </div>
      ) : opts.type === 'textarea' ? (
        <textarea value={data[name] || ''} onChange={(e) => set(name, e.target.value)} />
      ) : opts.select ? (
        <select value={data[name] || ''} onChange={(e) => set(name, e.target.value)}>
          <option value="">{lang === 'fr' ? 'Choisissez…' : 'Select…'}</option>
          {opts.select.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>
      ) : (
        <input type={opts.type || 'text'} value={data[name] || ''} onChange={(e) => set(name, e.target.value)} />
      )}
    </div>
  );

  return (
    <>
      <div className="page-eyebrow">{L.eyebrow}</div>
      <h1 className="page-title">{L.title}</h1>
      <p className="page-intro">{L.intro}</p>

      <div className="stepper">
        {L.step_short.map((label, i) => {
          const n = i + 1;
          const cls = 'step-chip' + (n === step ? ' active' : n < step ? ' complete' : '');
          return (
            <button key={n} type="button" className={cls} onClick={() => setStep(n)}>
              <span className="n">{n}</span>{label}
            </button>
          );
        })}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="page-eyebrow" style={{ marginBottom: 2 }}>{`${step} / ${TOTAL}`}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--forest-900)', fontSize: 22, margin: '0 0 6px' }}>
          {L.step_title[step - 1]}
        </h2>
        <p className="muted" style={{ fontSize: 13.5, margin: '0 0 20px', maxWidth: 620 }}>{L.step_intro[step - 1]}</p>

        {/* STEP 1 — IDENTITY */}
        {step === 1 && (
          <>
            <div className="card-legend">{L.g_identity}</div>
            <div className="grid2">
              {T('surname', { label: L.surname, req: true })}
              {T('given_names', { label: L.given_names, req: true })}
              {T('gender', { label: L.gender, select: [['male', L.opt_male], ['female', L.opt_female]] })}
              {T('marital_status', { label: L.marital_status, select: [['single', L.opt_single], ['married', L.opt_married], ['divorced', L.opt_divorced], ['widowed', L.opt_widowed]] })}
              {T('id_number', { label: L.id_number })}
              {T('id_place', { label: L.id_place })}
              {T('niu', { label: L.niu })}
              {T('matricule', { label: L.matricule })}
              {T('dob', { label: L.dob, type: 'date' })}
              {T('pob', { label: L.pob })}
            </div>

            <div className="card-legend" style={{ marginTop: 20 }}>{L.g_contact}</div>
            <div className="grid2">
              {T('phone', { label: L.phone, req: true, type: 'tel' })}
              {T('po_box', { label: L.po_box })}
              {T('email', { label: L.email, type: 'email' })}
              {T('residential_address', { label: L.residential_address })}
              {T('work_address', { label: L.work_address, full: true })}
            </div>

            <div className="card-legend" style={{ marginTop: 20 }}>{L.g_membership}</div>
            <div className="grid2">
              {T('is_staff_or_elected', { label: L.is_staff, select: [['yes', L.opt_yes], ['no', L.opt_no]] })}
              {T('friends_relations', { label: L.friends_relations })}
              {T('membership_duration', { label: L.membership_duration })}
              {T('co_obligor_elsewhere', { label: L.co_obligor_elsewhere, select: [['yes', L.opt_yes], ['no', L.opt_no]] })}
              {T('spouse_name', { label: L.spouse_name })}
              {T('spouse_contact', { label: L.spouse_contact })}
            </div>
          </>
        )}

        {/* STEP 2 — CAPACITY */}
        {step === 2 && (
          <>
            <div className="card-legend">{L.g_employment}</div>
            <div className="grid2">
              {T('profession', { label: L.profession })}
              {T('employer', { label: L.employer })}
              {T('employer_address', { label: L.employer_address, full: true })}
              {T('net_salary', { label: L.net_salary, amount: true })}
              {T('years_service', { label: L.years_service })}
              {T('retirement_date', { label: L.retirement_date, type: 'date' })}
              {T('spouse_salary', { label: L.spouse_salary, amount: true })}
              {T('other_income', { label: L.other_income })}
            </div>
          </>
        )}

        {/* STEP 3 — LOAN DETAILS */}
        {step === 3 && (
          <>
            <div className="card-legend">{L.g_nature}</div>
            <div className="check-grid" style={{ marginBottom: 22 }}>
              {NATURE_KEYS.map((k) => (
                <label key={k} className="check-item">
                  <input type="checkbox" checked={data.loan_nature.includes(k)} onChange={() => toggleNature(k)} />
                  <span>{L.nature[k]}</span>
                </label>
              ))}
            </div>
            <div className="grid2">
              {T('loan_purpose', { label: L.loan_purpose, req: true, type: 'textarea', full: true })}
              {T('loan_amount_figures', { label: L.loan_amount_figures, req: true, amount: true })}
              {T('loan_amount_words', { label: L.loan_amount_words })}
            </div>

            <div className="card-legend" style={{ marginTop: 20 }}>{L.g_repayment}</div>
            <div className="grid3">
              {T('repay_frequency', { label: L.repay_frequency, select: [['weekly', L.opt_weekly], ['monthly', L.opt_monthly], ['quarterly', L.opt_quarterly], ['semiannual', L.opt_semiannual], ['annual', L.opt_annual]] })}
              {T('duration_months', { label: L.duration_months })}
              {T('num_installments', { label: L.num_installments })}
              {T('installment_amount', { label: L.installment_amount, amount: true })}
            </div>

            {/* Co-obligor required above 2,000,000 XAF */}
            {amountValue > 2000000 && (
              <>
                <div className="card-legend" style={{ marginTop: 20 }}>{L.g_coobligor} <span className="req">*</span></div>
                <div className="alert" style={{ background: 'var(--blue-50)', color: 'var(--blue-800)', border: '1px solid var(--blue-100)' }}>{L.coobligor_note}</div>
                <div className="grid2">
                  {T('coobligor_name', { label: L.coobligor_name, req: true })}
                  {T('coobligor_phone', { label: L.coobligor_phone, type: 'tel' })}
                  {T('coobligor_id', { label: L.coobligor_id })}
                  {T('coobligor_amount', { label: L.coobligor_amount, amount: true, req: true })}
                </div>
              </>
            )}

            {/* Collateral evidence required above 3,000,000 XAF */}
            {amountValue > 3000000 && (
              <>
                <div className="card-legend" style={{ marginTop: 20 }}>{L.g_collateral} <span className="req">*</span></div>
                <div className="alert" style={{ background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid rgba(183,121,31,0.2)' }}>{L.collateral_note}</div>
                <div className="grid2">
                  {T('collateral_description', { label: L.collateral_description, type: 'textarea', full: true })}
                  {T('collateral_value', { label: L.collateral_value, amount: true })}
                  <div className="field">
                    <label>{L.collateral_file}<span className="req">*</span></label>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      set('collateral_filename', f ? f.name : '');
                    }} />
                    {data.collateral_filename && <span className="hint">✓ {data.collateral_filename}</span>}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* STEP 4 — GUARANTEES */}
        {step === 4 && (
          <>
            <div className="card-legend">{L.g_real_estate}</div>
            {[1, 2].map((i) => (
              <div className="subcard" key={i}>
                <span className="subcard-label">{lang === 'fr' ? `Propriété ${i}` : `Property ${i}`}</span>
                <div className="grid2" style={{ marginTop: 8 }}>
                  {T(`re${i}_title_deed`, { label: L.re_title_deed })}
                  {T(`re${i}_owner`, { label: L.re_owner })}
                  {T(`re${i}_location`, { label: L.re_location })}
                  {T(`re${i}_value`, { label: L.re_value, amount: true })}
                </div>
              </div>
            ))}

            <div className="card-legend" style={{ marginTop: 20 }}>{L.g_movable}</div>
            <div className="grid2">
              {T('movable_type', { label: L.movable_type })}
              {T('movable_value', { label: L.movable_value, amount: true })}
            </div>

            <div className="card-legend" style={{ marginTop: 20 }}>{L.g_other_guarantees}</div>
            <div className="grid2">
              {T('guarantee_savings', { label: L.g_savings, amount: true })}
              {T('guarantee_bonds', { label: L.g_bonds, amount: true })}
              {T('guarantee_term_deposit', { label: L.g_term_deposit, amount: true })}
              {T('guarantee_stock', { label: L.g_stock, amount: true })}
            </div>
          </>
        )}

        {/* STEP 5 — DECLARATIONS */}
        {step === 5 && (
          <>
            <label className="check-item" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={!!data.decl_crm_accepted} onChange={(e) => set('decl_crm_accepted', e.target.checked)} />
              <span>{L.decl_crm}</span>
            </label>
            <label className="check-item">
              <input type="checkbox" checked={!!data.decl_honor_accepted} onChange={(e) => set('decl_honor_accepted', e.target.checked)} />
              <span>{L.decl_honor}</span>
            </label>
          </>
        )}

        {/* STEP 6 — SIGN */}
        {step === 6 && (
          <>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>{L.review_note}</p>
            <div className="grid2">
              {T('sig_name', { label: L.sig_name, req: true, full: true })}
              {T('sig_place', { label: L.sig_place })}
              {T('sig_date', { label: L.sig_date, type: 'date' })}
            </div>
            {!data.decl_honor_accepted && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                {lang === 'fr' ? 'Veuillez accepter la déclaration sur l\'honneur à l\'étape 5.' : 'Please accept the declaration of honour on step 5.'}
              </div>
            )}
          </>
        )}

        <div className="btn-row" style={{ marginTop: 24, justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={back} disabled={step === 1}>{L.back}</button>
          {step < TOTAL ? (
            <button className="btn btn-primary" onClick={next}>{L.next}</button>
          ) : (
            <button className="btn btn-gold" onClick={submit} disabled={busy}>
              {busy ? L.submitting : L.submit}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
