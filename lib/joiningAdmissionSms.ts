/**
 * System SMS template for joining desk: must match `message_templates.name` seeded by
 * `backend-admission/sql/migrations/20260502_joining_online_admission_sms_template.sql`.
 * DLT/CTA: whitelist the static URL through the query marker, e.g.
 * `https://YOUR_HOST/joining/public?t=` then `{#var#}` (variable = token only). Legacy `/joining/public/:token` still works.
 */
export const JOINING_ONLINE_ADMISSION_TEMPLATE_NAME = 'Joining · online admission link' as const;
