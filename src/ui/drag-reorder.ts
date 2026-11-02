// Dragging a row of a list by its handle to another place in the list.

/**
 * Let `handle` drag `row`, the `i`th child of `list`, up or down: a line shows where it would go,
 * and on lifting, `move(to)` hears the new index (when it changed).
 */
export function dragToReorder(handle: HTMLElement, row: HTMLElement, list: HTMLElement, i: number, move: (to: number) => void): void {
  handle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    row.classList.add('dragging');
    let to = i;
    const rows = [...list.children] as HTMLElement[];
    const onMove = (m: PointerEvent) => {
      to = rows.findIndex((r) => m.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      if (to < 0) to = rows.length - 1; else if (to > i) to -= 1;
      rows.forEach((r, k) => { r.style.boxShadow = k === to && k !== i ? `inset 0 ${to < i ? 3 : -3}px 0 var(--select)` : ''; });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      row.classList.remove('dragging');
      rows.forEach((r) => { r.style.boxShadow = ''; });
      if (to !== i) move(to);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp, { once: true });
    handle.addEventListener('pointercancel', onUp, { once: true });
  });
}
