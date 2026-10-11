const crypto = require("node:crypto");

class PaymentStore {
  constructor() {
    this.payments = new Map();
  }
  create(fields) {
    const payment = { id: `pay_${crypto.randomBytes(6).toString("hex")}`, status: "captured", ...fields };
    this.payments.set(payment.id, payment);
    return payment;
  }
  get(id) {
    return this.payments.get(id);
  }
  list() {
    return [...this.payments.values()];
  }
}

module.exports = { PaymentStore };
