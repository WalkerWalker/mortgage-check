"use client";

/**
 * What the model read, and where each figure came from.
 *
 * Two things make this more than a debug dump. Every figure names its source
 * document and the label printed beside it, so a credit officer can verify any
 * number against the page; and the five figures the rule engine actually
 * consumes are editable, so a misread can be corrected and the decision
 * re-derived without paying to read the PDFs again.
 */

import { useState } from "react";
import { fmt } from "@/lib/rules";
import type { ExtractedDossier, Sourced } from "@/lib/types";
import { Provenance } from "./ui";

/** The five figures that drive the decision; see `toRuleInput`. */
export type EditableField =
  | "price"
  | "grossIncome"
  | "bankStatementTotal"
  | "wefRequested"
  | "statedIncome";

interface Row {
  label: string;
  sourced: Sourced<number>;
  field?: EditableField;
  /** Set when the engine uses this figure over a competing one. */
  authoritative?: boolean;
}

export function ExtractedTable({
  dossier,
  onEdit,
  busy,
}: {
  dossier: ExtractedDossier;
  onEdit: (field: EditableField, value: number) => void;
  busy: boolean;
}) {
  const groups: { heading: string; rows: Row[] }[] = [
    {
      heading: "Property",
      rows: [
        {
          label: "Purchase price (application)",
          sourced: dossier.property.priceOnApplication,
          field: "price",
          authoritative: true,
        },
        {
          label: "Sale price (sales documentation)",
          sourced: dossier.property.priceOnSalesDoc,
        },
      ],
    },
    {
      heading: "Income",
      rows: [
        {
          label: "Gross income claimed on the form",
          sourced: dossier.income.statedOnApplication,
          field: "statedIncome",
        },
        {
          label: "Gross salary documented",
          sourced: dossier.income.grossOnLohnausweis,
          field: "grossIncome",
          authoritative: true,
        },
        { label: "Net salary", sourced: dossier.income.netOnLohnausweis },
        { label: "Net salary on tax return", sourced: dossier.income.netOnTaxReturn },
        {
          label: "Insured salary",
          sourced: dossier.income.insuredSalaryOnPensionStatement,
        },
      ],
    },
    {
      heading: "Equity",
      rows: [
        {
          label: "Accounts claimed on the form",
          sourced: dossier.equity.bankAccountsOnApplication,
        },
        {
          label: "Securities claimed on the form",
          sourced: dossier.equity.securitiesOnApplication,
        },
        {
          label: "Pension withdrawal on the form",
          sourced: dossier.equity.pensionWithdrawalOnApplication,
        },
        { label: "Equity total on the form", sourced: dossier.equity.totalOnApplication },
        {
          label: "Total per bank statement",
          sourced: dossier.equity.totalOnBankStatement,
          field: "bankStatementTotal",
          authoritative: true,
        },
        {
          label: "— accounts",
          sourced: dossier.equity.accountsOnBankStatement,
        },
        {
          label: "— securities",
          sourced: dossier.equity.securitiesOnBankStatement,
        },
        { label: "Bank assets on tax return", sourced: dossier.equity.bankAssetsOnTaxReturn },
        { label: "Debts on tax return", sourced: dossier.equity.debtsOnTaxReturn },
      ],
    },
    {
      heading: "Pension (pillar 2)",
      rows: [
        { label: "Retirement assets", sourced: dossier.pension.assets },
        { label: "Maximum WEF withdrawal available", sourced: dossier.pension.maxWefAvailable },
        {
          label: "WEF withdrawal requested",
          sourced: dossier.pension.wefRequested,
          field: "wefRequested",
          authoritative: true,
        },
        { label: "Already withdrawn", sourced: dossier.pension.wefAlreadyWithdrawn },
      ],
    },
    {
      heading: "Request",
      rows: [
        { label: "Mortgage requested", sourced: dossier.mortgageRequested },
        { label: "Yearly obligations", sourced: dossier.obligationsPerYear },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="max-w-md text-[13px] text-ink-2">
          {dossier.engine === "claude"
            ? "Read from your PDFs. Every figure shows where it came from, and the ones the decision rests on can be corrected."
            : "Read by pattern matching, with no API key configured. Every figure shows where it came from."}
        </p>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2">
          {dossier.engine === "claude" ? "claude-opus-5-5" : "pattern fallback"}
        </span>
      </div>

      <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto]">
        <div className="sm:col-span-2 mb-3 grid gap-1 text-[13px] text-ink-2 sm:grid-cols-2">
          <div>
            <span className="text-ink-3">Applicant</span>{" "}
            <span className="font-medium text-ink">{dossier.applicantName}</span>
            {dossier.dateOfBirth && <span> · born {dossier.dateOfBirth}</span>}
          </div>
          <div>
            <span className="text-ink-3">Employer</span>{" "}
            <span className="text-ink">{dossier.employer}</span>
          </div>
          <div>
            <span className="text-ink-3">Address</span>{" "}
            <span className="text-ink">{dossier.address}</span>
          </div>
          <div>
            <span className="text-ink-3">Property</span>{" "}
            <span className="text-ink">
              {dossier.property.description}
              {dossier.property.address ? `, ${dossier.property.address}` : ""}
            </span>
          </div>
        </div>
      </dl>

      <div className="divide-y divide-line">
        {groups.map((g) => (
          <div key={g.heading} className="py-3 first:pt-0 last:pb-0">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              {g.heading}
            </h3>
            <div className="space-y-1.5">
              {g.rows.map((row) => (
                <FigureRow
                  key={row.label}
                  row={row}
                  onEdit={onEdit}
                  busy={busy}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="py-3 last:pb-0">
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Debt enforcement register
          </h3>
          {dossier.debtRegister.hasEntries ? (
            <ul className="space-y-1 text-[13px]">
              {dossier.debtRegister.entries.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tnum font-medium">
                    {e.date} · CHF {fmt(e.amount)}
                  </span>
                  <span className="text-ink-2">
                    {e.creditor} — {e.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">
              No entries recorded in the last five years.
            </p>
          )}
          <div className="mt-1">
            <Provenance document={dossier.debtRegister.document} label="" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FigureRow({
  row,
  onEdit,
  busy,
}: {
  row: Row;
  onEdit: (field: EditableField, value: number) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editable = row.field !== undefined;

  const commit = () => {
    if (draft === null || !row.field) return;
    const parsed = Number.parseFloat(draft.replace(/['’,\s]/g, ""));
    setDraft(null);
    if (Number.isFinite(parsed) && parsed !== row.sourced.value) {
      onEdit(row.field, parsed);
    }
  };

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="text-ink">{row.label}</span>
          {row.authoritative && (
            <span
              className="rounded border border-line px-1 text-[10px] font-semibold tracking-wide text-ink-3 uppercase"
              title="The rule engine uses this figure"
            >
              used
            </span>
          )}
        </div>
        <Provenance document={row.sourced.document} label={row.sourced.label} />
      </div>

      {editable ? (
        <input
          className="tnum w-32 rounded border border-line bg-surface px-2 py-0.5 text-right text-[13px] font-medium focus:border-accent focus:outline-none disabled:opacity-50"
          value={draft ?? fmt(row.sourced.value)}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setDraft(String(row.sourced.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(null);
          }}
          aria-label={`${row.label}, editable`}
        />
      ) : (
        <span className="tnum w-32 pr-2 text-right text-[13px] text-ink">
          {fmt(row.sourced.value)}
        </span>
      )}
    </div>
  );
}
