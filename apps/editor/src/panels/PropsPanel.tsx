/**
 * PropsPanel — schema-driven smart-component editor (P06 WS-COM-2 #1).
 * Renders a control per props-schema property (JSON Schema draft 2020-12
 * + `x-domio-prop` hints) and emits CRDT ops for every change.
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ComponentLayer } from '@domio/schema';
import { getComponent } from '@domio/components';
import {
  inferControl,
  resolveSchemaDefaults,
  type PropControlDescriptor,
  type PropSchemaFragment,
} from '@domio/schema-prop';

const FONTS = ['Inter', 'Georgia', 'Menlo', 'Arial', 'Courier New'];

interface PropsPanelProps {
  element: ComponentLayer;
  onPropEdit: (key: string, from: unknown, to: unknown) => void;
  onVariantChange: (from: string, to: string) => void;
}

export function PropsPanel({ element, onPropEdit, onVariantChange }: PropsPanelProps): ReactElement {
  const def = getComponent(element.component.catalogId);
  const props = element.component.props ?? {};
  const variant = element.component.variant ?? def?.defaultVariant ?? 'light';

  if (!def) {
    return (
      <section className="props-panel">
        <div className="props-panel__empty">Unknown component {element.component.catalogId}</div>
      </section>
    );
  }

  const schema = def.propsSchema;
  const descriptors = useMemo(() => {
    const out: Array<{ key: string; fragment: PropSchemaFragment; descriptor: PropControlDescriptor; required: boolean }> = [];
    const required = new Set(schema.required ?? []);
    for (const [key, fragment] of Object.entries(schema.properties ?? {})) {
      out.push({
        key,
        fragment,
        descriptor: inferControl(key, fragment),
        required: required.has(key),
      });
    }
    // Required first, then schema order.
    return out.sort((a, b) => Number(b.required) - Number(a.required));
  }, [schema]);

  const commit = useCallback(
    (key: string, fragment: PropSchemaFragment, next: unknown) => {
      const from = props[key] ?? fragment.default ?? null;
      onPropEdit(key, from, next);
    },
    [props, onPropEdit],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof descriptors>();
    for (const d of descriptors) {
      const category = d.descriptor.category ?? 'Content';
      const list = map.get(category) ?? [];
      list.push(d);
      map.set(category, list);
    }
    return [...map.entries()];
  }, [descriptors]);

  return (
    <section className="props-panel" data-testid="props-panel">
      <header className="props-panel__header">
        <div className="props-panel__title">{def.name}</div>
        <div className="props-panel__sub">{def.catalogId} · v{def.version}</div>
      </header>

      {def.variants.length > 1 ? (
        <div className="props-panel__section">
          <div className="props-panel__label">Variant</div>
          <div className="prop-control prop-control--segmented" role="group" aria-label="Variant">
            {def.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`prop-control__seg ${variant === v.id ? 'is-active' : ''}`}
                onClick={() => {
                  if (variant !== v.id) onVariantChange(variant, v.id);
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {groups.map(([category, items]) => (
        <div key={category} className="props-panel__section">
          <div className="props-panel__category">{category}</div>
          {items.map(({ key, fragment, descriptor, required }) => (
            <div key={key} className="prop-field">
              <label className="prop-field__label" htmlFor={`prop-${key}`}>
                {fragment.title ?? key}
                {required ? <span className="prop-field__required"> *</span> : null}
              </label>
              <FragmentEditor
                id={`prop-${key}`}
                label={fragment.title ?? key}
                fragment={fragment}
                descriptor={descriptor}
                value={props[key] ?? fragment.default}
                onChange={(next) => commit(key, fragment, next)}
              />
              {fragment.description ? <div className="prop-field__hint">{fragment.description}</div> : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

interface FragmentEditorProps {
  id: string;
  label: string;
  fragment: PropSchemaFragment;
  descriptor: PropControlDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
}

function FragmentEditorInner({ id, label, fragment, descriptor, value, onChange }: FragmentEditorProps): ReactElement {
  switch (descriptor.kind) {
    case 'text':
      return (
        <input
          id={id}
          type="text"
          className="prop-control prop-control--input"
          value={typeof value === 'string' ? value : ''}
          placeholder={descriptor.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim())}
        />
      );
    case 'textarea':
      return (
        <textarea
          id={id}
          className="prop-control prop-control--input prop-control--textarea"
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={descriptor.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim())}
        />
      );
    case 'number':
    case 'stepper': {
      const num = typeof value === 'number' ? value : Number(fragment.default ?? 0);
      return (
        <div className="prop-control prop-control--stepper">
          <button type="button" aria-label="Decrease" onClick={() => onChange(clamp(num - (descriptor.step ?? 1), descriptor))}>
            −
          </button>
          <input
            id={id}
            type="number"
            className="prop-control--input"
            value={num}
            min={descriptor.min}
            max={descriptor.max}
            step={descriptor.step ?? 1}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (!Number.isNaN(parsed)) onChange(clamp(parsed, descriptor));
            }}
            onBlur={(e) => {
              const parsed = Number(e.target.value);
              if (!Number.isNaN(parsed)) onChange(clamp(parsed, descriptor));
            }}
          />
          <button type="button" aria-label="Increase" onClick={() => onChange(clamp(num + (descriptor.step ?? 1), descriptor))}>
            +
          </button>
          {descriptor.unit ? <span className="prop-control__unit">{descriptor.unit}</span> : null}
        </div>
      );
    }
    case 'slider':
      return (
        <input
          id={id}
          type="range"
          className="prop-control prop-control--slider"
          min={descriptor.min ?? 0}
          max={descriptor.max ?? 100}
          step={descriptor.step ?? 1}
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    case 'toggle':
      return (
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={Boolean(value)}
          className={`prop-control prop-control--toggle${value ? ' is-on' : ''}`}
          onClick={() => onChange(!value)}
        >
          <span className="prop-control__thumb" />
        </button>
      );
    case 'segmented':
    case 'select': {
      const options = descriptor.options ?? [];
      if (descriptor.kind === 'segmented') {
        return (
          <div className="prop-control prop-control--segmented" role="group">
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={`prop-control__seg ${value === opt.value ? 'is-active' : ''}`}
                onClick={() => onChange(opt.value)}
              >
                {String(opt.label || opt.value || '(none)')}
              </button>
            ))}
          </div>
        );
      }
      return (
        <select
          id={id}
          className="prop-control prop-control--input"
          value={String(value)}
          onChange={(e) => {
            const opt = options.find((o) => String(o.value) === e.target.value);
            onChange(opt?.value);
          }}
        >
          {options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {String(opt.label || opt.value || '(none)')}
            </option>
          ))}
        </select>
      );
    }
    case 'color':
      return (
        <div className="prop-control prop-control--color">
          <input
            id={id}
            type="color"
            value={toHex(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          <code className="prop-control__hex">{toHex(value)}</code>
        </div>
      );
    case 'color-with-alpha':
      return (
        <div className="prop-control prop-control--color">
          <input
            id={id}
            type="color"
            value={toHex(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          <code className="prop-control__hex">{toHex(value)}</code>
        </div>
      );
    case 'font':
      return (
        <select
          id={id}
          className="prop-control prop-control--input"
          value={typeof value === 'string' ? value : 'Inter'}
          onChange={(e) => onChange(e.target.value)}
        >
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      );
    case 'asset':
    case 'data-binding':
      return (
        <div className="prop-control prop-control--readonly">
          {descriptor.kind === 'asset' ? 'Asset picker (P08)' : 'Bind to data (P08)'}
        </div>
      );
    case 'repeatable':
      return <ArrayEditor id={id} label={label} fragment={fragment} value={value} onChange={onChange} />;
    case 'union':
      return <UnionEditor id={id} descriptor={descriptor} fragment={fragment} value={value} onChange={onChange} />;
    case 'nested-object':
      return <NestedEditor id={id} fragment={fragment} value={value} onChange={onChange} />;
    default:
      return <div className="prop-control prop-control--readonly">Unsupported control</div>;
  }
}

export const FragmentEditor = memo(FragmentEditorInner);

function clamp(n: number, d: PropControlDescriptor): number {
  let out = n;
  if (d.min !== undefined && out < d.min) out = d.min;
  if (d.max !== undefined && out > d.max) out = d.max;
  return out;
}

function toHex(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#4F46E5';
}

function ArrayEditor({
  id,
  label,
  fragment,
  value,
  onChange,
}: {
  id: string;
  label: string;
  fragment: PropSchemaFragment;
  value: unknown;
  onChange: (next: unknown) => void;
}): ReactElement {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = fragment.items ?? (fragment.prefixItems?.[0] as PropSchemaFragment | undefined) ?? { type: 'string' as const };
  const push = () => {
    const def = resolveSchemaDefaults(itemSchema);
    onChange([...items, def]);
  };
  return (
    <div className="prop-control prop-control--array">
      {items.map((item, i) => (
        <div key={i} className="prop-control__array-row">
          <ArrayItemEditor
            id={`${id}-${i}`}
            label={label}
            itemSchema={itemSchema}
            value={item}
            onChange={(next) => onChange(items.map((it, j) => (j === i ? next : it)))}
          />
          <button
            type="button"
            className="prop-control__remove"
            aria-label={`Remove item ${i + 1}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="prop-control__add" onClick={push}>
        + Add
      </button>
    </div>
  );
}

function ArrayItemEditor({
  id,
  label,
  itemSchema,
  value,
  onChange,
}: {
  id: string;
  label: string;
  itemSchema: PropSchemaFragment;
  value: unknown;
  onChange: (next: unknown) => void;
}): ReactElement {
  const descriptor = inferControl('item', itemSchema);
  if (itemSchema.type === 'object' || descriptor.kind === 'nested-object') {
    return <NestedEditor id={id} fragment={itemSchema} value={value} onChange={onChange} />;
  }
  return <FragmentEditor id={id} label={label} fragment={itemSchema} descriptor={descriptor} value={value} onChange={onChange} />;
}

function NestedEditor({
  id,
  fragment,
  value,
  onChange,
}: {
  id: string;
  fragment: PropSchemaFragment;
  value: unknown;
  onChange: (next: unknown) => void;
}): ReactElement {
  const obj = (value ?? {}) as Record<string, unknown>;
  return (
    <div className="prop-control prop-control--nested">
      {Object.entries(fragment.properties ?? {} as Record<string, PropSchemaFragment>).map(([key, sub]) => {
        const subDescriptor = inferControl(key, sub);
        return (
          <div key={key} className="prop-field prop-field--nested">
            <label className="prop-field__label">{sub.title ?? key}</label>
            <FragmentEditor
              id={`${id}-${key}`}
              label={sub.title ?? key}
              fragment={sub}
              descriptor={subDescriptor}
              value={obj[key] ?? sub.default}
              onChange={(next) => onChange({ ...obj, [key]: next })}
            />
          </div>
        );
      })}
    </div>
  );
}

function UnionEditor({
  id,
  descriptor,
  fragment,
  value,
  onChange,
}: {
  id: string;
  descriptor: PropControlDescriptor;
  fragment: PropSchemaFragment;
  value: unknown;
  onChange: (next: unknown) => void;
}): ReactElement {
  const branches = descriptor.branches ?? [];
  const active = branches.findIndex((b) => b.schema === (fragment.oneOf?.[0] ?? fragment.anyOf?.[0])) ?? 0;
  const [branchIndex, setBranchIndex] = useState(active);
  const branch = branches[branchIndex];
  if (!branch) return <div className="prop-control prop-control--readonly">Union</div>;
  const branchValue = typeof value === 'object' && value !== null ? value : resolveSchemaDefaults(branch.schema);
  return (
    <div className="prop-control prop-control--union">
      <select
        id={undefined}
        className="prop-control prop-control--input"
        value={branchIndex}
        onChange={(e) => {
          const idx = Number(e.target.value);
          setBranchIndex(idx);
          const next = resolveSchemaDefaults(branches[idx]?.schema ?? {});
          onChange(next);
        }}
      >
        {branches.map((b, i) => (
          <option key={i} value={i}>
            {b.label}
          </option>
        ))}
      </select>
      {branch.schema.properties ? (
        <NestedEditor id={id} fragment={branch.schema} value={branchValue} onChange={onChange} />
      ) : null}
    </div>
  );
}

export type { PropsPanelProps };
