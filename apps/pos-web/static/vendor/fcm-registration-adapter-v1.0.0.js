/*
 * KipusPay FCM browser registration adapter v1.0.0
 * SPDX-License-Identifier: Apache-2.0
 *
 * This zero-dependency adapter does not bundle or impersonate the Google SDK.
 * The caller must inject a real, configured FCM bootstrap implementation.
 */
export async function registerFcmWeb(bootstrap) {
  if (typeof bootstrap !== 'function') {
    throw new TypeError('A real caller-provided FCM bootstrap function is required');
  }
  const result = await bootstrap();
  if (!result || typeof result.token !== 'string' || !result.token.trim()) {
    throw new Error('FCM bootstrap did not return a provider token');
  }
  return { token: result.token, provider: 'FCM_HTTP_V1' };
}
