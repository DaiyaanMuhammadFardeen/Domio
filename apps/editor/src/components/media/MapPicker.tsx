/**
 * MapPicker — map location + choropleth editor.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * - Place a marker at lat/lng (drag-drop in the editor is a later
 *   optimization; numeric inputs ship first).
 * - Choropleth config: pick a metric column + color scale.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
}

export interface MapPickerProps {
  value: MapMarker;
  onChange: (marker: MapMarker) => void;
  /** Available column names for choropleth. */
  metricColumns?: readonly string[];
}

export function MapPicker({ value, onChange, metricColumns = [] }: MapPickerProps): ReactElement {
  const [metric, setMetric] = useState(metricColumns[0] ?? '');
  const [scaleMin, setScaleMin] = useState(0);
  const [scaleMax, setScaleMax] = useState(100);

  const handleLat = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, lat: Number(e.target.value) });
    },
    [value, onChange],
  );

  const handleLng = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, lng: Number(e.target.value) });
    },
    [value, onChange],
  );

  const handleLabel = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, label: e.target.value });
    },
    [value, onChange],
  );

  return (
    <div className="map-picker" data-testid="map-picker">
      <div className="map-picker__viewport" data-testid="map-picker-viewport">
        <span className="map-picker__marker">
          {value.label} ({value.lat.toFixed(4)}, {value.lng.toFixed(4)})
        </span>
      </div>
      <div className="map-picker__controls">
        <label>
          Label
          <input
            type="text"
            value={value.label}
            onChange={handleLabel}
            data-testid="map-picker-label"
          />
        </label>
        <label>
          Lat
          <input
            type="number"
            value={value.lat}
            onChange={handleLat}
            step="0.0001"
            data-testid="map-picker-lat"
          />
        </label>
        <label>
          Lng
          <input
            type="number"
            value={value.lng}
            onChange={handleLng}
            step="0.0001"
            data-testid="map-picker-lng"
          />
        </label>
      </div>
      {metricColumns.length > 0 && (
        <div className="map-picker__choropleth" data-testid="map-picker-choropleth">
          <label>
            Metric
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              data-testid="map-picker-metric"
            >
              {metricColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Min
            <input
              type="number"
              value={scaleMin}
              onChange={(e) => setScaleMin(Number(e.target.value))}
              data-testid="map-picker-min"
            />
          </label>
          <label>
            Max
            <input
              type="number"
              value={scaleMax}
              onChange={(e) => setScaleMax(Number(e.target.value))}
              data-testid="map-picker-max"
            />
          </label>
        </div>
      )}
    </div>
  );
}
