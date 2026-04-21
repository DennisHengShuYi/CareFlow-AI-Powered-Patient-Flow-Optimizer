/** Matches backend build_capacity_board room `state` values (legacy `available` → ready) */
export function capacityRoomStyle(state: string) {
  const s = state === 'available' ? 'ready' : state;
  switch (s) {
    case 'occupied':
      return {
        label: 'In session',
        hint: 'Encounter / resus',
        color: '#b91c1c',
        bg: '#fff5f5',
      };
    case 'queued':
      return {
        label: 'Patients waiting',
        hint: 'Roster for this clinician',
        color: '#c2410c',
        bg: '#fff7ed',
      };
    case 'ready':
      return {
        label: 'Staffed · open',
        hint: 'Clinician assigned, no patients yet',
        color: '#0369a1',
        bg: '#f0f9ff',
      };
    default:
      return {
        label: 'Unstaffed',
        hint: 'No clinician on this room',
        color: '#64748b',
        bg: '#f1f5f9',
      };
  }
}
