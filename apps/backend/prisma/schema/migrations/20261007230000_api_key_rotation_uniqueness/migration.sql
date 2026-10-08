-- One source API key can have at most one logical rotation successor.
CREATE UNIQUE INDEX "api_keys_rotatedFromId_key" ON "api_keys"("rotatedFromId");
