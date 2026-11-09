# Giving and finance

A Dutch church lives on its members' gifts: monthly bank transfers, a
periodic-gift agreement, the collection on Sunday, a one-off gift for a
mission trip. Most churches are ANBIs, so their givers deduct gifts from
their income tax and the church has duties to publish and keep records.
The app records gifts, says what each was for, gives each giver a yearly
statement, and keeps the books honest. It takes money only through a
payment provider, and never sees a card.

## Practices

- Card numbers, expiry dates and security codes never reach the app's
  servers, logs or database. Online gifts go through a payment provider's
  hosted page or hosted fields (iDEAL, cards, SEPA direct debit through the
  provider), and the app receives a payment identifier. The app's PCI scope
  stays the smallest one.
- A gift is a fact with an amount in euro cents (integers, never floating
  point), a date, a fund, a method (bank transfer, direct debit, online
  payment, cash collection, collection tokens) and, when known, a giver.
  An anonymous gift is a gift without a giver, not a gift to an invented
  person. A gift is never edited; a correction is a new, linked fact.
- Funds are the church's own list (general fund, diaconate, missions, the
  building) and every gift names one, so a gift for missions is spent on
  missions and the books can show it. The church's council or board owns
  the list, not the treasurer's spreadsheet.
- An online gift is recorded as received only when the provider's signed
  webhook says it was paid, checked against the amount and the currency
  the app asked for; the redirect back from the provider is a page to show,
  not a payment. The handler is idempotent, and every call that creates or
  refunds money carries an idempotency key from the app's own fact.
- Bank transfers and direct debits are matched from the bank's statement
  file to givers by the account they came from, with a person confirming a
  new match; a giver's IBAN is stored only to match their gifts and to
  collect a direct debit they authorized.
- A recurring gift by direct debit has a mandate, held by the provider or
  the bank with the church's creditor identifier; the giver can see and
  stop it from their own page. A periodic gift (at least five years, a
  fixed amount at least yearly, in a written agreement naming the church's
  RSIN and a transaction number) is an agreement the app records with its
  start, end and amount, and checks the gifts against.
- Each giver can download a yearly statement of their gifts per fund, with
  the church's name, RSIN and ANBI status, and the periodic gifts shown
  separately, before the tax-return season. The statement is a summary of
  facts; the app does not tell the giver what they may deduct, which depends
  on their income and the year's thresholds.
- Cash from the collection is counted by two people, recorded as one gift
  per count to its fund without a giver, and signed off by both. Collection
  tokens sold to givers are recorded as their gifts when bought, so the
  tokens dropped in the plate are not counted twice.
- The church's ANBI publication (its name, RSIN, contact, policy plan,
  board, remuneration policy, activity report and financial statement, on
  the Belastingdienst's form for church denominations where the church
  uses it) is produced from the books after the year ends and published in
  time. Records are kept for seven years, the fiscal retention period.
- Giving is the most private part of a person's record after pastoral
  data. Only the treasurer and those the church names see who gave what;
  pastors, team leaders and the person directory do not, and no report
  shows individual givers to anyone else.
- The books reconcile: every provider payout matches its payments and
  fees, every bank line has a gift, a cost or a transfer, and a difference
  is a report someone reads.

## Common mistakes

- A gift form that posts card details to the app's own server, even to
  pass them on.
- Marking an online gift as received from the provider's redirect, which
  anyone can open by hand.
- Amounts in floating point, so the year's total on the giver's statement
  is a cent off the books.
- Editing a gift's amount or fund in place, so last year's statement no
  longer matches what the giver was sent.
- Recording the collection as one anonymous gift for the general fund
  when part of it was a designated collection for the diaconate.
- Counting collection tokens as gifts both when they are bought and when
  they come back in the plate.
- Showing a pastor, or a team leader, how much a member gives.
- A yearly statement that tells the giver how much they may deduct.
- Storing a giver's IBAN for anything other than matching and their own
  direct debit, or showing it in full on screen.
- Deleting a giver's gifts when they ask to be removed, breaking the books
  and the seven-year records, instead of anonymizing the giver and keeping
  the gifts.

## Controversies

- **Accept card payments at all?** Cards are less common for gifts in the
  Netherlands than iDEAL and bank transfers, and cost more. *The choice:*
  iDEAL, direct debit and bank transfers first; cards and other methods
  only through the same provider's hosted page, if the church turns them
  on. Why: the payment methods are the provider's problem, and the app's
  is to never hold card data whichever the church picks.
- **Record gifts per giver, or only totals?** Some churches want no
  record of who gave. *The choice:* per giver for every gift the giver can
  be known from (bank, debit, online), because the yearly statement and a
  periodic gift need it; anonymous for cash and for anyone who gives
  online without an account and asks for no statement. Why: the giver's
  tax deduction needs proof, and the church's records are that proof.
- **Who sees giving?** *The choice:* the treasurer and named finance roles
  only; no pastor and no leader sees an individual's giving by default, and
  turning that on is the church's documented decision, logged. Why: giving
  in a church is personal, and knowledge of it changes how people are
  treated.
- **Which payment provider?** *The choice:* the provider is a setting of
  the church, behind one interface (create a payment, a mandate, a refund;
  verify a webhook), with one implementation per provider; a Dutch church
  will often pick one that supports iDEAL and SEPA direct debit natively.
  Why: it depends on the church's bank and contract; the interface keeps
  the gifts the same.
- **Run the accounts in the app?** *The choice:* no; the app records gifts
  and funds, reconciles payouts and exports to the church's accounting
  package or its accountant. Why: double-entry bookkeeping, the annual
  accounts and their approval are their own discipline, and a church
  usually already has someone doing them.

## Sources

- Belastingdienst, ANBI: what it is, the conditions and the duties:
  https://www.belastingdienst.nl/anbi
- Belastingdienst, publishing an ANBI's data, and the standard forms
  including the one for church denominations:
  https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/bijzondere_regelingen/goede_doelen/
- Belastingdienst, deducting gifts, ordinary and periodic:
  https://www.belastingdienst.nl/wps/wcm/connect/nl/aftrek-en-kortingen/content/gift-aftrekken
- PCI Security Standards Council, PCI DSS v4 and the SAQ A scope:
  https://www.pcisecuritystandards.org/document_library/
- European Payments Council, the SEPA Direct Debit schemes and mandates:
  https://www.europeanpaymentscouncil.eu/
- Regulation (EU) 2016/679 (GDPR), articles 5, 6 and 17(3)(b) (erasure
  yields to a legal obligation to keep records):
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
