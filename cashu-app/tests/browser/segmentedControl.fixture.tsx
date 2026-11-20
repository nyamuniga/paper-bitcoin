import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bitcoin, Zap } from 'lucide-react';
import { SlidingSegmentedControl } from '../../src/components/shared/SlidingSegmentedControl';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;

function SegmentedControlFixture() {
  const [value, setValue] = useState<'first' | 'second'>('first');
  const compact = query.has('compact');
  return (
    <main style={{ maxWidth: 480, padding: 24 }}>
      <button id="before-control">Before control</button>
      <section id="control-host" style={{ width: compact ? 'max-content' : '100%', marginTop: 24 }}>
        <SlidingSegmentedControl<'first' | 'second'>
          options={compact
            ? [{ id: 'first', label: 'BTC' }, { id: 'second', label: 'USD' }]
            : [{ id: 'first', label: 'Lightning', icon: <Zap size={15} /> },
              { id: 'second', label: 'On-Chain', icon: <Bitcoin size={20} /> }]}
          value={value}
          onChange={setValue}
          compact={compact}
          tabListId={compact ? 'fixture-tabs' : undefined}
          ariaLabel={compact ? 'Wallet balance currency' : 'Receive mode'}
        />
      </section>
      <output id="value">{value}</output>
      {compact && ['first', 'second'].map(id => (
        <section key={id} role="tabpanel" id={`fixture-tabs-${id}-panel`}
          aria-labelledby={`fixture-tabs-${id}`} hidden={value !== id}>
          {id} balance
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<SegmentedControlFixture />);
