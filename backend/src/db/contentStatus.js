// Single source of truth for which landmark_content / local_recommendations
// statuses are safe to serve to the public app. 'pending' content must never
// leak here — it hasn't been through admin review yet.
export const PUBLIC_STATUSES = ['reviewed', 'published'];

export function isPubliclyVisible(status) {
  return PUBLIC_STATUSES.includes(status);
}
