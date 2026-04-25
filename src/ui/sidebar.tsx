import type {
  AutomaticFittingResult,
  ComponentPerformanceResult,
  RouteAnalysisResult,
  RouteSystemSummary
} from "../calc";
import type { NetworkComponent } from "../components";
import type { DuctNode } from "../core/nodes";
import { Properties } from "./properties";

interface SidebarProps {
  documentCounts: {
    nodes: number;
    ducts: number;
    terminals: number;
  };
  analysis: RouteAnalysisResult | null;
  analysisError: string | null;
  selectedNode: DuctNode | null;
  selectedNodeFittings: AutomaticFittingResult[];
  selectedComponent: NetworkComponent | null;
  selectedComponentResult: ComponentPerformanceResult | null;
  selectedDuctAirSystemLabel: string | null;
  onNodeLabelChange: (value: string) => void;
  onComponentLabelChange: (value: string) => void;
  onAhuSystemTypeChange: (value: "supply" | "exhaust" | "mixed") => void;
  onAhuRotationChange: (value: number) => void;
  selectedAhuConnectedDuctCount: number;
  onAhuDimensionChange: (
    dimension: "widthMeters" | "depthMeters" | "heightMeters",
    value: number
  ) => void;
  onAhuDevicePressureLossChange: (value: number) => void;
  onAhuFanRunningChange: (value: boolean) => void;
  onTerminalFlowRateChange: (value: number) => void;
  onTerminalTypeChange: (
    value: "supply" | "exhaust" | "outdoor" | "exhaustAir"
  ) => void;
  onTerminalReferencePressureLossChange: (value: number) => void;
  onTerminalReferencePressureLossReset: () => void;
  onDuctDiameterChange: (value: number) => void;
  onDuctLocalLossChange: (value: number) => void;
  onAutomaticFittingLossChange: (
    fitting: AutomaticFittingResult,
    value: number
  ) => void;
  onAutomaticFittingReset: (fitting: AutomaticFittingResult) => void;
}

