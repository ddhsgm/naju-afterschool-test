function getBootstrapData() {
  return require("../../bootstrap.json");
}

function getMissingContacts() {
  return require("../../missing-contacts.json");
}

module.exports = {
  getBootstrapData,
  getMissingContacts,
};
