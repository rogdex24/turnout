# Sources

Public references for the design board, grouped by board step. All accessed 2026-10-27.

- Each entry has the URL, the access date, the HTTP status the build host got with a plain `curl` and a browser user agent, what we take and what we leave.
- A 403 or 400 status means the site blocks scripted fetches. For those, the claim was read through a search result and is marked in the note.
- Pages marked script-rendered return 200 but need JavaScript to show their text. Their claims also come from search results.
- No Mobbin or other paywalled source was used.
- No third-party screenshots are committed. A local `refs/` folder is git-ignored and is never committed.

## B1. Welcome

- Timeleft: Safety starts before the dinner
  - URL: https://timeleft.com/blog/safety-starts-before-the-dinner/
  - Accessed: 2026-10-27, HTTP 200
  - We take: Says the safety rules up front: public vetted venues, groups of 4 to 6, real names and photos, 18+. We say what we check on the first screen too.
  - We leave: Their page is long-form marketing. Our welcome is one sentence and one button.
- 222 on the App Store
  - URL: https://apps.apple.com/us/app/222-find-your-people/id6450612690
  - Accessed: 2026-10-27, HTTP 200
  - We take: Group setting, public places, and members vetted before an experience, all stated in the first lines of the listing. We take the plain tone.
  - We leave: Their listing defines the app by a list of 'this is not' lines. We say what we are and what we check.
- Apple HIG: Onboarding
  - URL: https://developer.apple.com/design/human-interface-guidelines/onboarding
  - Accessed: 2026-10-27, HTTP 200
  - We take: Keep onboarding fast and optional, and ask for things only when they are needed. Three cards at most.
  - We leave: We do not add a Skip button on every card. Sign in is the point of the screen, and the cards are short.

## B2. Sign in, phone then code

- Bumble support: verifying your phone number
  - URL: https://support.bumble.com/hc/en-us/articles/28949524382877-Verifying-your-phone-number
  - Accessed: 2026-10-27, HTTP 403
  - We take: A phone number is the first account step, with a code to confirm it. We use the same order.
  - We leave: We send on WhatsApp only, never SMS. (Page blocks scripted fetches, read through a search result.)
- Meta: WhatsApp autofill button authentication templates
  - URL: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/autofill-button-authentication-templates/
  - Accessed: 2026-10-27, HTTP 400
  - We take: The one-tap autofill button and the copy-code button are the two paths we build. This is the URL the plan cites.
  - We leave: Zero-tap is not in v1. (Blocks scripted fetches, plan cites it.)
- Twilio: WhatsApp authentication templates
  - URL: https://www.twilio.com/docs/content/whatsappauthentication
  - Accessed: 2026-10-27, HTTP 200
  - We take: Spells out copy code, one-tap autofill and zero-tap as the three delivery modes. Confirms copy code is the safe fallback.
  - We leave: We skip zero-tap, because it needs the app to hold extra permissions.
- Apple HIG: Entering data
  - URL: https://developer.apple.com/design/human-interface-guidelines/entering-data
  - Accessed: 2026-10-27, HTTP 200
  - We take: Fewer fields, helpful hints, and a keyboard that matches the data. Numeric keypad for the number and the code.
  - We leave: We do not add input masks that fight paste.

## B3. Profile with notice and consent

- Bumble for Friends: inclusive gender options
  - URL: https://support.bumbleforfriends.com/hc/en-us/articles/12277806094749-Bumble-For-Friends-inclusive-gender-options
  - Accessed: 2026-10-27, HTTP 403
  - We take: Gender is a plain choice on the profile, with a non-binary option, and it can gate a women-only space. We take the same shape.
  - We leave: We do not ask for pronouns or any free-text gender field. (Page blocks scripted fetches, read through a search result.)
- Timeleft on Google Play
  - URL: https://play.google.com/store/apps/details?id=com.timeleft.app
  - Accessed: 2026-10-27, HTTP 200
  - We take: Lists Women-Only Dinners as their own format, so a gated space is a normal product line. Our women-only toggle is the same idea at the plan level.
  - We leave: Theirs is a separate event type. Ours is a choice on the profile that sets who can be in your group.