export function Sidebar({
  documentCounts,
  analysis,
  analysisError,
  selectedNode,
  selectedNodeFittings,
  selectedComponent,
  selectedComponentResult,
  selectedDuctAirSystemLabel,
  onNodeLabelChange,
  onComponentLabelChange,
  onAhuSystemTypeChange,
  onAhuRotationChange,
  selectedAhuConnectedDuctCount,
  onAhuDimensionChange,
  onAhuDevicePressureLossChange,
  onAhuFanRunningChange,
  onTerminalFlowRateChange,
  onTerminalTypeChange,
  onTerminalReferencePressureLossChange,
  onTerminalReferencePressureLossReset,
  onDuctDiameterChange,
  onDuctLocalLossChange,
  onAutomaticFittingLossChange,
  onAutomaticFittingReset
}: SidebarProps) {
  return (
    <aside className="analysis-sidebar">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <p className="section-kicker">Live overview</p>
          <h3>Network status</h3>
        </div>
        <div className="metric-grid">
          <article>
            <span>Nodes</span>
            <strong>{documentCounts.nodes}</strong>
          </article>
          <article>
            <span>Ducts</span>
            <strong>{documentCounts.ducts}</strong>
          </article>
          <article>
            <span>Terminals</span>
            <strong>{documentCounts.terminals}</strong>
          </article>
          <article>
            <span>Supply flow</span>
            <strong>
              {analysis ? `${analysis.systems.supply.totalFlowRateLps.toFixed(0)} L/s` : "N/A"}
            </strong>
          </article>
          <article>
            <span>Extract air flow</span>
            <strong>
              {analysis ? `${analysis.systems.exhaust.totalFlowRateLps.toFixed(0)} L/s` : "N/A"}
            </strong>
          </article>
          <article>
            <span>Supply fan pressure</span>
            <strong>{formatPressure(analysis?.systems.fanPressure.supplyFanPressurePa)}</strong>
          </article>
          <article>
            <span>Extract fan pressure</span>
            <strong>{formatPressure(analysis?.systems.fanPressure.exhaustFanPressurePa)}</strong>
          </article>
          <article>
            <span>Max imbalance</span>
            <strong>
              {analysis
                ? `${analysis.balancing.maxPressureDifferencePa.toFixed(2)} Pa`
                : "N/A"}
            </strong>
          </article>
        </div>
        {!analysis && !analysisError ? (
          <p className="sidebar-empty">
            Place an AHU, add one or more terminals, then connect them with ducts
            to unlock route analysis.
          </p>
        ) : null}
        {analysisError ? (
          <p className="sidebar-warning">{analysisError}</p>
        ) : null}
      </section>

        <Properties
        selectedNode={selectedNode}
        selectedNodeFittings={selectedNodeFittings}
        selectedComponent={selectedComponent}
        selectedComponentResult={selectedComponentResult}
        selectedDuctAirSystemLabel={selectedDuctAirSystemLabel}
        onNodeLabelChange={onNodeLabelChange}
        onComponentLabelChange={onComponentLabelChange}
        onAhuSystemTypeChange={onAhuSystemTypeChange}
        onAhuRotationChange={onAhuRotationChange}
        selectedAhuConnectedDuctCount={selectedAhuConnectedDuctCount}
        onAhuDimensionChange={onAhuDimensionChange}
        onAhuDevicePressureLossChange={onAhuDevicePressureLossChange}
        onAhuFanRunningChange={onAhuFanRunningChange}
        onTerminalFlowRateChange={onTerminalFlowRateChange}
        onTerminalTypeChange={onTerminalTypeChange}
        onTerminalReferencePressureLossChange={
          onTerminalReferencePressureLossChange
        }
        onTerminalReferencePressureLossReset={onTerminalReferencePressureLossReset}
        onDuctDiameterChange={onDuctDiameterChange}
        onDuctLocalLossChange={onDuctLocalLossChange}
        onAutomaticFittingLossChange={onAutomaticFittingLossChange}
        onAutomaticFittingReset={onAutomaticFittingReset}
      />

      <section className="sidebar-section" aria-label="Route analysis">
        <div className="sidebar-section-header">
          <p className="section-kicker">Routes</p>
          <h3>System routes</h3>
        </div>

        {analysis ? (
          <>
            <div className="fan-summary-grid">
              <article className="critical-card">
                <span>Supply fan</span>
                <strong>{formatPressure(analysis.systems.fanPressure.supplyFanPressurePa)}</strong>
                <p>
                  {formatFanPressureFormula(
                    analysis.systems.outdoor.criticalPath,
                    analysis.systems.supply.criticalPath,
                    "Outdoor side",
                    "supply side"
                  )}
                </p>
              </article>
              <article className="critical-card">
                <span>Extract fan</span>
                <strong>{formatPressure(analysis.systems.fanPressure.exhaustFanPressurePa)}</strong>
                <p>
                  {formatFanPressureFormula(
                    analysis.systems.exhaust.criticalPath,
                    analysis.systems.exhaustAir.criticalPath,
                    "Extract side",
                    "exhaust side"
                  )}
                </p>
              </article>
            </div>

            <JoinedCriticalRoutesSection analysis={analysis} />

            <div className="route-system-list">
              <RouteSystemSection
                summary={analysis.systems.supply}
                title="Supply routes"
                emptyMessage="Add connected supply terminals to inspect the supply-side critical path."
              />
              <RouteSystemSection
                summary={analysis.systems.exhaust}
                title="Extract air routes"
                emptyMessage="Add connected extract air terminals to inspect the extract-side critical path."
              />
              <RouteSystemSection
                summary={analysis.systems.outdoor}
                title="Outdoor air path"
                emptyMessage="Outdoor air intake paths appear here when an outdoor terminal is connected."
              />
              <RouteSystemSection
                summary={analysis.systems.exhaustAir}
                title="Exhaust path"
                emptyMessage="Exhaust discharge paths appear here when an exhaust terminal is connected."
              />
            </div>
          </>
        ) : (
          <p className="sidebar-empty">
            Connected terminal routes appear here once the network is analyzable.
          </p>
        )}
      </section>

      <section className="sidebar-section" aria-label="Balancing analysis">
        <div className="sidebar-section-header">
          <p className="section-kicker">Balancing</p>
          <h3>Parallel branches</h3>
        </div>
        {analysis ? (
          <div className="balancing-system-list">
            <BalancingSystemSection
              title="Supply balancing"
              summary={analysis.systems.supply}
              emptyMessage="Connected supply terminals appear here with terminal-level balancing targets."
            />
            <BalancingSystemSection
              summary={analysis.systems.exhaust}
              title="Extract air balancing"
              emptyMessage="Connected extract air terminals appear here with terminal-level balancing targets."
            />
          </div>
        ) : (
          <p className="sidebar-empty">
            Balancing checks become available after route analysis is unlocked.
          </p>
        )}
      </section>
    </aside>
  );
}

