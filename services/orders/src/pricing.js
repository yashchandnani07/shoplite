const { toCents, addCents, applyTax } = require("money-utils");
const { byId } = require("./catalog");

const TAX_RATE = 0.08;

function priceOrder(items) {
  const lines = items.map((item) => {
    const product = byId(item.productId);
    if (!product) {
      const err = new Error(`unknown product ${item.productId}`);
      err.status = 400;
      err.expose = true;
      throw err;
    }
    return { productId: product.id, quantity: item.quantity, cents: toCents(product.price) * item.quantity };
  });
  const subtotal = addCents(...lines.map((l) => l.cents));
  return { lines, subtotalCents: subtotal, totalCents: applyTax(subtotal, TAX_RATE) };
}

module.exports = { priceOrder, TAX_RATE };
