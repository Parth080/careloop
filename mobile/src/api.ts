import { apiBaseUrl } from './config';
import {
  parseAskResult,
  parsePackageReading,
  parsePrescriptionReading,
  parseProposal,
  parseVisitSummary,
  utcOffsetMinutes,
  type Appointment,
  type AppointmentInput,
  type AskResult,
  type Circle,
  type Contact,
  type ContactRole,
  type DoseLog,
  type DoseStatus,
  type Invite,
  type Medicine,
  type MedicineInput,
  type NewNote,
  type Note,
  type NoteInput,
  type PackageReading,
  type PrescriptionReading,
  type Proposal,
  type Role,
  type Session,
  type VisitSummary,
} from './model';

export class ApiError extends Error {
  status: number; // 0 when the server couldn't be reached

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; token?: string; timeoutMs?: number };
type DoseKey = { medication_id: number; day: string; time: string };
type SummaryRequest = { from_day: string; to_day: string; appointment_id: number | null };

function messageFor(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail) return detail; // the server writes these for people, not developers
  if (status === 422) return 'Please check what you entered and try again.';
  if (status >= 500) return 'Something went wrong on the CareLoop server. Please try again.';
  return 'Something went wrong. Please try again.';
}

async function request<T>(path: string, { method = 'GET', body, token, timeoutMs = 15_000 }: Options = {}): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new ApiError('CareLoop does not know where its server is. Set EXPO_PUBLIC_API_URL in mobile/.env.local.', 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        controller.signal.aborted ? 'CareLoop took too long to answer. Please try again.' : 'Could not reach CareLoop. Check your internet connection.',
        0,
      );
    }
    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof data === 'object' && data !== null && 'detail' in data ? data.detail : null;
      throw new ApiError(messageFor(response.status, detail), response.status);
    }
    if (data === null) throw new ApiError('CareLoop sent an answer this app could not read. Please try again.', response.status);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export function startProfile(body: { your_name: string; your_role: Role; person_name?: string }): Promise<Session> {
  return request<Session>('/api/profiles', { method: 'POST', body });
}

export function joinWithCode(code: string, yourName: string): Promise<Session> {
  return request<Session>('/api/invites/accept', { method: 'POST', body: { code, your_name: yourName } });
}

/** Calls made by a signed-in phone. */
export function careApi(token: string) {
  const call = <T>(path: string, options: Omit<Options, 'token'> = {}) => request<T>(path, { ...options, token });
  return {
    circle: () => call<Circle>('/api/me'),
    createInvite: (role: Role) => call<Invite>('/api/invites', { method: 'POST', body: { role } }),
    removeMember: (memberId: number) => call<void>(`/api/members/${memberId}`, { method: 'DELETE' }),
    deleteEverything: () => call<void>('/api/profile', { method: 'DELETE' }),

    notes: () => call<Note[]>('/api/notes'),
    // Two model attempts can take up to ~30 s on the server, so wait a little longer than that.
    proposeNotes: async (transcript: string): Promise<Proposal> =>
      parseProposal(await call<unknown>('/api/notes/propose', { method: 'POST', body: { transcript }, timeoutMs: 40_000 })),
    createNote: (note: NewNote) => call<Note>('/api/notes', { method: 'POST', body: note }),
    updateNote: (id: number, note: NoteInput) => call<Note>(`/api/notes/${id}`, { method: 'PUT', body: note }),
    deleteNote: (id: number) => call<void>(`/api/notes/${id}`, { method: 'DELETE' }),

    // A vision model reads the photo, then Nemotron organizes it: usually about 10 s, at worst about 140 s with retries.
    readPrescription: async (imageBase64: string, mediaType: 'image/jpeg' | 'image/png'): Promise<PrescriptionReading> =>
      parsePrescriptionReading(await call<unknown>('/api/prescriptions/read', {
        method: 'POST',
        body: { image_base64: imageBase64, media_type: mediaType },
        timeoutMs: 150_000,
      })),
    // One reader, then Nemotron: printed text is quick to read.
    readPackage: async (imageBase64: string): Promise<PackageReading> =>
      parsePackageReading(await call<unknown>('/api/medicines/read-package', {
        method: 'POST',
        body: { image_base64: imageBase64, media_type: 'image/jpeg' },
        timeoutMs: 90_000,
      })),
    medicines: () => call<Medicine[]>('/api/medicines'),
    addMedicine: (medicine: MedicineInput) => call<Medicine>('/api/medicines', { method: 'POST', body: medicine }),
    updateMedicine: (id: number, medicine: MedicineInput) => call<Medicine>(`/api/medicines/${id}`, { method: 'PUT', body: medicine }),
    deleteMedicine: (id: number) => call<void>(`/api/medicines/${id}`, { method: 'DELETE' }),
    doses: (fromDay: string, toDay: string) => call<DoseLog[]>(`/api/doses?from_day=${fromDay}&to_day=${toDay}`),
    recordDose: (dose: DoseKey & { status: DoseStatus }) => call<DoseLog>('/api/doses', { method: 'PUT', body: dose }),
    undoDose: ({ medication_id, day, time }: DoseKey) =>
      call<void>(`/api/doses?medication_id=${medication_id}&day=${day}&time=${encodeURIComponent(time)}`, { method: 'DELETE' }),

    appointments: () => call<Appointment[]>('/api/appointments'),
    addAppointment: (appointment: AppointmentInput) => call<Appointment>('/api/appointments', { method: 'POST', body: appointment }),
    updateAppointment: (id: number, appointment: AppointmentInput) =>
      call<Appointment>(`/api/appointments/${id}`, { method: 'PUT', body: appointment }),
    deleteAppointment: (id: number) => call<void>(`/api/appointments/${id}`, { method: 'DELETE' }),

    // NVIDIA Nemotron Ultra reads the period's notes: usually about 5 s, at worst about 90 s with a retry.
    visitSummary: async (body: SummaryRequest): Promise<VisitSummary> =>
      parseVisitSummary(await call<unknown>('/api/summary', {
        method: 'POST',
        body: { ...body, utc_offset_minutes: utcOffsetMinutes() },
        timeoutMs: 100_000,
      })),
    // Usually 2 to 5 s; at worst about 60 s with a retry.
    ask: async (question: string): Promise<AskResult> =>
      parseAskResult(await call<unknown>('/api/ask', {
        method: 'POST',
        body: { question, utc_offset_minutes: utcOffsetMinutes() },
        timeoutMs: 70_000,
      })),

    contacts: () => call<Contact[]>('/api/contacts'),
    saveContact: (role: ContactRole, contact: { name: string; phone: string }) =>
      call<Contact>(`/api/contacts/${role}`, { method: 'PUT', body: contact }),
    removeContact: (role: ContactRole) => call<void>(`/api/contacts/${role}`, { method: 'DELETE' }),
  };
}

export type CareApi = ReturnType<typeof careApi>;
