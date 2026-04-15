import { useEffect, useState, type FormEvent } from 'react';
import ModalShell from '../ModalShell/ModalShell';
import type { MinigraphNode, MinigraphNodeProperties } from '../../utils/graphTypes';
import styles from './NodeDialog.module.css';

interface NodeDialogProps {
  mode: 'edit';
  node: MinigraphNode;
  nodeTypeOptions: string[];
  disabled?: boolean;
  onSubmit: (node: MinigraphNode) => void;
  onClose: () => void;
}

interface PropertyRow {
  id: string;
  key: string;
  value: string;
}

let nextRowId = 0;

function createRow(key = '', value = ''): PropertyRow {
  nextRowId += 1;
  return { id: `property-row-${nextRowId}`, key, value };
}

function stringifyPropertyValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function rowsFromProperties(properties: MinigraphNodeProperties): PropertyRow[] {
  return Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => createRow(key, stringifyPropertyValue(item)));
      }
      return [createRow(key, stringifyPropertyValue(value))];
    });
}

function propertiesFromRows(rows: PropertyRow[]): MinigraphNodeProperties {
  const valuesByKey = new Map<string, string[]>();

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    const values = valuesByKey.get(key) ?? [];
    values.push(row.value);
    valuesByKey.set(key, values);
  }

  const properties: MinigraphNodeProperties = {};
  for (const [key, values] of valuesByKey) {
    properties[key] = values.length === 1 ? values[0] : values;
  }

  return properties;
}

function validateRows(rows: PropertyRow[]): string | null {
  for (const row of rows) {
    if (row.value.trim() && !row.key.trim()) {
      return 'Every property value needs a property key.';
    }
  }

  return null;
}

export default function NodeDialog({
  mode,
  node,
  nodeTypeOptions,
  disabled = false,
  onSubmit,
  onClose,
}: NodeDialogProps) {
  const [nodeType, setNodeType] = useState(node.types[0] ?? '');
  const [propertyRows, setPropertyRows] = useState<PropertyRow[]>(() => rowsFromProperties(node.properties));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNodeType(node.types[0] ?? '');
    setPropertyRows(rowsFromProperties(node.properties));
    setError(null);
  }, [node]);

  const title = mode === 'edit' ? 'Edit Node' : 'Node';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) {
      setError('WebSocket is not connected. Reconnect before submitting node edits.');
      return;
    }

    if (!node.alias.trim()) {
      setError('Node alias is required.');
      return;
    }

    if (!nodeType.trim()) {
      setError('Node type is required.');
      return;
    }

    const rowError = validateRows(propertyRows);
    if (rowError) {
      setError(rowError);
      return;
    }

    onSubmit({
      alias: node.alias,
      types: [nodeType.trim()],
      properties: propertiesFromRows(propertyRows),
    });
  };

  const updateRow = (id: string, patch: Partial<Pick<PropertyRow, 'key' | 'value'>>) => {
    setError(null);
    setPropertyRows((rows) => rows.map((row) => (
      row.id === id ? { ...row, ...patch } : row
    )));
  };

  const removeRow = (id: string) => {
    setError(null);
    setPropertyRows((rows) => rows.filter((row) => row.id !== id));
  };

  const addPropertyRow = () => {
    setError(null);
    setPropertyRows((rows) => [...rows, createRow()]);
  };

  const typeOptions = Array.from(new Set([
    nodeType,
    ...nodeTypeOptions,
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return (
    <ModalShell
      title={title}
      subtitle={`Alias: ${node.alias}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="node-edit-form" className={styles.primaryButton} disabled={disabled}>
            Save Changes
          </button>
        </>
      )}
    >
      <form id="node-edit-form" className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.label}>Alias</span>
          <input
            className={styles.input}
            value={node.alias}
            readOnly
            aria-describedby="node-alias-help"
          />
          <span id="node-alias-help" className={styles.hint}>
            Alias is read-only for this first edit flow because connections reference it.
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Type</span>
          <select
            className={styles.input}
            value={nodeType}
            onChange={(event) => {
              setError(null);
              setNodeType(event.target.value);
            }}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <section className={styles.propertiesSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Properties</h3>
              <p className={styles.sectionHint}>Duplicate keys are saved as repeated property values.</p>
            </div>
            <button type="button" className={styles.addButton} onClick={addPropertyRow}>
              Add Property
            </button>
          </div>

          {propertyRows.length === 0 ? (
            <div className={styles.emptyProperties}>No properties yet.</div>
          ) : (
            <div className={styles.propertyRows}>
              {propertyRows.map((row) => (
                <div key={row.id} className={styles.propertyRow}>
                  <input
                    className={styles.propertyKey}
                    value={row.key}
                    placeholder="key"
                    aria-label="Property key"
                    onChange={(event) => updateRow(row.id, { key: event.target.value })}
                  />
                  <textarea
                    className={styles.propertyValue}
                    value={row.value}
                    placeholder="value"
                    aria-label="Property value"
                    rows={2}
                    onChange={(event) => updateRow(row.id, { value: event.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove property ${row.key || 'row'}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    </ModalShell>
  );
}
