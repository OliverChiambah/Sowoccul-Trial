/**
 * Tiny schema validator — dependency-free.
 * ────────────────────────────────────────────────────────────────────────────
 * We can't pull in Zod/Joi in this environment, and for a codebase this size a
 * focused validator is easy to read and audit. It gives us one consistent way
 * to validate and COERCE incoming request bodies at the route edge, so no
 * handler has to hand-roll `if (!x) ...` checks again.
 *
 * A schema is an object mapping field name → rule. Each rule is built with the
 * `v` builder, e.g.:
 *
 *   const schema = {
 *     amount:   v.int().min(1),
 *     username: v.string().trim().lower().min(3).max(60),
 *     email:    v.string().email().optional(),
 *     terms:    v.bool(),
 *   };
 *
 * validate(schema, body) returns { ok, value, errors }:
 *   • ok:     boolean
 *   • value:  a NEW object with only the schema's fields, coerced/cleaned
 *   • errors: { field: message } (empty when ok)
 *
 * Unknown fields in the input are dropped (not echoed back), so a caller can't
 * smuggle extra columns through.
 */

class Rule {
  constructor(type) {
    this.type = type;
    this._optional = false;
    this._default = undefined;
    this._checks = [];
    // string transforms
    this._trim = false;
    this._lower = false;
    this._upper = false;
  }
  optional() { this._optional = true; return this; }
  default(val) { this._optional = true; this._default = val; return this; }

  // string transforms
  trim() { this._trim = true; return this; }
  lower() { this._lower = true; return this; }
  upper() { this._upper = true; return this; }

  min(n) {
    this._checks.push((val) => {
      if (this.type === 'string') return val.length >= n || `must be at least ${n} characters`;
      return Number(val) >= n || `must be at least ${n}`;
    });
    return this;
  }
  max(n) {
    this._checks.push((val) => {
      if (this.type === 'string') return val.length <= n || `must be at most ${n} characters`;
      return Number(val) <= n || `must be at most ${n}`;
    });
    return this;
  }
  email() {
    const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this._checks.push((val) => RE.test(val) || 'must be a valid email address');
    return this;
  }
  matches(re, message) {
    this._checks.push((val) => re.test(val) || (message || 'has an invalid format'));
    return this;
  }
  oneOf(list) {
    this._checks.push((val) => list.includes(val) || `must be one of: ${list.join(', ')}`);
    return this;
  }
  /** Custom predicate: fn(value) → true | errorMessage */
  custom(fn) { this._checks.push(fn); return this; }

  /**
   * Coerce a raw value to this rule's type. Returns { value } or { error }.
   * Absence is handled by validate(), not here.
   */
  coerce(raw) {
    let val = raw;

    if (this.type === 'string') {
      if (typeof val !== 'string') {
        if (val === null || val === undefined) return { error: 'is required' };
        val = String(val);
      }
      if (this._trim) val = val.trim();
      if (this._lower) val = val.toLowerCase();
      if (this._upper) val = val.toUpperCase();
    } else if (this.type === 'int') {
      const n = typeof val === 'number' ? val : Number(String(val).trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) return { error: 'must be a whole number' };
      val = n;
    } else if (this.type === 'number') {
      const n = typeof val === 'number' ? val : Number(String(val).trim());
      if (!Number.isFinite(n)) return { error: 'must be a number' };
      val = n;
    } else if (this.type === 'bool') {
      if (typeof val === 'boolean') { /* ok */ }
      else if (val === 'true' || val === 1 || val === '1') val = true;
      else if (val === 'false' || val === 0 || val === '0') val = false;
      else return { error: 'must be true or false' };
    } else if (this.type === 'any') {
      /* pass through */
    }

    for (const check of this._checks) {
      const result = check(val);
      if (result !== true) return { error: result };
    }
    return { value: val };
  }
}

export const v = {
  string: () => new Rule('string'),
  int: () => new Rule('int'),
  number: () => new Rule('number'),
  bool: () => new Rule('bool'),
  any: () => new Rule('any'),
};

/**
 * Validate a plain object against a schema.
 * @returns {{ ok: boolean, value: object, errors: Record<string,string> }}
 */
export function validate(schema, input) {
  const body = input && typeof input === 'object' ? input : {};
  const value = {};
  const errors = {};

  for (const [field, rule] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(body, field) &&
      body[field] !== undefined && body[field] !== null &&
      !(typeof body[field] === 'string' && body[field].trim() === '' && rule.type !== 'string');

    const rawEmpty = body[field] === undefined || body[field] === null ||
      (typeof body[field] === 'string' && body[field].trim() === '');

    if (rawEmpty) {
      if (rule._optional) {
        if (rule._default !== undefined) value[field] = rule._default;
        continue;
      }
      errors[field] = 'is required';
      continue;
    }

    const out = rule.coerce(body[field]);
    if (out.error) errors[field] = out.error;
    else value[field] = out.value;
  }

  return { ok: Object.keys(errors).length === 0, value, errors };
}

/**
 * Express middleware: validate req.body against schema. On success, replaces
 * req.body with the cleaned/coerced value and calls next(). On failure, sends
 * 400 with a field→message map.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { ok, value, errors } = validate(schema, req.body);
    if (!ok) {
      return res.status(400).json({
        error: 'Please check the highlighted fields.',
        fields: errors,
      });
    }
    req.body = value;
    next();
  };
}
