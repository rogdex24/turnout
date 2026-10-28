import { z } from "zod";
import { CATEGORIES } from "./category.js";

/**
 * The public event JSON from GET /api/events and GET /api/events/:publicId (snake_case, as the
 * server writes it today). The app reads it through these schemas. Responses are not `.strict()`:
 * the server may add fields without breaking an older app.
 */
export const eventVenueSchema = z.object({
  name: z.string().nullable(),
  area: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export const eventSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  is_all_day: z.boolean(),
  starts_at: z.string().nullable(),
  starts_at_local: z.string(),
  ends_at: z.string().nullable(),
  category: z.enum(CATEGORIES),
  venue: eventVenueSchema,
  is_free: z.boolean(),
  price_min: z.number().nullable(),
  price_max: z.number().nullable(),
  currency: z.string(),
  source: z.object({ name: z.string(), url: z.string() }),
  ticket_url: z.string(),
  image_url: z.string().nullable(),
  /** A group can be made for this show right now (category, price, a real start time, a placed venue, before T-24h). */
  group_eligible: z.boolean(),
});

export const eventDetailSchema = eventSchema.extend({
  description: z.string().nullable(),
  alternate_ticket_urls: z.array(z.string()),
});

export const eventListResponseSchema = z.object({
  generated_at: z.string(),
  timezone: z.string(),
  city: z.string(),
  count: z.number().int().nonnegative(),
  next_cursor: z.string().nullable(),
  events: z.array(eventSchema),
});

/** Query for GET /api/events as the app sends it. `group_eligible=1` lists only shows a group can be made for. */
export const eventListQuerySchema = z
  .object({
    area: z.string().min(1).max(64),
    category: z.enum(CATEGORIES),
    group_eligible: z.literal("1"),
    cursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/),
    limit: z.coerce.number().int().min(1).max(200),
  })
  .partial()
  .strict();

export type EventVenue = z.infer<typeof eventVenueSchema>;
export type ApiEvent = z.infer<typeof eventSchema>;
export type ApiEventDetail = z.infer<typeof eventDetailSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