- Peanut: why we use selfie checks
  - URL: https://www.peanut-app.io/blog/why-we-use-selfie-verification
  - Accessed: 2026-10-27, HTTP 200
  - We take: A women's community that says why it asks for a photo and that the photo is kept private. We explain each ask next to the field.
  - We leave: The page needs JavaScript, so the claims come from the search result summary. We do not copy their wording.
- Apple HIG: Privacy
  - URL: https://developer.apple.com/design/human-interface-guidelines/privacy
  - Accessed: 2026-10-27, HTTP 200
  - We take: Ask for sensitive data with a short, honest purpose, in context. Our 'why we ask' line is that purpose string on screen.
  - We leave: We do not front-load permission asks on the profile screen.

## B4. Handle checking and rejected

- Hinge help: what is selfie checking
  - URL: https://help.hinge.co/hc/en-us/articles/10303221435539-What-is-Selfie-Verification
  - Accessed: 2026-10-27, HTTP 403
  - We take: A pending state that tells you how long to wait (up to 24 hours) and lets you keep using the app. Matches our 'usually within a day'.
  - We leave: Hinge shows a badge when passed. We show no badge to anyone. (Page blocks scripted fetches, read through a search result.)
- Bumble support: verifying your photos
  - URL: https://support.bumble.com/hc/en-us/articles/28949738572829-Verifying-your-photos
  - Accessed: 2026-10-27, HTTP 403
  - We take: Has a pending state and a retry after a miss. We take the retry as a single button.
  - We leave: We do not show the person a red failure screen. (Blocks scripted fetches, read through a search result.)
- Peanut: why we use selfie checks
  - URL: https://www.peanut-app.io/blog/why-we-use-selfie-verification
  - Accessed: 2026-10-27, HTTP 200
  - We take: Keeps the check private and off the public profile. Our result is only ever shown to the person it belongs to.
  - We leave: Their flow is a selfie. Ours is a social handle, so the copy names the handle.

## B5. Home (Shows tab)

- District by Zomato on Google Play
  - URL: https://play.google.com/store/apps/details?id=com.application.zomato.district
  - Accessed: 2026-10-27, HTTP 200
  - We take: The closest Indian peer for browsing events by city. Poster-led cards and a short list are the baseline we are measured against.
  - We leave: They mix dining, movies and events on one feed. We show shows only.
- BookMyShow on Google Play
  - URL: https://play.google.com/store/apps/details?id=com.bt.bms
  - Accessed: 2026-10-27, HTTP 200
  - We take: Where our users already buy tickets, so the show title and date format should read the same. We take the habit of date first.
  - We leave: We keep one list and no banners.
- Luma on the App Store
  - URL: https://apps.apple.com/us/app/luma-events-invites/id1546150895
  - Accessed: 2026-10-27, HTTP 200
  - We take: A calm events home: one list, big cover images, quiet text. Close to our Posters.
  - We leave: Luma serves hosts too. Ours is attendee only, so no host controls.

## B6. Show page and go sheet

- Luma help: event guest list
  - URL: https://help.luma.com/p/event-guest-list
  - Accessed: 2026-10-27, HTTP 200
  - We take: Shows a count plus a few names and photos, and hosts can hide it. We take the count and leave the faces out until T-3h.
  - We leave: Luma shows names early. We never show names or photos before T-3h.
- Partiful case study by Software Mansion
  - URL: https://swmansion.com/case-studies/partiful/
  - Accessed: 2026-10-27, HTTP 200
  - We take: A native event app built with React Native, with RSVP in a sheet. Confirms the shape is workable in our stack.
  - We leave: Partiful centres on guest lists. We show a count and no list.
- Timeleft: dinners
  - URL: https://timeleft.com/dinners/
  - Accessed: 2026-10-27, HTTP 200
  - We take: A single clear action to book, and the reveal is later. We take 'reveal later' as the model.
  - We leave: We do not take payment. The ticket is bought on BookMyShow.
- Material 3: Bottom sheets
  - URL: https://m3.material.io/components/bottom-sheets/guidelines
  - Accessed: 2026-10-27, HTTP 200
  - We take: Modal sheets with a drag handle and one clear dismiss. Android users expect the back gesture to close it.
  - We leave: We do not use a standard (non-modal) sheet. The go sheet is always modal.

## B7. Add your ticket (screenshot proof)

