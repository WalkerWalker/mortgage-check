"use client";

/**
 * Can this buyer get this mortgage?
 *
 * The page is written for the person buying the home, not the bank. It leads
 * with the answer in one line, then a dial they can move to find out what it
 * would take, and only then the bank's own paperwork — the arithmetic, the
 * document findings, the Kreditantrag — folded away for whoever needs it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArithmeticDisclosure,
  ChecksSummary,
  Completeness,
  FindingsList,
} from "@/components/ChecksPanel";
import { DecisionCard } from "@/components/DecisionCard";
import { Dropzone } from "@/components/Dropzone";
import { ExtractedTable, type EditableField } from "@/components/ExtractedTable";
import { FixesPanel } from "@/components/FixesPanel";
import { KreditantragView } from "@/components/KreditantragView";
import { Simulator } from "@/components/Simulator";
import { Disclosure, Section } from "@/components/ui";
import {
  analyzeInBrowser,
  analyzeSampleInBrowser,
  SAMPLE_FILES,
  SAMPLE_FOLDERS,
} from "@/lib/client-analyze";
import { assessCore } from "@/lib/analyze-core";
import { fmt, pct } from "@/lib/rules";
import type { AnalysisResult, ExtractedDossier, RuleInput } from "@/lib/types";

/**
 * The browser runs the whole deterministic pipeline everywhere, static build or
 * not, so that the local app and the public site behave identically and no
 * document is uploaded unless the reader explicitly asks for an AI read.
 */
