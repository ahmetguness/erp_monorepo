interface FailedRequest {
  method(): string;
  failure(): { errorText: string } | null;
}

// Reload and history navigation cancel in-flight reads. Connection failures
// and all failed mutations must still fail the network assertions.
export function isCancelledReadRequest(request: FailedRequest): boolean {
  return request.method() === 'GET'
    && /ERR_ABORTED|NS_BINDING_ABORTED|NS_ERROR_ABORT/.test(request.failure()?.errorText ?? '');
}
