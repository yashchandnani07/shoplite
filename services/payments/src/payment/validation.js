const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];
const METHOD_TYPES = ["card", "wallet"];

function validateAmount(payment) {
  return Number.isFinite(payment.amount) && payment.amount > 0 ? [] : ["amount must be > 0"];
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
