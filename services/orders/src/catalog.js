const PRODUCTS = [
  { id: "p1", name: "Mechanical Keyboard", price: 89.99 },
  { id: "p2", name: "USB-C Hub", price: 34.5 },
  { id: "p3", name: "27in Monitor", price: 249.0 },
  { id: "p4", name: "Webcam", price: 59.95 },
];

const byId = (id) => PRODUCTS.find((p) => p.id === id);

module.exports = { PRODUCTS, byId };
