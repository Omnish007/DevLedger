import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a contact name.').max(160, 'Names must be 160 characters or fewer.'),
  role: z.string().trim().min(1, 'Choose a role.').max(64, 'Role is too long.'),
  company: z.string().trim().max(160, 'Company names must be 160 characters or fewer.'),
  email: z.string().trim().max(254, 'Email is too long.').refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.'),
  phone: z.string().trim().max(80, 'Phone numbers must be 80 characters or fewer.'),
  notes: z.string().max(10_000, 'Contact notes must be 10,000 characters or fewer.'),
  projectId: z.string(),
  customAttributes: z.array(z.object({
    key: z.string().trim().max(40, 'Field names must be 40 characters or fewer.'),
    value: z.string().trim().max(500, 'Values must be 500 characters or fewer.'),
  })).max(20, 'Contacts can have at most 20 custom attributes.'),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.customAttributes.forEach((attribute, index) => {
    if (!attribute.key && !attribute.value) return;
    if (!attribute.key || !attribute.value) {
      context.addIssue({ code: 'custom', path: ['customAttributes', index, !attribute.key ? 'key' : 'value'], message: 'Enter both a field name and its value.' });
    }
    const normalized = attribute.key.toLocaleLowerCase();
    if (normalized && seen.has(normalized)) {
      context.addIssue({ code: 'custom', path: ['customAttributes', index, 'key'], message: 'Custom field names must be unique.' });
    }
    if (normalized) seen.add(normalized);
  });
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export const emptyContactForm: ContactFormValues = {
  name: '', role: 'client', company: '', email: '', phone: '', notes: '', projectId: '', customAttributes: [],
};
