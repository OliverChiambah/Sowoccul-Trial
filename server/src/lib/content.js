import { db } from '../db/index.js';

/**
 * Default website content, used the first time the app runs (before an admin
 * has edited anything). Admins change all of this from the console; nothing
 * here needs to be edited in code.
 */
export const DEFAULT_CONTENT = {
  login: {
    heading: 'Welcome back',
    subheading: 'Sign in to your SOWOCCUL account to manage your savings and loans.',
    username_label: 'Username',
    password_label: 'Password',
    button: 'Sign in',
    side_title: 'Your cooperative, in your pocket',
    side_text: 'Check balances, move money between accounts, apply for loans and track repayments — securely, in English or French.',
    join_prompt: 'New here?',
    join_link: 'Become a member',
  },
  register: {
    heading: 'Become a member',
    subheading: 'Open your SOWOCCUL account. Membership is open to the public — save regularly, borrow wisely, repay promptly.',
    side_title: 'Why join SOWOCCUL?',
    side_text: 'A member-owned cooperative licensed as a microfinance institution. Fair credit, reliable savings, and Deductions at Source plus Express Savings.',
    button: 'Submit application',
    login_prompt: 'Already a member?',
    login_link: 'Sign in',
  },
  landing: {
    hero_eyebrow: 'Serving our cooperators since 1995',
    hero_title_1: 'Save regularly.',
    hero_title_2: 'Borrow wisely.',
    hero_title_3: 'Repay promptly.',
    hero_lede: 'Sonel Workers Credit Union (SOWOCCUL) is a member-owned microfinance cooperative — now open to investors and cooperators from the public, not just SONEL staff. We help you save with confidence and access fair, affordable credit through Deductions at Source plus Express Savings.',
    hero_cta_primary: 'Open an account',
    hero_cta_secondary: 'Member login',
    hero_trust: [
      { num: '30 yrs', lbl: 'Serving cooperators since 1995' },
      { num: 'Licensed MFI', lbl: 'COBAC · MINFI · CEMAC · NCC' },
      { num: '6', lbl: 'Branches · HQ in Limbe' },
    ],
    // Ids of uploaded images to rotate in the hero. Empty = use built-in scenes.
    hero_images: [],

    // Services section
    services_eyebrow: 'What we offer',
    services_title: 'Products and services for every cooperator',
    services_sub: 'From everyday savings to loans that move your life forward — plus Express Savings and deductions at source — all in one cooperative you own together.',
    services: [
      { title: 'Savings accounts', body: 'Grow your money safely with regular savings and share capital. Deductions at source make saving effortless, month after month.' },
      { title: 'Express Savings', body: 'Save and access your money faster with Express Savings — flexible deposits and quick availability when you need them.' },
      { title: 'Affordable loans', body: 'Borrow for education, housing, business, health and more — with clear terms, fair rates and a repayment plan that fits your income.' },
      { title: 'Instant transfers', body: 'Move money between your savings and share accounts in seconds, any time, from any device.' },
      { title: 'Loan balance tracking', body: 'See exactly what you owe, how much you’ve repaid and what’s left — updated the moment a repayment is posted.' },
      { title: 'Digital applications', body: 'Apply for a loan online in six simple steps, in English or French, and track your application from submission to decision.' },
    ],

    // About section
    about_eyebrow: 'About SOWOCCUL',
    about_title: 'A cooperative owned by the cooperators it serves',
    about_p1: 'Founded in 1995, Sonel Workers Credit Union was created to give people a trusted place to save and a fair source of credit. Membership is no longer limited to SONEL staff — we are now open to investors and cooperators from the public. As a licensed microfinance institution regulated under COBAC, MINFI, CEMAC and the NCC, the members are the owners, and every product and service exists to strengthen their financial wellbeing.',
    about_p2: 'With Deductions at Source plus Express Savings, saving and repaying happens automatically and reliably — so you build wealth and clear credit without the stress of remembering to pay.',
    motto: 'The energy and satisfaction of our members is our main priority.',

    // Why-join section
    why_eyebrow: 'Why join us',
    why_title: 'Banking that works for working people',
    why_items: [
      { title: 'Safe & regulated', body: 'A licensed MFI under COBAC, MINFI, CEMAC and NCC, with your savings handled under sound cooperative governance.' },
      { title: 'Open to all', body: 'No longer limited to SONEL staff — investors and cooperators from the public are welcome to join.' },
      { title: 'Fair credit', body: 'Loans priced fairly, assessed on your real capacity, with terms you can actually repay.' },
      { title: 'Effortless saving', body: 'Deductions at source plus Express Savings mean you save and repay automatically.' },
    ],

    // Stats band
    stats: [
      { n: '1995', l: 'Serving cooperators since' },
      { n: '6', l: 'Branches · HQ in Limbe' },
      { n: 'MFI', l: 'COBAC · MINFI · CEMAC · NCC' },
      { n: 'EN / FR', l: 'Bilingual service' },
    ],

    // Call-to-action band
    cta_title: 'Ready to save and borrow with confidence?',
    cta_text: 'Join the cooperators who trust SOWOCCUL with their savings and their goals. Choose the branch closest to you and open an account in minutes.',
    cta_primary: 'Become a member',
    cta_secondary: 'Member login',
  },
  team: {
    president: { name: '', role: 'President, Board of Directors', photo: '' },
    gm: { name: '', role: 'General Manager', photo: '' },
    managers: [
      { name: '', role: 'Branch Manager', branch: 'Limbe (HQ)', photo: '' },
      { name: '', role: 'Branch Manager', branch: 'Bamenda', photo: '' },
      { name: '', role: 'Branch Manager', branch: 'Douala', photo: '' },
      { name: '', role: 'Branch Manager', branch: 'Bafoussam', photo: '' },
      { name: '', role: 'Branch Manager', branch: 'Ebolowa', photo: '' },
      { name: '', role: 'Branch Manager', branch: 'Yaoundé', photo: '' },
    ],
  },
  careers: {
    email: 'careers@sowoccul.cm',
    openings: [
      { title: 'Credit Officer', branch: 'Douala', type: 'Full-time', body: 'Assess loan applications, guide members through the process, and manage a portfolio of credit files.' },
      { title: 'Customer Service Officer', branch: 'Bamenda', type: 'Full-time', body: 'Be the friendly first point of contact for members — accounts, deposits, and everyday support.' },
      { title: 'Finance & Accounting Intern', branch: 'Limbe (HQ)', type: 'Internship', body: 'Support the finance team with reconciliations, reporting, and month-end close. Great for a recent graduate.' },
    ],
  },
  contact: {
    address: 'Limbe, South-West Region, Cameroon',
    phone: '+237 600 000 000',
    email: 'members@sowoccul.cm',
    hours: 'Mon–Fri, 8am–5pm',
  },
  privacy: {
    updated: '2026-01-01',
    title_en: 'Privacy Policy',
    title_fr: 'Politique de confidentialité',
    body_en: `SONEL Workers Credit Union (SOWOCCUL) respects your privacy and is committed to protecting the personal information you entrust to us.

What we collect. When you become a member or use our services we collect the information you provide — your name, date and place of birth, national ID or NIU number, contact details, employer and salary information, next of kin, your signature, and copies of identity documents — together with records of your accounts, deposits, withdrawals, loans and repayments.

Why we collect it. We use your information to open and operate your accounts, assess and manage loans, meet our legal and regulatory obligations as a licensed microfinance institution (COBAC, MINFI, CEMAC, NCC), prevent fraud, and contact you about your membership.

How we protect it. Access to member records is restricted to authorised staff on a need-to-know basis, scoped to your branch. Sensitive actions on your records are logged. We keep your information only as long as the law and sound record-keeping require.

Who we share it with. We do not sell your data. We share it only where required by law or regulation, or with service providers acting on our behalf under confidentiality obligations.

Your rights. You may ask to see the information we hold about you, and ask us to correct anything that is wrong. You can update your contact details yourself in the app, and request corrections to other details for our staff to review.

Contact. For any privacy question, contact us at the address, phone or email shown on our Contact page.`,
    body_fr: `La Coopérative des Travailleurs SONEL (SOWOCCUL) respecte votre vie privée et s'engage à protéger les renseignements personnels que vous nous confiez.

Ce que nous collectons. Lorsque vous devenez membre ou utilisez nos services, nous recueillons les informations que vous fournissez — nom, date et lieu de naissance, numéro de CNI ou NIU, coordonnées, employeur et salaire, personne à prévenir, signature et copies de pièces d'identité — ainsi que l'historique de vos comptes, dépôts, retraits, prêts et remboursements.

Pourquoi. Nous utilisons vos informations pour ouvrir et gérer vos comptes, évaluer et gérer les prêts, respecter nos obligations légales et réglementaires en tant qu'établissement de microfinance agréé (COBAC, MINFI, CEMAC, NCC), prévenir la fraude et vous contacter au sujet de votre adhésion.

Comment nous les protégeons. L'accès aux dossiers des membres est limité au personnel autorisé selon le principe du besoin d'en connaître, restreint à votre agence. Les actions sensibles sont journalisées. Nous conservons vos informations aussi longtemps que la loi et une bonne tenue des dossiers l'exigent.

Avec qui nous les partageons. Nous ne vendons pas vos données. Nous ne les partageons que si la loi ou la réglementation l'exige, ou avec des prestataires agissant pour notre compte sous obligation de confidentialité.

Vos droits. Vous pouvez demander à consulter les informations que nous détenons sur vous et demander la correction de toute erreur. Vous pouvez mettre à jour vos coordonnées vous-même dans l'application et demander la correction des autres informations, que notre personnel examinera.

Contact. Pour toute question, contactez-nous à l'adresse, au téléphone ou à l'e-mail indiqués sur notre page Contact.`,
  },
  terms: {
    updated: '2026-01-01',
    title_en: 'Terms of Service',
    title_fr: 'Conditions d\u2019utilisation',
    body_en: `These terms govern your use of the SONEL Workers Credit Union (SOWOCCUL) online services.

Membership. Membership is open and subject to our by-laws and to verification of the information you provide. You are responsible for keeping your login details secret and for activity on your account.

Your accounts. You agree that the balances and records shown reflect our books and that entries are subject to review and correction. Deposits, withdrawals, loans and repayments are governed by our operating rules and applicable law.

Loans. Loan applications are assessed at our discretion. Approved loans are subject to the terms, deductions and repayment schedule communicated to you. "Deductions at source" apply where agreed with your employer.

Acceptable use. You agree to use these services lawfully, to provide accurate information, and not to attempt to access records that are not yours.

Availability. We aim to keep the service available but do not guarantee uninterrupted access. We may update these terms; material changes will be posted here.

Governing law. These terms are governed by the laws of Cameroon and the regulations applicable to licensed microfinance institutions.

Contact. Questions about these terms can be sent to the address, phone or email on our Contact page.`,
    body_fr: `Ces conditions régissent votre utilisation des services en ligne de la Coopérative des Travailleurs SONEL (SOWOCCUL).

Adhésion. L'adhésion est ouverte et soumise à nos statuts et à la vérification des informations fournies. Vous êtes responsable de la confidentialité de vos identifiants et de l'activité sur votre compte.

Vos comptes. Vous convenez que les soldes et écritures affichés reflètent nos livres et que les écritures peuvent faire l'objet de vérification et de correction. Les dépôts, retraits, prêts et remboursements sont régis par nos règles de fonctionnement et la loi applicable.

Prêts. Les demandes de prêt sont évaluées à notre discrétion. Les prêts approuvés sont soumis aux conditions, prélèvements et échéancier qui vous sont communiqués. Le « prélèvement à la source » s'applique lorsqu'il est convenu avec votre employeur.

Utilisation acceptable. Vous vous engagez à utiliser ces services de manière licite, à fournir des informations exactes et à ne pas tenter d'accéder à des dossiers qui ne sont pas les vôtres.

Disponibilité. Nous nous efforçons de maintenir le service disponible sans en garantir un accès ininterrompu. Nous pouvons mettre à jour ces conditions ; les changements importants seront publiés ici.

Droit applicable. Ces conditions sont régies par les lois du Cameroun et la réglementation applicable aux établissements de microfinance agréés.

Contact. Les questions peuvent être adressées à l'adresse, au téléphone ou à l'e-mail figurant sur notre page Contact.`,
  },
};

/** Returns the stored content for a section, or the default if none saved yet. */
export async function getContent(section) {
  const row = await db.one('SELECT data FROM site_content WHERE section = $1', [section]);
  if (!row) return DEFAULT_CONTENT[section] ?? null;
  try {
    return JSON.parse(row.data);
  } catch {
    return DEFAULT_CONTENT[section] ?? null;
  }
}

/** Saves (inserts or replaces) the content for a section. */
export async function setContent(section, data, userId) {
  await db.run(`
    INSERT INTO site_content (section, data, updated_by, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (section) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = now()
  `, [section, JSON.stringify(data), userId ?? null]);
  return getContent(section);
}
