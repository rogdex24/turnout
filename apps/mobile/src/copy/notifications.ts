/** The names Android shows for the three notification channels, in the system's own settings for the app. The push text itself is fixed on the server. */
export const notifications = {
  channels: {
    plans: { name: "Plans", description: "News about your tickets and your group." },
    showDay: { name: "Show day", description: "Your meet card is ready, and when to head over." },
    thread: { name: "Group messages", description: "Messages from the people in your group." },
  },
} as const;
