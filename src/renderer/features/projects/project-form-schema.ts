import { z } from 'zod';

export const projectFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Enter a project name.')
        .max(160, 'Project names must be 160 characters or fewer.'),
    description: z.string().trim().max(10_000, 'Descriptions must be 10,000 characters or fewer.'),
    type: z.enum(['greenfield', 'ongoing']),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export const emptyProjectForm: ProjectFormValues = { name: '', description: '', type: 'greenfield' };
