import type { Instrumentation } from 'next';
/** Safe application server errors. Never serialize Next's error/request object. */
export const onRequestError: Instrumentation.onRequestError = (_error, request, context) => {
  try {
    const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method) ? request.method : 'OTHER';
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'axon-web', operation: 'next.request', errorCode: 'WEB_SERVER_ERROR', result: 'failure', method, routerKind: context.routerKind, routeType: context.routeType }));
  }
  catch { /* Diagnostic output must not replace the application's error response. */ }
};
