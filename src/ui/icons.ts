const wrap = (body: string, viewBox = "0 0 24 24"): string =>
  `<svg viewBox="${viewBox}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  close: wrap('<path d="m6 6 12 12M18 6 6 18"/>'),
  minimize: wrap('<path d="M5 12h14"/>', "0 0 16 16"),
  maximize: wrap('<rect x="4" y="4" width="8" height="8" rx="1"/>', "0 0 16 16"),
  restore: wrap(
    '<rect x="3.5" y="6.5" width="7" height="7" rx="1"/><path d="M6.5 6.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"/>',
    "0 0 16 16",
  ),
  book: wrap(
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/><path d="M8 7h7"/>',
  ),
  pencil: wrap(
    '<path d="m14.5 5.5 4 4"/><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
  ),
  split: wrap(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  ),
  sliders: wrap(
    '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="16" cy="7" r="2.1"/><circle cx="8" cy="17" r="2.1"/>',
  ),
  outline: wrap(
    '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r=".9" fill="currentColor" stroke="none"/>',
  ),
  splitDown: wrap(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
  ),
  merge: wrap(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 9l-3 3 3 3"/>',
  ),
  file: wrap(
    '<path d="M6 3h7l5 5v13H6V3Z"/><path d="M13 3v5h5"/>',
  ),
  folder: wrap(
    '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  ),
  save: wrap(
    '<path d="M4 4h12l4 4v12H4V4Z"/><path d="M8 4v6h8V4"/><path d="M8 20v-6h8v6"/>',
  ),
  saveAs: wrap(
    '<path d="M4 4h11l5 5v4"/><path d="M4 4v16h8"/><path d="M15 20h6"/><path d="m17 14 3-3 2 2-3 3h-2v-2Z"/>',
  ),
  reveal: wrap(
    '<path d="M4 4h7"/><path d="M4 4v7"/><path d="M4 4l7 7"/><path d="M14 8h6v12H8v-6"/>',
  ),
  alert: wrap(
    '<path d="M12 4 3.5 20h17L12 4Z"/><path d="M12 9v5"/><path d="M12 17.2v.1"/>',
  ),
} as const;

export function icon(name: keyof typeof icons): string {
  return icons[name];
}
