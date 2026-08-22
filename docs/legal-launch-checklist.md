# Legal launch checklist for the Tripatlas marketing site

The legal pages are implemented as a private-preview draft. Do not make the
site public until every item below is complete.

## Required provider details

- Fill `streetAddress`, `postalCodeAndCity` and `email` in
  `apps/marketing/app/legal-config.ts` with a serviceable business address and
  a monitored public contact address.
- Add a VAT ID, commercial register entry, legal form or supervisory authority
  only if one actually applies.
- Recheck that the same responsible party is named in contracts and invoices.

## Data protection and hosting

- Record the legal entity providing Sites, the data-processing agreement,
  subprocessors, log retention and the applicable safeguards for transfers
  outside the EEA.
- Update section 3 of the privacy notice with those verified facts. OpenAI's
  [Sites documentation](https://learn.chatgpt.com/docs/sites) currently states
  that Sites has no data-residency option at launch.
- Define an operational process to find, export and delete a waitlist entry
  after an access request or withdrawal.
- Test that consent version and timestamp are stored with every new or updated
  waitlist entry.
- Review the final imprint and privacy notice with qualified German counsel
  before public launch. These repository drafts are not legal advice.

## Product claims and commercial setup

- Keep the marketing-site host separate from the future claim that customer
  product instances are hosted on German servers.
- Verify the rights chain for all code and brand assets, including any work
  created in an employment context, before publishing the `0.2.x` line under a
  new license.
- Run a name and trademark clearance check before investing in registration,
  domains and campaigns.
