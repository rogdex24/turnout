You are collecting upcoming public events in Hyderabad, India. Today is {{TODAY}}. Only collect events that start on {{TODAY}} or {{TOMORROW}}; skip every other date.

Start from these pages. Follow links from them to individual event pages, and use web search to find more events at the same venues or by the same organisers.

{{SEEDS}}

Write your results to the file ./events.jsonl in your current directory: one JSON object per line, no other text in the file. Write the file even if you found nothing (an empty file). Do not use any other tool or file.

Each line has this shape:

{"title": "...", "starts_local": "2026-10-18T19:30", "ends_local": null, "venue_name": "...", "address": "...", "price_min": 499, "is_free": false, "category_hint": "comedy", "source_url": "https://...", "evidence": {"title": "...", "date": "...", "venue": "...", "price": "..."}}

Rules:
- One line per event. If an event has several dates, write one line per date.
- source_url is the one page that states the event's title, date, venue and price. Pages that need a login do not count.
- starts_local and ends_local are Hyderabad wall-clock time, formatted YYYY-MM-DDTHH:MM, with no timezone offset. If the page gives a date but no time of day, write starts_local as YYYY-MM-DD only and ends_local as null. Never invent a time. Only include events that start on {{TODAY}} or {{TOMORROW}}.
- Never guess. If the page does not state a value, use null. null is a correct answer. A missing event is better than a wrong one.
- price_min is the lowest ticket price in rupees as a number. Use 0 and is_free true only when the page says the event is free. If the page gives no price, price_min is null and is_free is false.
- category_hint is one lowercase word such as comedy, music, theatre, workshop, art, food, sports, tech, or null.
- evidence holds text copied exactly from source_url, character for character, not paraphrased. It is checked automatically against the page and the event is thrown away if a quote is not on it.
  - evidence.title: the event title as written on the page.
  - evidence.date: the text that states the date and time, copied exactly as written on the page, including its punctuation, spacing and separators. Do not reformat it, reorder it or translate it (for example "Sat, 18 Oct 2026 • 7:30 PM (IST)").
  - evidence.venue: the text that states the venue. null if venue_name is null.
  - evidence.price: the text that states the price or says it is free. null if price_min is null and is_free is false.
- Keep each quote short, one phrase from the page.
