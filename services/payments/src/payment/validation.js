const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];
const METHOD_TYPES = ["card", "wallet"];

// Upper bound for a single payment (fraud guard).
const MAX_AMOUNT = 30000;

function validateAmount(payment) {
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) return ["amount must be > 0"];
  if (payment.amount > MAX_AMOUNT) return ["amount exceeds limit"];
  return [];
}

function validateCurrency(payment) {
  return SUPPORTED_CURRENCIES.includes(payment.currency) ? [] : ["unsupported currency"];
}

function validateMethod(payment) {
  return payment.method && METHOD_TYPES.includes(payment.method.type)
    ? []
    : ["method.type must be card or wallet"];
}

function validatePayment(payment) {
  if (!payment || typeof payment !== "object") return { valid: false, errors: ["body required"] };
  const errors = [];
  if (!payment.orderId) errors.push("orderId required");
  errors.push(...validateAmount(payment), ...validateCurrency(payment), ...validateMethod(payment));
  return { valid: errors.length === 0, errors };
}

module.exports = { validatePayment, validateAmount, SUPPORTED_CURRENCIES };
