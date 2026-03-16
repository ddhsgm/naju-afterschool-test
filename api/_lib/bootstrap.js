const fs = require("fs");
const path = require("path");

let bootstrapCache = null;
let missingContactsCache = null;

function readJsonOnce(filename) {
  const fullPath = path.join(process.cwd(), filename);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function getBootstrapData() {
  if (!bootstrapCache) {
    bootstrapCache = readJsonOnce("bootstrap.json");
  }
  return bootstrapCache;
}

function getMissingContacts() {
  if (!missingContactsCache) {
    missingContactsCache = readJsonOnce("missing-contacts.json");
  }
  return missingContactsCache;
}

module.exports = {
  getBootstrapData,
  getMissingContacts,
};
