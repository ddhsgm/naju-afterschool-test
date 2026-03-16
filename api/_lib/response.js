function sendJson(res, status, payload, extraHeaders = {}) {
  Object.entries(extraHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.status(status).json(payload);
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { error: "허용되지 않은 메서드입니다." });
}

function readBody(req) {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }
  if (!req.body) {
    return {};
  }
  try {
    return JSON.parse(req.body);
  } catch (error) {
    return {};
  }
}

module.exports = {
  sendJson,
  methodNotAllowed,
  readBody,
};