const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Page() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [signedOff, setSignedOff] = useState<"approved" | "rejected" | null>(null);

  /**
   * Whether an AI read can be offered, and whether the reader wants one.
   *
   * Off by default everywhere. Reading with Claude means sending the documents
   * to a server, so it is something the reader turns on deliberately rather
   * than the default they have to notice and turn off.
   */
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [useClaude, setUseClaude] = useState(false);

  useEffect(() => {
    if (STATIC) return;
    let cancelled = false;
    void fetch("/api/status")
      .then((r) => (r.ok ? r.json() : { claudeAvailable: false }))
      .then((d: { claudeAvailable?: boolean }) => {
        if (!cancelled) setClaudeAvailable(Boolean(d.claudeAvailable));
      })
      .catch(() => {
        /* No server, or no key. Either way the AI read is not on offer. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Run a step that produces a result, whether locally or on the server. */
  const run = useCallback(
    async (fn: () => Promise<AnalysisResult>, stageLabel: string) => {
      setBusy(true);
      setStage(stageLabel);
      setError(null);
      try {
        setResult(await fn());
        setSignedOff(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "The check could not be completed.",
        );
      } finally {
        setBusy(false);
        setStage(null);
      }
    },
    [],
  );

  /** POST to a server route, unwrapping its error shape. */
  const post = useCallback(async (url: string, body: BodyInit, json: boolean) => {
    const response = await fetch(url, {
      method: "POST",
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body,
    });
    const data = (await response.json()) as AnalysisResult | { error: string };
    if (!response.ok || "error" in data) {
      throw new Error(
        "error" in data ? data.error : "The check could not be completed.",
      );
    }
    return data;
  }, []);

  // The AI read is the only path that leaves the machine, and only when asked.
  const viaClaude = claudeAvailable && useClaude;

  const onFiles = useCallback(
    (files: File[]) => {
      void run(
        () => {
          if (!viaClaude) return analyzeInBrowser(files);
          const body = new FormData();
          for (const f of files) body.append("files", f);
          return post("/api/analyze", body, false);
        },
        viaClaude
          ? `Claude is reading your ${files.length} documents…`
          : `Reading your ${files.length} documents…`,
      );
    },
    [run, post, viaClaude],
  );

  const onSample = useCallback(
    (id: string) => {
      void run(
        () =>
          viaClaude
            ? post("/api/sample", JSON.stringify({ id }), true)
            : analyzeSampleInBrowser(SAMPLE_FOLDERS[id], SAMPLE_FILES, BASE_PATH),
        viaClaude ? "Claude is reading the documents…" : "Reading the documents…",
      );
    },
    [run, post, viaClaude],
  );

  // Re-running the arithmetic after a correction never needs a server: the rule
  // engine is pure, so it runs in the browser whichever engine did the reading.
  const onEdit = useCallback(
    (field: EditableField, value: number) => {
      if (!result) return;
      const edited = applyEdit(result.extracted, field, value);
      void run(() => Promise.resolve(assessCore(edited)), "Recalculating…");
    },
    [result, run],
  );

  // Redrafting is the one action that genuinely needs the API, so it is only
  // offered where a server exists to hold the key.
  const onRedraft = useCallback(() => {
    if (!result || !claudeAvailable) return;
    void run(
      () =>
        post(
          "/api/reassess",
          JSON.stringify({ extracted: result.extracted, redraft: true }),
          true,
        ),
      "Writing the credit proposal…",
    );
  }, [result, run, post, claudeAvailable]);

  const documented: RuleInput | null = useMemo(() => {
    if (!result) return null;
    const a = result.assessment;
    return {
      purchasePrice: a.purchasePrice,
      bankValuation:
        a.valuation < a.purchasePrice ? a.valuation : undefined,
      grossIncome: a.grossIncome,
      hardEquity: a.hardEquity,
      pensionEquity: a.pensionEquity,
    };
  }, [result]);

  // ---------------------------------------------------------------- landing
  if (!result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-ink-3 uppercase">
            Swiss mortgage check
          </p>
          <h1 className="display mt-3 text-[44px] text-ink sm:text-[52px]">
            Can you get
            <br />
            this mortgage?
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
            Upload the documents your bank asks for. You will get a straight answer
            against the Swiss lending rules, and the numbers behind it.
          </p>

          <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
            <span
              aria-hidden
              className="mt-[3px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-bold text-white"
              style={{ background: viaClaude ? "var(--color-warning)" : "var(--color-good)" }}
            >
              {viaClaude ? "!" : "✓"}
            </span>
            <span>
              {viaClaude ? (
                <>
                  Your documents will be{" "}
                  <strong className="font-medium text-ink">sent to the Anthropic
                  API</strong> to be read. Turn this off below to keep them on your
                  computer.
                </>
              ) : (
                <>
                  Your documents are read{" "}
                  <strong className="font-medium text-ink">in this browser</strong> and
                  are never uploaded. Nothing you add here leaves your computer.
                </>
              )}
            </span>
          </p>

          {/* Shown only where a server holds a key, so it cannot promise
              something the deployment cannot deliver. */}
          {claudeAvailable && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
              <input
                type="checkbox"
                checked={useClaude}
                onChange={(e) => setUseClaude(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="text-[13px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">Read the documents with Claude</span>{" "}
                instead of pattern matching. Handles any layout, including scans, and
                reports the printed label each figure came from — but the documents
                leave your computer. The decision itself is the same arithmetic either
                way.
              </span>
            </label>
          )}

          <div className="mt-9">
            <Dropzone
              onFiles={onFiles}
              onSample={onSample}
              busy={busy}
              stage={stage}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <p className="text-[13px] font-medium text-ink">That did not work</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{error}</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------- result
  const a = result.assessment;
  const good = a.passed;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* Asked for an AI read and did not get one. The server falls back rather
          than failing, which is right, but it must not pass unmentioned. */}
      {viaClaude && result.extracted.engine === "pattern-fallback" && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          <span
            aria-hidden
            className="mt-[3px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-bold text-white"
            style={{ background: "var(--color-warning)" }}
          >
            !
          </span>
          <span>
            Claude could not read these documents, so they were read by pattern
            matching instead. The figures below come from that read — check them
            against your documents before relying on them.
          </span>
        </p>
      )}

      <Verdict result={result} />

      {documented && (
        <div className="mt-8">
          <Simulator
            documented={documented}
            maxPension={result.extracted.pension.maxWefAvailable.value}
          />
        </div>
      )}

      {!good && result.fixes.length > 0 && (
        <div className="mt-8">
          <FixesPanel fixes={result.fixes} />
        </div>
      )}

      <div className="mt-10 space-y-0">
        <Section
          title="The three checks"
          note="As your documents read today, against the Swiss lending rules."
        >
          <ChecksSummary result={result} />
        </Section>

        <div className="mt-8">
          <Disclosure
            summary={
              result.findings.length === 0
                ? "Your documents agree with each other"
                : `${result.findings.length} thing${result.findings.length === 1 ? "" : "s"} in your documents need${result.findings.length === 1 ? "s" : ""} explaining`
            }
            hint={result.findings.length === 0 ? "nothing to flag" : "the bank will ask"}
            defaultOpen={result.findings.length > 0}
          >
            <FindingsList result={result} />
          </Disclosure>

          <ArithmeticDisclosure result={result} />

          <Disclosure
            summary="Your documents"
            hint={`${result.extracted.documentsPresent.length} of 7`}
          >
            <div className="space-y-5">
              <Completeness result={result} />
              <ExtractedTable
                dossier={result.extracted}
                onEdit={onEdit}
                busy={busy}
              />
            </div>
          </Disclosure>

          <Disclosure summary="For the bank" hint="credit proposal and sign-off">
            <div className="space-y-5">
              <DecisionCard
                decision={result.decision}
                signedOff={signedOff}
                onSignOff={setSignedOff}
              />
              <KreditantragView
                markdown={result.kreditantrag}
                engine={result.draftEngine}
                onRedraft={claudeAvailable ? onRedraft : undefined}
                busy={busy}
              />
            </div>
          </Disclosure>
        </div>
      </div>

      <footer className="mt-10 border-t border-line pt-5">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setError(null);
          }}
          className="text-[13px] text-ink-2 underline decoration-line underline-offset-2 hover:text-ink"
        >
          Check another dossier
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          An indication, not an offer. The figures follow the rule sheet your bank
          applies — 20% down payment of which 10% not from your pension, costs
          calculated at a 5% imputed rate, and total costs at most a third of gross
          income — but only your bank can approve a mortgage.
        </p>
      </footer>
    </main>
  );
}

