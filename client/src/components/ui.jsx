import { useLang } from '../lib/i18n.jsx';

/** Coloured status badge for loan applications. */
export function StatusPill({ status }) {
  const { t } = useLang();
  const labels = {
    pending: t('st_pending'),
    under_review: t('st_under_review'),
    approved: t('st_approved'),
    rejected: t('st_rejected'),
  };
  return <span className={`pill-status status-${status}`}>{labels[status] || status}</span>;
}

/** Localised account type label. */
export function useAccountLabel() {
  const { t } = useLang();
  return (type) => ({
    savings: t('account_savings'),
    current: t('account_current'),
    shares: t('account_shares'),
  }[type] || type);
}

export function Loading() {
  return <div className="loading">…</div>;
}