- Airbnb help: ID upload tips
  - URL: https://www.airbnb.com/help/article/3033
  - Accessed: 2026-10-27, HTTP 200
  - We take: Practical upload tips next to the upload, such as good light and all four corners. We take the idea of tips on the same screen.
  - We leave: Airbnb asks for an ID document. We ask only for a ticket screenshot. (Page is script-rendered, read through a search result.)
- Dice help: tickets
  - URL: https://dice.fm/help/article?id=18201556722961
  - Accessed: 2026-10-27, HTTP 200
  - We take: Dice says a screenshot is not a ticket, so proof is the order details. That is why our copy calls it proof, not a ticket.
  - We leave: We are not the ticket. The venue scans the BookMyShow QR. (Script-rendered, read through a search result.)
- Android: Photo picker
  - URL: https://developer.android.com/training/data-storage/shared/photo-picker
  - Accessed: 2026-10-27, HTTP 200
  - We take: A system picker that gives the app only the photos the person chooses, with no library permission.
  - We leave: We do not build our own gallery.
- Apple: enhanced privacy in your photos app
  - URL: https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app
  - Accessed: 2026-10-27, HTTP 200
  - We take: Same idea on iOS: the app sees only what the person picks.
  - We leave: We do not ask for full library access.

## B8. Your plans tab

- Airbnb help: find your reservation info
  - URL: https://www.airbnb.com/help/article/2064
  - Accessed: 2026-10-27, HTTP 200
  - We take: One Trips tab with upcoming and past, and every state in one list. We take the single list.
  - We leave: Our list has plans only, no messages. (Script-rendered, read through a search result.)
- Luma help: iOS app
  - URL: https://help.luma.com/p/luma-ios-app
  - Accessed: 2026-10-27, HTTP 200
  - We take: A Your Events view split into Upcoming and Past. Simple, text-led.
  - We leave: We only have events you are going to.
- Partiful itineraries by Sana Saab
  - URL: https://sanasaab.com/projects/partiful-itineraries.html
  - Accessed: 2026-10-27, HTTP 200
  - We take: A design write-up on how a plans view can group upcoming items. We take the grouping idea.
  - We leave: Ours is a short list with no timeline.

## B9. Plan detail

- Timeleft: group dinner events
  - URL: https://timeleft.com/blog/group-dinner-events/
  - Accessed: 2026-10-27, HTTP 200
  - We take: The venue is revealed 12 hours before and a group preview shows on the day. We take 'reveal late'.
  - We leave: We reveal at T-3h, and the preview is names and photos only from then.
- Airbnb help: check-in details
  - URL: https://www.airbnb.com/help/article/100
  - Accessed: 2026-10-27, HTTP 200
  - We take: Details are held back and released about 48 hours before. A known pattern for 'you will know more later'. (Script-rendered, read through a search result.)
  - We leave: Our window is hours, not days.
- Airbnb help: pending and confirmed
  - URL: https://www.airbnb.com/help/article/90
  - Accessed: 2026-10-27, HTTP 200
  - We take: Pending and confirmed are two clear states with different next steps. We take that split.
  - We leave: We do not use a pending request model. (Script-rendered, read through a search result.)

## B10. Leave this plan

- Timeleft FAQ
  - URL: https://timeleft.com/faq/
  - Accessed: 2026-10-27, HTTP 200
  - We take: Cancel in the app up to 4 hours before. A clear cutoff, stated up front.
  - We leave: They have a cutoff. We state what changes for the group, not a penalty.
- Airbnb help: cancel a reservation
  - URL: https://www.airbnb.com/help/article/169
  - Accessed: 2026-10-27, HTTP 200
  - We take: Cancel in the app and see what happens before you confirm. We take 'show the effect before the confirm'.
  - We leave: Airbnb shows a refund amount. We have no money in the app. (Script-rendered, read through a search result.)
- Luma help: event registration
  - URL: https://help.luma.com/p/event-registration-process
  - Accessed: 2026-10-27, HTTP 200
  - We take: Change Going to Not Going in place. Leaving is one control, not a support ticket.
  - We leave: We tell the group when it is within 3 hours of the show.
- Apple HIG: Alerts
  - URL: https://developer.apple.com/design/human-interface-guidelines/alerts
  - Accessed: 2026-10-27, HTTP 200
  - We take: Alerts should be rare, and the safe choice should be easy to tell apart. We use a Sheet, not an alert.
  - We leave: We do not use a destructive red button.

## B11. Meet card

