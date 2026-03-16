const { getBootstrapData } = require("./_lib/bootstrap");
const { sendJson, methodNotAllowed } = require("./_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }
  return sendJson(res, 200, getBootstrapData());
};
