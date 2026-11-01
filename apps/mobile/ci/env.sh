# Sourced by the other scripts in this folder. The e2e build: Storybook on, screenshots allowed, and the API at the seeded server.
# These match the `e2e` profile in eas.json. EXPO_PUBLIC_ values are inlined into the JS bundle when it is made.
export APP_VARIANT=e2e
export EXPO_PUBLIC_STORYBOOK=1
export EXPO_PUBLIC_ALLOW_CAPTURE=1
export EXPO_PUBLIC_GROUPS_ENABLED=1
# PostHog goes to the seeded server's capture sink (src/app-api/posthogSink.ts), not to PostHog: the host is a path, which the app
# puts on the API address for the platform. The key is the one the sink takes. JS only: nothing here reaches the native fingerprint.
export EXPO_PUBLIC_POSTHOG_KEY=phc_e2e_capture_sink
export EXPO_PUBLIC_POSTHOG_HOST=/api/app/v1/__test/posthog
