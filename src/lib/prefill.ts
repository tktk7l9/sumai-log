import { dateKey } from './calendar'

/**
 * The fields of the visit record form that are prefilled, passed to `defaults` of VisitForm.
 * The internal type of VisitForm itself (derived from VisitInput in server/visits.ts) is
 * wider (it also has attendees, good, concerns and so on), but prefill fills only these 5.
 */
export type VisitFormValues = {
  eventId: string
  placeId: string | null
  vendorId: string | null
  propertyId: string | null
  visitedOn: string
}

type PrefillEvent = {
  placeId: string | null
  vendorId: string | null
  propertyId: string | null
  startsAt: string
}

/**
 * Builds the initial values of the visit record form when the user arrives from
 * "記録を書く" (Write a record) on the events tab (/records?fromEvent=...). A pure function
 * extracted from `src/routes/records.tsx`.
 *
 * Without an event (no event was specified, or it could not be read because of a 404) it
 * returns undefined, and the form opens with the usual empty initial values.
 *
 * For an event with no place, vendor or property, it returns an explicit null for each
 * (it does not return `undefined`). Mantine's useForm does not track a key that is missing
 * from the initial values even if setFieldValue is called on it later, so using
 * `?? undefined` here caused a real bug where saving became impossible
 * (P2-R8: with "記録を書く" from an event, unset links became undefined and saving failed).
 * When you fix something here, do not break this `?? null`.
 */
export function buildVisitPrefill(
  search: { eventId?: string },
  event: PrefillEvent | null,
): Partial<VisitFormValues> | undefined {
  if (!event) return undefined
  return {
    eventId: search.eventId,
    placeId: event.placeId ?? null,
    vendorId: event.vendorId ?? null,
    propertyId: event.propertyId ?? null,
    visitedOn: dateKey(event.startsAt),
  }
}
