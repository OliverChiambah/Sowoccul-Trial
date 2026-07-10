import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, formatDate } from '../lib/format.js';
import { LogoMark } from '../components/Brand.jsx';

export default function Statement() {
  const { lang, t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api('/accounts/statement');
        if (active) setData(res);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Opens a clean printable window; the browser's "Save as PDF" produces the file.
  function downloadPdf() {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = data.transactions.map((tx) => `
      <tr>
        <td>${formatDate(tx.created_at, lang)}</td>
        <td>${escapeHtml(tx.description || '—')}</td>
        <td>${escapeHtml(tx.account_number)}</td>
        <td style="text-align:right;color:${tx.amount >= 0 ? '#127A45' : '#B23A2E'}">${tx.amount >= 0 ? '+' : '−'} ${money(Math.abs(tx.amount))}</td>
        <td style="text-align:right">${money(tx.balance_after)}</td>
      </tr>`).join('');
    const accountsSummary = data.accounts.map((a) => `
      <tr><td>${escapeHtml(a.account_number)}</td><td>${a.type}</td><td style="text-align:right">${money(a.balance)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SOWOCCUL Statement</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#16211C;padding:32px;max-width:800px;margin:0 auto;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #127A45;padding-bottom:16px;margin-bottom:20px;}
        .brand{font-size:20px;font-weight:bold;color:#0F5132;}
        .brand small{display:block;font-size:11px;color:#1E56A0;font-weight:normal;letter-spacing:1px;}
        h1{font-size:18px;margin:0 0 4px;color:#122A54;}
        .meta{font-size:12px;color:#555;line-height:1.7;}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px;}
        th{text-align:left;background:#EFF8F2;padding:8px;border-bottom:2px solid #DCE4E0;font-size:11px;text-transform:uppercase;letter-spacing:.4px;}
        td{padding:8px;border-bottom:1px solid #EAECE9;}
        .section-title{font-size:13px;font-weight:bold;color:#0F5132;margin:22px 0 4px;}
        .foot{margin-top:26px;font-size:10.5px;color:#888;border-top:1px solid #DCE4E0;padding-top:12px;}
      </style></head><body>
      <div class="head">
        <div><div class="brand">SONEL Workers Credit Union<small>SOWOCCUL · Licensed MFI (COBAC · MINFI · CEMAC · NCC)</small></div></div>
        <div class="meta" style="text-align:right">
          <strong>${t('stmt_title')}</strong><br>
          ${escapeHtml(data.member.full_name)}<br>
          ${escapeHtml(data.member.email || '')}<br>
          ${t('stmt_branch')}: ${escapeHtml(data.member.branch)}${data.member.branch === data.headquarters ? ' (HQ)' : ''}<br>
          ${t('stmt_generated')}: ${new Date(data.generated_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
        </div>
      </div>
      <div class="section-title">${t('stmt_accounts')}</div>
      <table><thead><tr><th>${t('stmt_account')}</th><th>${t('stmt_type')}</th><th style="text-align:right">${t('balance')}</th></tr></thead>
        <tbody>${accountsSummary}</tbody></table>
      <div class="section-title">${t('stmt_transactions')}</div>
      <table><thead><tr><th>${t('tx_date')}</th><th>${t('tx_description')}</th><th>${t('stmt_account')}</th><th style="text-align:right">${t('tx_amount')}</th><th style="text-align:right">${t('tx_balance')}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">${t('no_tx')}</td></tr>`}</tbody></table>
      ${data.verification ? `<div class="section-title">${t('stmt_verify_heading')}</div>
      <div style="font-size:10.5px;color:#444;border:1px solid #DCE4E0;border-radius:6px;padding:10px 12px;">
        <div style="margin-bottom:4px">${t('stmt_verify_line')}</div>
        <div><strong>${t('stmt_verify_code')}:</strong> <span style="font-family:monospace;font-size:12px">${escapeHtml(data.verification.code)}</span></div>
        <div style="margin-top:2px"><strong>${t('stmt_verify_hash')}:</strong> <span style="font-family:monospace;word-break:break-all">${escapeHtml(data.verification.hash)}</span></div>
      </div>` : ''}
      <div class="foot">${t('stmt_footer')}</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  }

  if (loading) return <div className="loading">…</div>;
  if (!data) return <div className="empty">{t('no_tx')}</div>;

  const total = data.accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <div className="page-eyebrow">{t('stmt_eyebrow')}</div>
      <h1 className="page-title">{t('stmt_title')}</h1>
      <p className="page-intro">{t('stmt_intro')}</p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <LogoMark size={44} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{data.member.full_name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{data.member.email}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{t('stmt_branch')}: {data.member.branch}{data.member.branch === data.headquarters ? ' (HQ)' : ''}</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={downloadPdf}>{t('stmt_download')}</button>
        </div>
        <div className="muted mono" style={{ fontSize: 13, marginBottom: 12 }}>{t('total_balance')}: {money(total)}</div>

        <table className="tx-table">
          <thead>
            <tr>
              <th>{t('tx_date')}</th>
              <th>{t('tx_description')}</th>
              <th>{t('stmt_account')}</th>
              <th style={{ textAlign: 'right' }}>{t('tx_amount')}</th>
              <th style={{ textAlign: 'right' }}>{t('tx_balance')}</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length === 0 ? (
              <tr><td colSpan={5}><div className="empty">{t('no_tx')}</div></td></tr>
            ) : data.transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="tx-date">{formatDate(tx.created_at, lang)}</td>
                <td className="tx-desc">{tx.description || '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{tx.account_number}</td>
                <td className={`amt ${tx.amount >= 0 ? 'credit' : 'debit'}`}>{tx.amount >= 0 ? '+' : '−'} {money(Math.abs(tx.amount))}</td>
                <td className="amt">{money(tx.balance_after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
