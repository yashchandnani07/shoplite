// Money is handled as integer minor units (cents) everywhere except at the edges
// (request bodies carry decimal amounts).

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function formatMoney(cents, currency = "USD") {
  return `${fromCents(cents).toFixed(2)} ${currency}`;
}

function addCents(...values) {
  return values.reduce((sum, v) => sum + v, 0);
}

function applyTax(cents, rate) {
  return Math.round(cents * (1 + rate));
}

// Split an amount into n parts without losing a cent (remainder goes to the first parts).
function splitCents(cents, parts) {
  const base = Math.floor(cents / parts);
  const rest = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

module.exports = { toCents, fromCents, formatMoney, addCents, applyTax, splitCents };
