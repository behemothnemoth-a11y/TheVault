export function createId(prefix = "id") {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
}

export function isVaultId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value);
}