/** The answer, in one line, before anything else. */
function Verdict({ result }: { result: AnalysisResult }) {
  const a = result.assessment;
  const incomplete = result.missingDocuments.length > 0;
  const failing = a.checks.filter((c) => c.status === "fail");

  const headline = incomplete
    ? "Some documents are missing"
    : a.passed
      ? "Yes — this mortgage works"
      : "Not yet";

  const colour = incomplete
    ? "var(--color-serious)"
    : a.passed
      ? "var(--color-good)"
      : "var(--color-critical)";

  const icon = incomplete ? "?" : a.passed ? "✓" : "✕";

  let detail: string;
  if (incomplete) {
    detail = `${result.missingDocuments.length} of the seven documents are not here: ${result.missingDocuments
      .map((m) => m.label)
      .join(", ")}. Add them and the check can be completed.`;
  } else if (a.passed) {
    detail =
      `On a price of CHF ${fmt(a.purchasePrice)} with CHF ${fmt(a.totalEquity)} down, ` +
      `your mortgage would be CHF ${fmt(a.mortgage)}. That costs CHF ${fmt(a.totalYearlyCost / 12)} ` +
      `a month, which is ${pct(a.costRatio)} of your income — inside the one third limit.`;
  } else if (failing.some((c) => c.id === "affordability") && failing.length === 1) {
    detail =
      `The place is affordable up to a third of your income. At CHF ${fmt(a.purchasePrice)} ` +
      `the yearly costs come to CHF ${fmt(a.totalYearlyCost)}, which is ${pct(a.costRatio)} of ` +
      `CHF ${fmt(a.grossIncome)}. You would need CHF ${fmt(a.requiredGrossIncome)} of income to borrow this much.`;
  } else if (failing.some((c) => c.id === "hardEquity")) {
    detail =
      `Your down payment of CHF ${fmt(a.totalEquity)} is big enough overall, but only ` +
      `CHF ${fmt(a.hardEquity)} of it is your own cash. At least 10% of the price — ` +
      `CHF ${fmt(a.purchasePrice * 0.1)} — cannot come from your pension fund.`;
  } else {
    detail =
      `Your down payment of CHF ${fmt(a.totalEquity)} is ${pct(a.equityShare)} of the price. ` +
      `At least 20% is required, which is CHF ${fmt(a.purchasePrice * 0.2)}.`;
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: colour }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-medium tracking-[0.14em] text-ink-3 uppercase">
          {result.extracted.applicantName || "Your application"}
        </span>
      </div>
      <h1 className="display mt-3 text-[40px] text-ink sm:text-[46px]">{headline}</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">{detail}</p>
    </div>
  );
}

/**
 * Write a corrected figure back into the extraction.
 *
 * Only the five figures the rule engine consumes are editable, so this switch
 * is exhaustive over `EditableField` by construction.
 */
function applyEdit(
  d: ExtractedDossier,
  field: EditableField,
  value: number,
): ExtractedDossier {
  const edit = <T,>(s: { value: T; document: string; label: string }, v: T) => ({
    ...s,
    value: v,
    label: `${s.label} (corrected)`,
  });

  switch (field) {
    case "price":
      return {
        ...d,
        property: {
          ...d.property,
          priceOnApplication: edit(d.property.priceOnApplication, value),
        },
      };
    case "grossIncome":
      return {
        ...d,
        income: { ...d.income, grossOnLohnausweis: edit(d.income.grossOnLohnausweis, value) },
      };
    case "statedIncome":
      return {
        ...d,
        income: { ...d.income, statedOnApplication: edit(d.income.statedOnApplication, value) },
      };
    case "bankStatementTotal":
      return {
        ...d,
        equity: { ...d.equity, totalOnBankStatement: edit(d.equity.totalOnBankStatement, value) },
      };
    case "wefRequested":
      return {
        ...d,
        pension: { ...d.pension, wefRequested: edit(d.pension.wefRequested, value) },
      };
  }
}