- Timeleft: dinners
  - URL: https://timeleft.com/dinners/
  - Accessed: 2026-10-27, HTTP 200
  - We take: The icebreaker unlocks in the app 30 minutes before. Content that opens at the moment it is useful.
  - We leave: We do not have an icebreaker. The meet card is a place, a time and a group.
- Airbnb help: check-in details
  - URL: https://www.airbnb.com/help/article/41
  - Accessed: 2026-10-27, HTTP 200
  - We take: Everything you need to arrive, on one card, close to the time. (Script-rendered, read through a search result.)
  - We leave: Theirs is for a host and a key. Ours is for a group at a cafe.
- Apple: share your estimated time of arrival
  - URL: https://support.apple.com/guide/iphone/share-your-estimated-time-of-arrival-iph65c86df8c/ios
  - Accessed: 2026-10-27, HTTP 200
  - We take: Sharing your estimated arrival is something the person chooses to do. We keep location on the phone.
  - We leave: We do not send location to the group.
- Google Maps help: share your location
  - URL: https://support.google.com/maps/answer/15437054
  - Accessed: 2026-10-27, HTTP 200
  - We take: Location sharing has a duration and a Stop. We take 'the person is in control' as the rule.
  - We leave: Our meet card has an optional on-phone distance and no live map for others.

## B12. Group thread

- Timeleft help: how group chats are moderated
  - URL: https://help.timeleft.com/hc/en-150/articles/29193330963868-How-Are-Group-Chats-Moderated
  - Accessed: 2026-10-27, HTTP 403
  - We take: Says plainly that group chats are moderated. We read reports and say so on the Report screen. (Blocks scripted fetches, read through a search result.)
  - We leave: We say we read every report within 24 hours, and nothing more.
- Timeleft: safety guidelines
  - URL: https://timeleft.com/safety-guidelines/
  - Accessed: 2026-10-27, HTTP 200
  - We take: Long-press a message, then Report, and the person who is reported is never told who reported. We take both.
  - We leave: Their guidelines are a long page. Ours is two lines on the Report screen.
- Bumble for Friends
  - URL: https://bumble.com/en-us/the-buzz/bumble-for-friends
  - Accessed: 2026-10-27, HTTP 200
  - We take: A friends product from a dating company, with its own safety pages. We take the idea of one product line for friends, kept apart from dating.
  - We leave: Ours is one group thread per plan and no one to one chat.

## B13. After the show

- Hinge help: We Met
  - URL: https://help.hinge.co/hc/en-us/articles/360010692913-What-is-We-Met
  - Accessed: 2026-10-27, HTTP 403
  - We take: A private follow-up after meeting. We take 'private and short'. (Blocks scripted fetches, read through a search result.)
  - We leave: Ours is only for telling us about discomfort. There is no score.
- Timeleft: the algorithm
  - URL: https://timeleft.com/post/timeleft-algorithm-the-maestro-of-your-dinners/
  - Accessed: 2026-10-27, HTTP 200
  - We take: Explains how groups are put together. We take the idea of saying what an answer is used for: telling us about discomfort means you are not grouped with that person again.
  - We leave: We do not describe a matching model on this screen.
- Uber: ride safety tips
  - URL: https://www.uber.com/us/en/ride/safety/tips/
  - Accessed: 2026-10-27, HTTP 200
  - We take: Safety tools stay reachable after the trip, in the same place as before. Our Report stays on this screen.
  - We leave: We do not ask for a rating.

## B14. Settings and safety

- Uber: ride safety tips
  - URL: https://www.uber.com/us/en/ride/safety/tips/
  - Accessed: 2026-10-27, HTTP 200
  - We take: A named Safety Toolkit with Share My Trip and Emergency, easy to find. We take the named, labelled entry.
  - We leave: We link to Call 112 and Report, and have no trip sharing.
- Bumble support: reporting someone
  - URL: https://support.bumble.com/hc/en-us/articles/28783343585565-Reporting-someone
  - Accessed: 2026-10-27, HTTP 403
  - We take: Report from the profile and the chat, with reasons. (Blocks scripted fetches, read through a search result.)
  - We leave: We have no profile pages. Report is from the thread and the meet card.
