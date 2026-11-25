import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Combobox, type ComboboxOption } from './combobox';

const options: ComboboxOption[] = [{ value: 'retail', label: 'Retail POS', description: 'Greenfield project' }, { value: 'portal', label: 'Client portal', description: 'Ongoing project' }, { value: 'mobile', label: 'Mobile app', description: 'Ongoing project' }];
const meta = { title: 'Forms/Combobox', component: Combobox } satisfies Meta<typeof Combobox>;
export default meta;
type Story = StoryObj;
function ProjectSelectorDemo() { const [value, setValue] = useState('retail'); return <div className="w-72"><Combobox options={options} value={value} onValueChange={setValue} placeholder="Choose a project"/></div>; }
export const ProjectSelector: Story = { render: () => <ProjectSelectorDemo /> };
