import { useMemo, useState } from "react";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  LocalActivityEvent,
  LocalActivityEventType,
  LocalAppSnapshot,
} from "../../api-types";
import { formatDateTime } from "../../format";
import { activityEventTypeVariant, statusVariant } from "../../status";

type LogEventFilterState = Record<LocalActivityEventType, boolean>;
type LogEventTypeCounts = Record<LocalActivityEventType, number>;

const DEFAULT_LOG_FILTERS: LogEventFilterState = {
  sync_run: true,
  webhook_delivery: true,
  ledger_write: true,
  export: true,
  report_refresh: true,
  rule_application: true,
  warning: true,
  error: true,
};

const LOG_EVENT_TYPE_LABELS: Readonly<Record<LocalActivityEventType, string>> =
  {
    sync_run: "Sync runs",
    webhook_delivery: "Webhook deliveries",
    ledger_write: "Ledger writes",
    report_refresh: "Report refreshes",
    export: "Exports",
    rule_application: "Rule application",
    warning: "Warnings",
    error: "Errors",
  };

function activityEventCounts(
  events: readonly LocalActivityEvent[],
): LogEventTypeCounts {
  const counts: LogEventTypeCounts = {
    sync_run: 0,
    webhook_delivery: 0,
    ledger_write: 0,
    export: 0,
    report_refresh: 0,
    rule_application: 0,
    warning: 0,
    error: 0,
  };

  for (const event of events) {
    counts[event.type] += 1;
  }

  return counts;
}

function LogsEventRow({ event }: { event: LocalActivityEvent }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{event.title}</CardTitle>
            <CardDescription>
              {formatDateTime(event.timestamp)} · {event.source}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={activityEventTypeVariant(event.type)}>
              {LOG_EVENT_TYPE_LABELS[event.type]}
            </Badge>
            <Badge variant={statusVariant(event.severity)}>
              {event.severity}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{event.details}</p>
        {event.referenceId ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Reference {event.referenceId}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LogsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] =
    useState<LogEventFilterState>(DEFAULT_LOG_FILTERS);

  const events = snapshot?.activityEvents ?? [];
  const eventCounts = useMemo(() => activityEventCounts(events), [events]);
  const activeFiltersCount = useMemo(
    () => Object.values(activeFilters).filter(Boolean).length,
    [activeFilters],
  );
  const searchValue = search.trim().toLowerCase();

  const visibleEvents = useMemo(() => {
    if (events.length === 0) {
      return [];
    }

    return events.filter((event) => {
      if (!activeFilters[event.type]) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      const text =
        `${event.title} ${event.details} ${event.source} ${event.referenceId ?? ""}`.toLowerCase();

      return text.includes(searchValue);
    });
  }, [events, activeFilters, searchValue]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics timeline</CardTitle>
          <CardDescription>
            Filtered sync, webhook, export, rule, warning, and error events from
            the local activity stream.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              Object.keys(
                DEFAULT_LOG_FILTERS,
              ) as readonly LocalActivityEventType[]
            ).map((type) => (
              <Button
                key={type}
                size="sm"
                type="button"
                variant={activeFilters[type] ? "default" : "outline"}
                onClick={() =>
                  setActiveFilters((current) => ({
                    ...current,
                    [type]: !current[type],
                  }))
                }
              >
                {LOG_EVENT_TYPE_LABELS[type]}
                <Badge
                  className="ml-2"
                  variant={activeFilters[type] ? "secondary" : "outline"}
                >
                  {eventCounts[type]}
                </Badge>
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Search event messages
            </Label>
            <Input
              type="search"
              placeholder="Search by title, details, or reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {activeFiltersCount === 0
              ? "No filters enabled"
              : `${activeFiltersCount} of ${Object.keys(DEFAULT_LOG_FILTERS).length} filter groups enabled`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Latest local activity</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "No activity events yet"
              : `${visibleEvents.length} event(s) match current filters`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No activity yet</AlertTitle>
              <AlertDescription>
                Run sync and webhook reconciliation to seed local diagnostics.
              </AlertDescription>
            </Alert>
          ) : visibleEvents.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No matching events</AlertTitle>
              <AlertDescription>
                Adjust search text or enable filters to show matching events.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3">
              {visibleEvents.map((event) => (
                <LogsEventRow event={event} key={event.id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