- Bumble support: deleting your data
  - URL: https://support.bumble.com/hc/en-us/articles/28783893039389-Deleting-your-data
  - Accessed: 2026-10-27, HTTP 403
  - We take: Says what is removed and what stays for a while. We say the same in one short list. (Blocks scripted fetches, read through a search result.)
  - We leave: We do not offer a pause or a snooze. Delete is delete.
- Google Play: account deletion requirement
  - URL: https://support.google.com/googleplay/android-developer/answer/13327111
  - Accessed: 2026-10-27, HTTP 200
  - We take: Apps that create accounts must offer deletion inside the app and on the web. This is a hard requirement for the Play release.
  - We leave: Nothing to leave. We build to it.
- Apple HIG: Managing accounts
  - URL: https://developer.apple.com/design/human-interface-guidelines/managing-accounts
  - Accessed: 2026-10-27, HTTP 200
  - We take: Let people delete an account from within the app, and say what is deleted.
  - We leave: We do not ask them to type a phrase to confirm.

## B15. Notifications

- Android: notification runtime permission
  - URL: https://developer.android.com/develop/ui/views/notifications/notification-permission
  - Accessed: 2026-10-27, HTTP 200
  - We take: On Android 13 and up the permission is a runtime ask, so a pre-ask in our own words is what the platform expects.
  - We leave: We do not ask on first launch.
- Apple HIG: Managing notifications
  - URL: https://developer.apple.com/design/human-interface-guidelines/managing-notifications
  - Accessed: 2026-10-27, HTTP 200
  - We take: Ask for permission in context, when the value is clear. Our pre-ask appears with the ticket.
  - We leave: We do not use provisional delivery in v1.
- Apple: asking permission to use notifications
  - URL: https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
  - Accessed: 2026-10-27, HTTP 200
  - We take: The system prompt shows once, so spend it after our own pre-ask. If the person says Not now we have not used it up.
  - We leave: We do not link to Settings from a nag.

## B16. Platform conventions

- Apple HIG: Tab bars
  - URL: https://developer.apple.com/design/human-interface-guidelines/tab-bars
  - Accessed: 2026-10-27, HTTP 200
  - We take: Do not hide or disable tabs. We keep all tabs visible even with no data.
  - We leave: We do not use badges on tabs for marketing.
- Apple HIG: Sheets
  - URL: https://developer.apple.com/design/human-interface-guidelines/sheets
  - Accessed: 2026-10-27, HTTP 200
  - We take: A grabber on resizable sheets, and Cancel or Done in a clear place.
  - We leave: We do not nest sheets.
- Apple HIG: Typography
  - URL: https://developer.apple.com/design/human-interface-guidelines/typography
  - Accessed: 2026-10-27, HTTP 200
  - We take: Support Dynamic Type and keep the hierarchy readable at large sizes.
  - We leave: We use Big Shoulders Display and Inter, not the system face.
- Apple HIG: Motion
  - URL: https://developer.apple.com/design/human-interface-guidelines/motion
  - Accessed: 2026-10-27, HTTP 200
  - We take: Make motion optional. We respect reduced motion and use motion in three places only.
  - We leave: No decorative motion.
- Apple HIG: Playing haptics
  - URL: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
  - Accessed: 2026-10-27, HTTP 200
  - We take: Use haptics consistently. We decide in F6 whether I'm here gets one.
  - We leave: No haptics on scroll or on tab change.
- Material 3: Navigation bar
  - URL: https://m3.material.io/components/navigation-bar/guidelines
  - Accessed: 2026-10-27, HTTP 200
  - We take: A bottom bar of 3 to 5 destinations with labels. Our three tabs fit.
  - We leave: We do not use the Material pill indicator colour. We follow the Nightlife palette.
- Material 3: Bottom sheets
  - URL: https://m3.material.io/components/bottom-sheets/guidelines
  - Accessed: 2026-10-27, HTTP 200
  - We take: Drag handle and a dismiss that matches the back gesture.
  - We leave: No side sheets.
- Android: predictive back
  - URL: https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back
  - Accessed: 2026-10-27, HTTP 200
  - We take: Back shows a preview of where you land. Sheets and stacks must handle it.
  - We leave: No custom back arrows that fight the system gesture.
- Android 14: non-linear font scaling
  - URL: https://developer.android.com/about/versions/14/features
  - Accessed: 2026-10-27, HTTP 200
  - We take: Font scaling goes up to 200 percent. Layouts must not clip at that size.
  - We leave: No fixed-height text containers.
