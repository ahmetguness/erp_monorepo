import { describe, expect, it } from 'vitest';
import { isCancelledReadRequest } from '../e2e/fixtures/network-failures';

describe('browser network failure classification', () => {
  it.each(['net::ERR_ABORTED', 'NS_BINDING_ABORTED', 'NS_ERROR_ABORT'])('recognizes cancelled GET: %s', (errorText) => {
    expect(isCancelledReadRequest({ method: () => 'GET', failure: () => ({ errorText }) })).toBe(true);
  });
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('preserves failed %s mutations', (method) => {
    expect(isCancelledReadRequest({ method: () => method, failure: () => ({ errorText: 'net::ERR_ABORTED' }) })).toBe(false);
  });
  it.each(['net::ERR_CONNECTION_REFUSED', 'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_FAILED'])('preserves GET network failures: %s', (errorText) => {
    expect(isCancelledReadRequest({ method: () => 'GET', failure: () => ({ errorText }) })).toBe(false);
  });
});
