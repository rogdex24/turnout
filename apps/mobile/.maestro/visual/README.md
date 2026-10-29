# Visual capture

`capture-story.yaml` opens one Storybook story in the e2e build through `turnout-e2e://storybook?story=<id>` and photographs it.
`bun scripts/visual-diff.ts` then compares the shots with the baselines. The matrix, the baseline layout and the artifact names are in
`docs/plans/mobile-visual-testing.md`.

Story ids: the story title lower-cased with `/` and spaces as `-`, then `--`, then the story name the same way. `Screens/Home` with
the story `Loaded` is `screens-home--loaded`.

Stories to capture are listed in `stories.json`: the baseline folder, the story id and a text that shows once the story has rendered.
The text sits at the top of the screen: Maestro sees only what is on screen, and at the largest text size a line lower down is
below the fold on the small phones.
The device jobs run `ci/device-run.sh <target>`, which sets the theme and the text size and captures every listed story.

The events list replaces the `home` entry when it lands in M2. `home` stands in until then, so the pipeline has a shot to compare.

No baseline is committed yet. Baselines come from a CI device run (`scripts/visual-accept.ts <run-id>`), because the pixels have to
come from the pinned emulator and simulator images, not from a developer machine.
