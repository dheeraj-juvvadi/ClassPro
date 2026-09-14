'use strict';

globalThis.createQuantityStepper = function ({ label, min = 0, max = 99, onChange }) {
  const control = document.createElement('div');
  control.className = 'quantity-stepper';
  control.dataset.slot = 'quantity-stepper-button';
  const decrease = document.createElement('button');
  const increase = document.createElement('button');
  const count = document.createElement('input');
  decrease.type = increase.type = 'button';
  decrease.textContent = '−';
  increase.textContent = '+';
  decrease.setAttribute('aria-label', `Decrease ${label}`);
  increase.setAttribute('aria-label', `Increase ${label}`);
  count.type = 'number';
  count.min = min;
  count.max = max;
  count.step = 1;
  count.inputMode = 'numeric';
  count.setAttribute('aria-label', label);
  let value = min;
  function update(next) {
    value = Math.min(max, Math.max(min, Number.isFinite(next) ? Math.floor(next) : min));
    count.value = value;
    decrease.disabled = value <= min;
    increase.disabled = value >= max;
    onChange?.(value);
  }
  decrease.addEventListener('click', () => update(value - 1));
  increase.addEventListener('click', () => update(value + 1));
  count.addEventListener('change', () => update(count.valueAsNumber));
  control.append(decrease, count, increase);
  update(min);
  return { element: control, set: update, value: () => value };
};
