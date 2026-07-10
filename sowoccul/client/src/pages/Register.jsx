import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Wordmark } from '../components/Brand.jsx';
import { digitsOnly, formatFCFA } from '../lib/format.js';
import { useBranches } from '../context/BranchesContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const { lang, setLang, t } = useLang();
  const { branches: BRANCHES, headquarters: HEADQUARTERS } = useBranches();
  const navigate = useNavigate();

  const [type, setType] = useState('individual');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [c, setC] = useState(null);

  // The become-a-member page copy is admin-editable, served from the API.
  useEffect(() => {
    let active = true;
    api('/content/register').then((r) => { if (active) setC(r.data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const setAmount = (name) => (e) => setForm((f) => ({ ...f, [name]: formatFCFA(digitsOnly(e.target.value)) }));
  // Records the chosen file's name. A real deployment would upload the file
  // itself via multipart and store a reference; here we keep the filename.
  const onFile = (name) => (e) => {
    const file = e.target.files && e.target.files[0];
    setForm((f) => ({ ...f, [name]: file ? file.name : '' }));
  };

  const Field = ({ label, name, type: inputType = 'text', amount, req, full, options }) => (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}{req && <span className="req">*</span>}</label>
      {options ? (
        <select value={form[name] || ''} onChange={set(name)}>
          <option value="">{t('select')}</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : amount ? (
        <div className="amount-wrap">
          <input className="amount" inputMode="numeric" value={form[name] || ''} onChange={setAmount(name)} />
          <span className="amount-suffix">FCFA</span>
        </div>
      ) : (
        <input type={inputType} value={form[name] || ''} onChange={set(name)} />
      )}
    </div>
  );

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    // Client-side checks mirror the server so the message is instant.
    if (!form.branch) { setError(t('reg_err_branch')); return; }
    if (!form.photo_filename || !form.id_card_filename) { setError(t('reg_err_docs')); return; }
    if (!form.signature || !form.signature.trim()) { setError(t('reg_err_sign')); return; }
    if ((form.password || '').length < 8) { setError(t('pw_short')); return; }
    if (form.password !== form.confirm_password) { setError(t('pw_mismatch')); return; }
    setBusy(true);
    try {
      const res = await register({ ...form, applicant_type: type });
      if (res && res.verification_required) {
        // Send them to the verification page with their email prefilled.
        navigate(`/verify-email?email=${encodeURIComponent(res.email || form.email || '')}`);
        return;
      }
      setRegEmail(form.email || '');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-brandside">
          <Wordmark size={46} light />
          <div><h2>{t('reg_done_title')}</h2><p>{t('reg_done')}</p></div>
          <div className="motto">“Serving our members since 1995.”</div>
        </div>
        <div className="auth-formside"><div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-700)', fontSize: 28 }}>✓</div>
          <h1 className="auth-title">{t('reg_done_title')}</h1>
          <p className="auth-sub">{t('reg_done')}</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')}>{t('reg_go_dashboard')}</button>
        </div></div>
      </div>
    );
  }

  const yesNo = [['yes', lang === 'fr' ? 'Oui' : 'Yes'], ['no', lang === 'fr' ? 'Non' : 'No']];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 22px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <Wordmark size={40} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="lang-toggle" data-lang={lang} style={{ background: 'var(--paper-100)' }}>
            <span className="pill" />
            <button className={lang === 'en' ? 'active' : ''} style={{ color: lang === 'en' ? '#fff' : 'var(--ink-600)' }} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'fr' ? 'active' : ''} style={{ color: lang === 'fr' ? '#fff' : 'var(--ink-600)' }} onClick={() => setLang('fr')}>FR</button>
          </div>
          <Link to="/" className="btn btn-ghost">{t('reg_back')}</Link>
        </div>
      </div>

      <div className="page-eyebrow">{t('reg_eyebrow')}</div>
      <h1 className="page-title">{c?.heading || t('reg_title')}</h1>
      <p className="page-intro">{c?.subheading || t('reg_intro')}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="toggle-row" style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        <button type="button" onClick={() => setType('individual')}
          className="card" style={{ flex: 1, margin: 0, cursor: 'pointer', textAlign: 'left', border: type === 'individual' ? '2px solid var(--green-500)' : '1px solid var(--line)' }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{t('reg_type_individual')}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{t('reg_type_individual_sub')}</div>
        </button>
        <button type="button" onClick={() => setType('business')}
          className="card" style={{ flex: 1, margin: 0, cursor: 'pointer', textAlign: 'left', border: type === 'business' ? '2px solid var(--green-500)' : '1px solid var(--line)' }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{t('reg_type_business')}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{t('reg_type_business_sub')}</div>
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="card">
          <div className="card-legend">{t('reg_g_base')}</div>
          {type === 'individual' ? (
            <div className="grid2">
              <Field label={t('reg_surname')} name="surname" req />
              <Field label={t('reg_given')} name="given_names" req />
              <Field label={t('reg_sex')} name="gender" options={[['male', lang === 'fr' ? 'Masculin' : 'Male'], ['female', lang === 'fr' ? 'Féminin' : 'Female']]} />
              <Field label={t('reg_marital')} name="marital_status" options={[['single', lang === 'fr' ? 'Célibataire' : 'Single'], ['married', lang === 'fr' ? 'Marié(e)' : 'Married'], ['divorced', lang === 'fr' ? 'Divorcé(e)' : 'Divorced'], ['widowed', lang === 'fr' ? 'Veuf/Veuve' : 'Widowed']]} />
              <Field label={t('reg_regime')} name="matrimonial_regime" options={[['monogamy', lang === 'fr' ? 'Monogamie' : 'Monogamy'], ['polygamy', lang === 'fr' ? 'Polygamie' : 'Polygamy']]} />
              <Field label={t('reg_property')} name="property_regime" options={[['common', lang === 'fr' ? 'Biens communs' : 'Common'], ['separate', lang === 'fr' ? 'Biens séparés' : 'Separate']]} />
              <Field label={t('reg_cni')} name="cni_number" />
              <Field label={t('reg_cni_date')} name="cni_date" type="date" />
              <Field label={t('reg_cni_place')} name="cni_place" />
              <Field label={t('reg_dob')} name="dob" type="date" />
              <Field label={t('reg_pob')} name="pob" />
              <Field label={t('reg_nationality')} name="nationality" />
              <Field label={t('reg_village')} name="village" />
              <Field label={t('reg_niu')} name="niu" />
              <Field label={t('reg_matricule')} name="matricule" />
              <Field label={t('reg_account_no')} name="account_no" />
            </div>
          ) : (
            <div className="grid2">
              <Field label={t('reg_company')} name="company_name" req full />
              <Field label={t('reg_legal_form')} name="legal_form" />
              <Field label={t('reg_rccm')} name="rccm_no" />
              <Field label={t('reg_hq')} name="registered_office" />
              <Field label={t('reg_niu')} name="niu" />
              <Field label={t('reg_matricule')} name="matricule" />
              <Field label={t('reg_account_no')} name="account_no" />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-legend">{t('reg_g_branch')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('reg_branch_hint')}</p>
          <div className="grid2">
            <Field label={t('reg_branch')} name="branch" req options={BRANCHES.map((b) => [b, b === HEADQUARTERS ? `${b} (HQ)` : b])} />
          </div>
        </div>

        <div className="card">
          <div className="card-legend">{t('reg_g_contact')}</div>
          <div className="grid2">
            <Field label={t('reg_tel')} name="phone" type="tel" req />
            <Field label={t('reg_pobox')} name="po_box" />
            <Field label={t('reg_res_address')} name="residential_address" full />
            <Field label={t('reg_work_address')} name="work_address" full />
            <Field label={t('reg_elected')} name="is_elected" options={yesNo} />
            <Field label={t('reg_friends')} name="friends_at_union" />
            <Field label={t('reg_duration')} name="membership_duration" />
            <Field label={t('reg_coobligor')} name="coobligor_elsewhere" options={yesNo} />
            <Field label={t('reg_spouse')} name="spouse_name" />
            <Field label={t('reg_spouse_contact')} name="spouse_contact" />
          </div>
        </div>

        {type === 'individual' ? (
          <div className="card">
            <div className="card-legend">{t('reg_g_physical')}</div>
            <div className="grid2">
              <Field label={t('reg_profession')} name="profession" />
              <Field label={t('reg_position')} name="position" />
              <Field label={t('reg_employer')} name="employer" />
              <Field label={t('reg_employer_addr')} name="employer_address" />
              <Field label={t('reg_net_salary')} name="net_salary" amount />
              <Field label={t('reg_seniority')} name="seniority" />
              <Field label={t('reg_retire_date')} name="retirement_date" type="date" />
              <Field label={t('reg_spouse_salary')} name="spouse_salary" amount />
              <Field label={t('reg_other_income')} name="other_income" full />
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-legend">{t('reg_g_business')}</div>
            <div className="grid2">
              <Field label={t('reg_sector')} name="business_sector" />
              <Field label={t('reg_seniority_biz')} name="business_seniority" />
              <Field label={t('reg_taxpayer')} name="taxpayer_card" />
              <Field label={t('reg_license')} name="license_no" />
              <Field label={t('reg_cnps')} name="cnps_no" />
              <Field label={t('reg_rep')} name="representative_name" />
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-legend">{t('reg_g_docs')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('reg_docs_hint')}</p>
          <div className="grid2">
            <div className="field">
              <label>{t('reg_photo')}<span className="req">*</span></label>
              <input type="file" accept="image/*" onChange={onFile('photo_filename')} />
              {form.photo_filename && <span className="hint">✓ {form.photo_filename}</span>}
            </div>
            <div className="field">
              <label>{t('reg_idcard')}<span className="req">*</span></label>
              <input type="file" accept="image/*,application/pdf" onChange={onFile('id_card_filename')} />
              {form.id_card_filename && <span className="hint">✓ {form.id_card_filename}</span>}
            </div>
          </div>
          <div className="field full">
            <label>{t('reg_signature')}<span className="req">*</span></label>
            <input value={form.signature || ''} onChange={set('signature')} placeholder={t('reg_signature_ph')} />
            {form.signature && (
              <div style={{ marginTop: 10, padding: '14px 18px', border: '1px dashed var(--line)', borderRadius: 10, background: 'var(--paper-50)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('reg_signed')}</div>
                <div style={{ fontFamily: "'Fraunces', cursive", fontSize: 30, fontStyle: 'italic', color: 'var(--navy)', lineHeight: 1.2 }}>{form.signature}</div>
              </div>
            )}
            <span className="hint">{t('reg_signature_hint')}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-legend">{t('reg_g_login')}</div>
          <div className="grid2">
            <Field label={t('reg_email')} name="email" type="email" req full />
            <div className="field">
              <label>{t('reg_password')}<span className="req">*</span></label>
              <input type="password" value={form.password || ''} onChange={set('password')} autoComplete="new-password" />
              <span className="hint">{t('reg_pw_hint')}</span>
            </div>
            <div className="field">
              <label>{t('reg_confirm')}<span className="req">*</span></label>
              <input type="password" value={form.confirm_password || ''} onChange={set('confirm_password')} autoComplete="new-password" />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{c?.button || t('reg_submit')}</button>
            <Link to="/login" className="btn btn-ghost">{t('reg_have')} {t('reg_signin')}</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
