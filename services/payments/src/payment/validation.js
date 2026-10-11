const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];

function validatePayment(payment) {
  const errors = [];
  if (!payment || typeof payment !== "object") return { valid: false, errors: ["body required"] };
  if (!payment.orderId) errors.push("orderId required");
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) errors.push("amount must be > 0");
  if (!SUPPORTED_CURRENCIES.includes(payment.currency)) errors.push("unsupported currency");
  if (!payment.method || !["card", "wallet"].includes(payment.method.type)) {
    errors.push("method.type must be card or wallet");
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validatePayment, SUPPORTED_CURRENCIES };
