// Job titles for staff accounts. These are mostly *labels*: edit rights are
// granted per-person by the admin. The only title that carries built-in power
// is Branch Manager, which is always an editor and is the guaranteed editor
// slot for its branch. General Manager maps to the institution-wide manager.

export const TITLES = {
  general_manager: { label: 'General Manager', role: 'manager' },
  branch_manager: { label: 'Branch Manager', role: 'staff', alwaysEditor: true },
  loans_officer: { label: 'Loans Officer', role: 'staff' },
  cashier: { label: 'Cashier', role: 'staff' },
  intern: { label: 'Intern', role: 'staff' },
};

export const TITLE_KEYS = Object.keys(TITLES);

/** The role a given title maps to ('manager' for GM, otherwise 'staff'). */
export function roleForTitle(title) {
  return TITLES[title]?.role || 'staff';
}

/** Is this title always an editor (Branch Manager)? */
export function isAlwaysEditor(title) {
  return !!TITLES[title]?.alwaysEditor;
}

/** Human label for a title key. */
export function titleLabel(title) {
  return TITLES[title]?.label || title || '';
}
