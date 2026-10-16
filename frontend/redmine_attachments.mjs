export const ATTACHMENTS_INPUT = '.attachments_form input[type="file"][name^="attachments["]';

export function attachmentsTarget(element) {
  if (!element?.closest) return null;
  const host = element.closest('[data-redmine-attachments]');
  if (host) return host;
  const form = element.closest('form');
  return form && form.querySelector(ATTACHMENTS_INPUT) ? form : null;
}