interface JoinedCriticalRoutesSectionProps {
  analysis: RouteAnalysisResult;
}

function JoinedCriticalRoutesSection({
  analysis
}: JoinedCriticalRoutesSectionProps) {
  return (
    <section
      className="joined-critical-routes"
      aria-label="Joined critical routes"
    >
      <div className="route-system-header">
        <strong>Joined critical routes</strong>
        <span>Fan-side end-to-end paths</span>
      </div>
      <div className="joined-route-grid">
        <JoinedCriticalRouteCard
          title="Supply side"
          route={analysis.supplySideCriticalRoute}
          routes={analysis.routes}
          emptyMessage="Add both Outdoor air and Supply routes to show Outdoor -> AHU -> Supply."
        />
        <JoinedCriticalRouteCard
          title="Extract side"
          route={analysis.extractSideCriticalRoute}
          routes={analysis.routes}
          emptyMessage="Add both Extract air and Exhaust routes to show Extract -> AHU -> Exhaust."
        />
      </div>
    </section>
  );
}

interface JoinedCriticalRouteCardProps {
  title: string;
  route: RouteAnalysisResult["supplySideCriticalRoute"];
  routes: RouteAnalysisResult["routes"];
  emptyMessage: string;
}

function JoinedCriticalRouteCard({
  title,
  route,
  routes,
  emptyMessage
}: JoinedCriticalRouteCardProps) {
  if (!route) {
    return (
      <article className="route-card joined-route-card is-empty">
        <header>
          <strong>{title}</strong>
          <strong>N/A</strong>
        </header>
        <p>{emptyMessage}</p>
      </article>
    );
  }

  return (
    <article className="route-card joined-route-card is-joined-critical">
      <header>
        <strong>{title}</strong>
        <strong>{formatPressure(route.totalPressureLossPa)}</strong>
      </header>
      <div className="route-meta-row">
        <span className="route-type-chip">
          {formatTerminalLabel(routes, route.startTerminalId)}
        </span>
        <span>to</span>
        <span className="route-type-chip">
          {formatTerminalLabel(routes, route.endTerminalId)}
        </span>
      </div>
      <span>
        {route.nodePath.length - 1} spans, {route.componentIds.length} components
      </span>
      <details className="technical-details">
        <summary>Technical path</summary>
        <p>{route.componentIds.join(" -> ")}</p>
      </details>
    </article>
  );
}

interface RouteSystemSectionProps {
  summary: RouteSystemSummary;
  title: string;
  emptyMessage: string;
}

