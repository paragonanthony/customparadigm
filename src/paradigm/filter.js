// Builds the `filter` query string used by Paradigm list endpoints, e.g.
//   StrCompanyName Contains Lumber and StrBillToAddress IsNotNull

export const Op = Object.freeze({
  Equals: 'Equals',
  NotEquals: 'NotEquals',
  Between: 'Between',
  In: 'In',
  NotIn: 'NotIn',
  GreaterThan: 'GreaterThan',
  LessThan: 'LessThan',
  // Paradigm's documented spelling is "GreatherThanOrEqualTo".
  GreaterThanOrEqualTo: 'GreatherThanOrEqualTo',
  LessThanOrEqualTo: 'LessThanOrEqualTo',
  StartsWith: 'StartsWith',
  EndsWith: 'EndsWith',
  Contains: 'Contains',
  Like: 'Like',
  IsNull: 'IsNull',
  IsNotNull: 'IsNotNull',
  IsNullOrEmptyString: 'IsNullOrEmptyString',
  IsNotNullOrEmptyString: 'IsNotNullOrEmptyString',
  IsNullOr0: 'IsNullOr0',
  IsNotNullOr0: 'IsNotNullOr0',
});

const UNARY = new Set([
  Op.IsNull, Op.IsNotNull,
  Op.IsNullOrEmptyString, Op.IsNotNullOrEmptyString,
  Op.IsNullOr0, Op.IsNotNullOr0,
]);
const VALID = new Set(Object.values(Op));
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * Turn a list of conditions into a Paradigm filter string.
 * Each condition is [field, op] for unary ops or [field, op, value].
 * An array value (for In, NotIn, Between) is joined with commas.
 * TODO: confirm the multi-value separator in the Swagger docs.
 */
export function buildFilter(conditions) {
  return conditions.map(([field, op, value]) => {
    if (!FIELD_RE.test(field)) throw new Error(`Invalid filter field: ${field}`);
    if (!VALID.has(op)) throw new Error(`Unknown filter operator: ${op}`);
    if (UNARY.has(op)) return `${field} ${op}`;
    if (value === undefined || value === null) throw new Error(`Operator ${op} needs a value`);
    const v = Array.isArray(value) ? value.join(',') : String(value);
    return `${field} ${op} ${v}`;
  }).join(' and ');
}
