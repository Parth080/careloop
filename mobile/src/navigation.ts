import type { Photo } from './photos';
import type { Appointment, AppointmentInput, ContactRole, Medicine, Note } from './model';

export type Tab = 'today' | 'medicines' | 'visits' | 'notes';

/** A full screen that slides over the tabs. */
export type Overlay =
  | { kind: 'note' }
  | { kind: 'ask' }
  | { kind: 'help'; editing?: ContactRole }
  | { kind: 'circle' }
  | { kind: 'medicine'; medicine: Medicine | null }
  | { kind: 'prescription'; photo: Photo }
  | { kind: 'visit'; appointment: Appointment | null; initial?: AppointmentInput; heard?: string | null }
  | { kind: 'summary'; appointment: Appointment | null }
  | { kind: 'editNote'; note: Note };
