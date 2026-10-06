# Mortgage application check

Upload one home buyer's document dossier, get a straight answer on whether they
can have the mortgage, and the numbers behind it.

Built for Exercise 4 of the Claude Build Day, Zurich, October 2026.

```bash
npm install
npm run dev          # http://localhost:3000
```

Then click one of the three sample buyers on the landing page, or drag a folder
of PDFs onto it.

## What it does

The buyer uploads the seven documents a Swiss bank asks for. Claude reads them,
the bank's rule sheet decides, and the page answers in one line — **"Yes, this
mortgage works"** or **"Not yet"** — followed by a dial the buyer can move to
find out what it would take.

| Stage | What happens | Who does it |
|---|---|---|
| 1. Receive | Seven PDFs in | — |
| 2. Extract | Read every figure, with its source document and printed label | Claude |
| 3. Completeness | All seven documents present? | code |
| 4. Consistency | Where do the documents contradict each other? | code |
| 5. Equity | 20% down, of which 10% not from the pension fund | code |
| 6. Affordability | Costs at most a third of gross income | code |
| 7. Decision | Approve / with conditions / reject, and what would fix it | code |
| 8. Kreditantrag | One-page credit proposal | Claude |
| 9. Sign-off | The credit officer decides | human |

**The model reads; the rule sheet decides.** Claude never does the arithmetic.
Extraction and the credit proposal's prose are the model's only jobs; every
number, verdict and suggested fix comes out of `lib/rules.ts`, which is pure
TypeScript with no dependencies and is tested against the exercise's worked
example to the franc.

That separation is also what makes the dial honest: because the engine has no
dependencies, it runs in the browser on every slider tick, so what the slider
says can never disagree with the formal decision.

## The rules

Given by the exercise, not researched. In `SWISS_RULES` in `lib/types.ts`.

| Rule | Value |
|---|---|
| Minimum equity | 20% of the purchase price |
| Minimum hard equity (not from the pension fund) | 10% of the purchase price |
| Imputed interest rate | 5% on the full mortgage |
| Maintenance and running costs | 1% of the purchase price per year |
| First mortgage | up to ⅔ of property value, no repayment |
| Second mortgage | the part above, repaid over 15 years |
| Affordability limit | interest + maintenance + amortization ≤ ⅓ of gross income |

## The three sample buyers

Bundled in `samples/`. Each is one applicant at a time — there is no batch view;
"all three get the right answer" just means running it three times.

| | Price | Result | Why |
|---|---|---|---|
| **Thomas Meier** | 900,000 | **Approve** | cost ratio 30.7% |
| **Nicole Baumgartner** | 1,100,000 | **Reject** | hard equity only 6.4% — 160,000 of her 230,000 down payment is a pension withdrawal. Affordability itself is fine at 24.5% |
| **Daniel Schmid** | 1,250,000 | **Reject** | affordability 40.1% against a 33.3% limit |

Daniel is also the dossier that disagrees with itself. The consistency check
finds exactly two things:

1. His application claims CHF 190,000 gross "incl. expected bonus"; his
   Lohnausweis documents CHF 175,000 with a bonus of zero. The engine uses the
   documented figure — he fails either way, but for the right reason.
2. His debt register extract carries a CHF 2,340 tax collection from March 2024,
   settled that May, which his application does not mention.

## What would make it pass

For a rejection the app solves, in closed form, the three things a buyer can
actually change, then **re-runs each candidate through the rule engine** and only
offers the ones that come back passing. For Daniel:

- bring CHF 101,000 more equity, or
- reduce the price to CHF 1,106,700, or
- add a co-borrower with CHF 35,400 of income.

## Tests

```bash
npm test             # both suites
npm run test:rules   # the rule engine, incl. the worked example
npm run test:extraction  # reads the real sample PDFs and checks every figure
npm run check        # tsc --noEmit
```

