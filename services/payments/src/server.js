const { Shipper } = require("shoplite-obs");
const { createApp } = require("./app");

const shipper = new Shipper({
  url: process.env.CAUSALDEPLOY_URL,
  apiKey: process.env.CAUSALDEPLOY_API_KEY,
  repo: process.env.GITHUB_REPOSITORY || "yashchandnani07/shoplite",
  service: "payments",
  env: process.env.DEPLOY_ENV || "prod",
});
const port = Number(process.env.PORT || 4003);
createApp({ shipper }).listen(port, () => console.log(`payments listening on ${port}`));
