import React from 'react';
import { fn } from 'storybook/test';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from './Button';
import '@/app/index.css';

export default {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'accent'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
  args: { onClick: fn() },
};

export const Primary = {
  args: { variant: 'primary', children: 'Find My Match' },
};

export const Secondary = {
  args: { variant: 'secondary', children: 'Random Pick' },
};

export const Outline = {
  args: { variant: 'outline', children: 'Clear Filters' },
};

export const Ghost = {
  args: { variant: 'ghost', children: 'Refresh' },
};

export const WithIconLeft = {
  args: {
    variant: 'primary',
    children: 'Find My Match',
    icon: <Sparkles size={18} />,
  },
};

export const Loading = {
  args: {
    variant: 'primary',
    children: 'Finding...',
    icon: <Loader2 size={18} className="animate-spin" />,
    disabled: true,
  },
};

export const FullWidth = {
  args: {
    variant: 'primary',
    children: 'Find My Match',
    icon: <Sparkles size={18} />,
    fullWidth: true,
  },
  parameters: { layout: 'padded' },
};

export const Small = {
  args: { variant: 'secondary', size: 'sm', children: 'Filter' },
};

export const Large = {
  args: { variant: 'primary', size: 'lg', children: 'Get Started' },
};

export const Disabled = {
  args: { variant: 'primary', children: 'Unavailable', disabled: true },
};