154 assertions. The rule tests pin the worked example (58,889 total yearly cost,
176,667 required income) and each sample buyer's verdict and reason. The
extraction tests read the actual PDFs off disk and compare every figure against
a hand transcription, so the parser cannot drift into producing confident credit
decisions from misread numbers.

## Extraction

The seven PDFs go to Claude as native `document` blocks — no PDF parsing library
in the path — and come back as structured JSON via `messages.parse()`. Every
figure carries the filename and the label printed beside it on the page, which is
what lets the consistency check name *which two documents* disagree and lets the
buyer check any number against its source.

Set a key to use it:

```bash
cp .env.local.example .env.local   # then put your key in it
```

Without a key the app falls back to a deterministic pattern parser
(`lib/fallback.ts`). It reads these particular documents correctly — the
extraction test proves it — but it is insurance for the demo, not the point:
a regex cannot read a scan. Either engine is named in the UI so you always know
which one produced the figures.

Both engines refuse rather than guess: `assertPlausible` throws if the price,
income or equity could not be read, because a credit check that silently assesses
a dossier it failed to read is worse than one that admits it.

## Layout

```
lib/
  types.ts        the rule sheet, and the two data layers
  rules.ts        the engine: assess() and proposeFixes()   ← no dependencies
  consistency.ts  where the seven documents disagree
  decision.ts     checks → a proposed decision
  extract.ts      Claude reads the PDFs
  fallback.ts     pattern parser, for no-API-key
  shape.ts        the shape both engines produce, and the plausibility guard
  kreditantrag.ts the credit proposal, drafted or templated
  analyze.ts      the nine stages, in order
  samples.ts      the three dossiers, transcribed by hand (test ground truth)
app/
  page.tsx        landing → verdict → dial → detail
  api/analyze     upload a dossier
  api/sample      run a bundled sample through the same pipeline
  api/reassess    recompute after a human corrects a figure
components/
  Simulator.tsx   the sliders, running the real engine client-side
scripts/
  dumptext.mjs    print what unpdf reads from a PDF, for writing patterns
```

## Dropping this into another app

`lib/` is deliberately free of framework imports. The whole thing is one
function and one JSON-serializable result:

```ts
import { analyzeUpload } from "./lib/analyze";

const result = await analyzeUpload(files, { apiKey });  // files: {name, bytes}[]
```

`AnalysisResult` carries everything the UI renders — extraction with provenance,
missing documents, findings, assessment, fixes, decision, and the Kreditantrag as
markdown — as plain numbers, strings and arrays, so it crosses a tRPC or `fetch`
boundary unchanged.

**On Cloudflare Workers:** `rules.ts`, `consistency.ts`, `decision.ts`,
`types.ts`, `shape.ts`, `samples.ts` and `analyze.ts` move as-is. Only two things
touch Node — `Buffer` for base64 in `extract.ts` (needs the `nodejs_compat` flag,
or a short `Uint8Array` swap) and `unpdf` in `fallback.ts`, which is fallback-only
and can be deleted outright. The Anthropic SDK is fetch-based and runs there.

## Notes on the design

- **A status is never colour alone.** Green and red sit 4.1 ΔE apart under
  deuteranopia, so every pass or fail carries an icon and a word as well as the
  colour. The financing split is stepped from one hue with each segment directly
  labelled, rather than three competing colours.
- **Detail is disclosed, not dumped.** The page leads with the answer; the
  arithmetic, the extracted figures and the bank's paperwork are folded away for
  whoever wants to audit them.
- **Corrections are free.** Editing a misread figure re-runs the arithmetic
  without re-reading the PDFs or spending an API call.

## Not done

- The bank's own property valuation is supported by the engine (`bankValuation`,
  which makes it calculate on the lower of price and valuation) but no sample
  document carries one, so nothing in the UI sets it.
- Couples with two incomes and two pension funds, indirect amortization via
  pillar 3a, and recalculating affordability at retirement age are all in the
  exercise's "full process" list and are not built.
- Nothing is persisted. Reloading the page loses the dossier.
