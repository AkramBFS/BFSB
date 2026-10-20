import React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon } from '../Icons';

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef(function AccordionItem(
  { className = '', style, ...props },
  ref
) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={`rounded-[6px] border overflow-hidden transition-colors ${className}`}
      style={{
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--bd2)',
        ...style,
      }}
      {...props}
    />
  );
});

export const AccordionTrigger = React.forwardRef(function AccordionTrigger(
  { className = '', children, ...props },
  ref
) {
  return (
    <AccordionPrimitive.Header className="flex m-0">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={`group flex flex-1 items-start justify-between gap-3 px-3.5 py-3 text-left text-[13.5px] font-medium leading-snug transition-colors hover:bg-[var(--rz)] cursor-pointer outline-none ${className}`}
        style={{ color: 'var(--tx)' }}
        {...props}
      >
        <div className="flex-1 min-w-0">{children}</div>
        <ChevronDownIcon
          size={15}
          className="text-[var(--mu)] shrink-0 mt-0.5 transition-transform duration-150 group-data-[state=open]:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = React.forwardRef(function AccordionContent(
  { className = '', children, ...props },
  ref
) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={`border-t text-[13.5px] leading-relaxed overflow-hidden ${className}`}
      style={{
        borderColor: 'var(--bd)',
        backgroundColor: 'var(--pn)',
        color: 'var(--tx)',
      }}
      {...props}
    >
      <div className="px-3.5 py-3">{children}</div>
    </AccordionPrimitive.Content>
  );
});
