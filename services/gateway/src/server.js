const { Shipper } = require("shoplite-obs");
const { createApp } = require("./app");

const shipper = new Shipper({
  url: process.env.CAUSALDEPLOY_URL,
  apiKey: process.env.CAUSALDEPLOY_API_KEY,
  repo: process.env.GITHUB_REPOSITORY || "yashchandnani07/shoplite",
  service: "gateway",
  env: process.env.DEPLOY_ENV || "prod",
});
const port = Number(process.env.PORT || 4001);
createApp({ ordersUrl: process.env.ORDERS_URL, paymentsUrl: process.env.PAYMENTS_URL, shipper }).listen(
  port,
  () => console.log(`gateway listening on ${port}`),
);