function RouteSystemSection({
  summary,
  title,
  emptyMessage
}: RouteSystemSectionProps) {
  return (
    <details className="route-system-section collapsible-section">
      <summary className="route-system-header collapsible-summary">
        <strong>{title}</strong>
        <span>
          {summary.routes.length} routes, {summary.totalFlowRateLps.toFixed(0)} L/s
        </span>
      </summary>

      {summary.routes.length > 0 ? (
        <div className="route-list">
          {summary.routes.map((route) => (
            <article
              key={route.terminalId}
              className={
                summary.criticalPath?.terminalId === route.terminalId
                  ? "route-card is-critical"
                  : "route-card"
              }
            >
              <header>
                <strong>{route.terminalLabel}</strong>
                <strong>{route.totalPressureLossPa.toFixed(2)} Pa</strong>
              </header>
              <div className="route-meta-row">
                <span className="route-type-chip">{describeTerminalType(route.terminalType)}</span>
                <span>{route.nodePath.length - 1} duct segments</span>
                <span>{route.fittingBreakdown.length} auto fittings</span>
                <span>{route.designFlowRateLps.toFixed(0)} L/s</span>
              </div>
              <span>
                Components {route.totalComponentPressureLossPa.toFixed(2)} Pa + fittings{" "}
                {route.totalFittingPressureLossPa.toFixed(2)} Pa
              </span>
              {summary.criticalPath?.terminalId !== route.terminalId ? (
                <span>
                  {(summary.criticalPath!.totalPressureLossPa - route.totalPressureLossPa).toFixed(2)}
                  {" "}
                  Pa below system critical
                </span>
              ) : (
                <span>Reference route for this system</span>
              )}
              <details className="technical-details">
                <summary>Technical path</summary>
                <p>{route.componentIds.join(" -> ")}</p>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <p className="sidebar-empty">{emptyMessage}</p>
      )}
    </details>
  );
}

interface BalancingSystemSectionProps {
  title: string;
  summary: RouteSystemSummary;
  emptyMessage: string;
}

function BalancingSystemSection({
  title,
  summary,
  emptyMessage
}: BalancingSystemSectionProps) {
  const entries = createTerminalBalancingEntries(summary);
  const referenceEntry = entries.find((entry) => entry.isReference) ?? null;
  const adjustableEntries = entries.filter((entry) => !entry.isReference);
  const requiresBalancing = adjustableEntries.some(
    (entry) => entry.additionalPressureLossPa > 0.001
  );

  return (
    <section className="balancing-system-section">
      <div className="route-system-header">
        <strong>{title}</strong>
        <span>{summary.routes.length} terminals</span>
      </div>

      {referenceEntry ? (
        <>
          <article
            className={
              requiresBalancing
                ? "balance-summary balance-summary-warning"
                : "balance-summary balance-summary-ok"
            }
          >
            <span>Hardest route</span>
            <strong>{referenceEntry.terminalLabel}</strong>
            <p>
              Hardest route total pressure loss:{" "}
              {referenceEntry.routePressureLossPa.toFixed(2)} Pa
            </p>
            <p>
              Terminal pressure loss:{" "}
              {referenceEntry.currentTerminalPressureLossPa.toFixed(2)} Pa
            </p>
          </article>

          {adjustableEntries.length > 0 ? (
            <div className="balance-terminal-list">
              {adjustableEntries.map((entry) => (
                <article key={entry.terminalId} className="balance-terminal-card">
                  <header>
                    <strong>{entry.terminalLabel}</strong>
                    <strong>{entry.neededTerminalPressureLossPa.toFixed(2)} Pa</strong>
                  </header>
                  <p>Needed terminal pressure loss</p>
                  <span>
                    Current route {entry.routePressureLossPa.toFixed(2)} Pa, add{" "}
                    {entry.additionalPressureLossPa.toFixed(2)} Pa at terminal
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="sidebar-empty">
              Only one connected terminal route - no balancing adjustment needed.
            </p>
          )}
        </>
      ) : (
        <p className="sidebar-empty">{emptyMessage}</p>
      )}
    </section>
  );
}

interface TerminalBalancingEntry {
  terminalId: string;
  terminalLabel: string;
  routePressureLossPa: number;
  currentTerminalPressureLossPa: number;
  neededTerminalPressureLossPa: number;
  additionalPressureLossPa: number;
  isReference: boolean;
}

function describeTerminalType(
  terminalType: RouteSystemSummary["terminalType"]
): string {
  switch (terminalType) {
    case "supply":
      return "Supply";
    case "exhaust":
      return "Extract air";
    case "outdoor":
      return "Outdoor air";
    case "exhaustAir":
      return "Exhaust";
  }
}

function formatPressure(value: number | null | undefined): string {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(2)} Pa`;
}

function formatTerminalLabel(
  routes: RouteAnalysisResult["routes"],
  terminalId: string
): string {
  return routes.find((route) => route.terminalId === terminalId)?.terminalLabel ?? terminalId;
}

function formatFanPressureFormula(
  firstRoute: RouteSystemSummary["criticalPath"],
  secondRoute: RouteSystemSummary["criticalPath"],
  firstLabel: string,
  secondLabel: string
): string {
  if (!firstRoute && !secondRoute) {
    return "Connected paths appear here when both sides are available.";
  }

  if (!firstRoute || !secondRoute) {
    const route = firstRoute ?? secondRoute;
    const label = firstRoute ? firstLabel : secondLabel;

    return `${label} ${formatPressure(route?.totalPressureLossPa)}`;
  }

  const sharedAhuPressureLossPa = findSharedAhuPressureLossPa(
    firstRoute,
    secondRoute
  );
  const firstSidePressureLossPa =
    firstRoute.totalPressureLossPa - sharedAhuPressureLossPa;
  const secondSidePressureLossPa =
    secondRoute.totalPressureLossPa - sharedAhuPressureLossPa;

  return `${firstLabel} ${formatPressure(firstSidePressureLossPa)} + AHU ${formatPressure(
    sharedAhuPressureLossPa
  )} + ${secondLabel} ${formatPressure(secondSidePressureLossPa)}`;
}

function findSharedAhuPressureLossPa(
  firstRoute: NonNullable<RouteSystemSummary["criticalPath"]>,
  secondRoute: NonNullable<RouteSystemSummary["criticalPath"]>
): number {
  const secondRouteComponentIds = new Set(secondRoute.componentIds);
  const sharedAhu = firstRoute.componentBreakdown.find(
    (item) =>
      item.componentType === "ahu" &&
      secondRouteComponentIds.has(item.componentId)
  );

  return sharedAhu?.pressureLossPa ?? 0;
}

function createTerminalBalancingEntries(
  summary: RouteSystemSummary
): TerminalBalancingEntry[] {
  const criticalPath = summary.criticalPath;

  if (!criticalPath) {
    return [];
  }

  return [...summary.routes]
    .map((route) => {
      const currentTerminalPressureLossPa = getRouteTerminalPressureLossPa(route);
      const additionalPressureLossPa = Number(
        Math.max(0, criticalPath.totalPressureLossPa - route.totalPressureLossPa).toFixed(2)
      );

      return {
        terminalId: route.terminalId,
        terminalLabel: route.terminalLabel,
        routePressureLossPa: route.totalPressureLossPa,
        currentTerminalPressureLossPa,
        neededTerminalPressureLossPa: Number(
          (currentTerminalPressureLossPa + additionalPressureLossPa).toFixed(2)
        ),
        additionalPressureLossPa,
        isReference: route.terminalId === criticalPath.terminalId
      };
    })
    .sort((left, right) => {
      if (left.isReference) {
        return -1;
      }

      if (right.isReference) {
        return 1;
      }

      return right.routePressureLossPa - left.routePressureLossPa;
    });
}

function getRouteTerminalPressureLossPa(
  route: RouteSystemSummary["routes"][number]
): number {
  const terminalComponent = route.componentBreakdown.find(
    (item) => item.componentType === "terminal"
  );

  return Number((terminalComponent?.pressureLossPa ?? 0).toFixed(2));
}
