import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  analyzeDuctRoutes,
  createAutomaticFittingOverrideKey,
  getComponentPerformanceResult,
  type AutomaticFittingResult,
  type ComponentPerformanceResult,
  type RouteAnalysisResult
} from "./calc";
import { type NetworkComponent } from "./components";
import { type DuctNode } from "./core/nodes";
import { normalizeRoundDuctDiameterMm } from "./data/ductSizes";
import { Canvas2D } from "./ui/canvas2d";
import { Controls } from "./ui/controls";
import {
  beginDuctDraft,
  buildGraphFromEditorDocument,
  completeDuctDraft,
  createInitialEditorDocument,
  deleteSelection,
  findComponentById,
  findNodeById,
  placeComponentAtPoint,
  removeAutomaticFittingOverrideFromDocument,
  type DuctDraft,
  type EditorDocument,
  type EditorSelection,
  type ToolMode,
  upsertAutomaticFittingOverrideInDocument,
  updateComponentInDocument,
  updateNodeInDocument
} from "./ui/editorState";
import {
  createEditorHistoryState,
  recordEditorHistory,
  redoEditorHistory,
  undoEditorHistory
} from "./ui/editorHistory";
import { Sidebar } from "./ui/sidebar";
import { View3D } from "./view3d/View3D";

function App() {
  const [history, setHistory] = useState(createEditorHistoryState);
  const [document, setDocument] = useState<EditorDocument>(
    createInitialEditorDocument()
  );
  const [activeTool, setActiveTool] = useState<ToolMode>("select");
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [ductDraft, setDuctDraft] = useState<DuctDraft | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const [notice, setNotice] = useState(
    "Place an AHU, add terminals, and draw ducts between snapped points."
  );
  const deferredDocument = useDeferredValue(document);

  let routeAnalysis: RouteAnalysisResult | null = null;
  let analysisError: string | null = null;

  try {
    const graph = buildGraphFromEditorDocument(deferredDocument);

    if (graph.getAhu() && graph.getTerminals().length > 0) {
      routeAnalysis = analyzeDuctRoutes(graph, {
        automaticFittingOverrides: deferredDocument.automaticFittingOverrides
      });
    }
  } catch (error) {
    analysisError =
      error instanceof Error ? error.message : "Analysis is unavailable.";
  }

  const selectedNode =
    selection?.kind === "node" ? findNodeById(document, selection.id) : null;
  const selectedComponent =
    selection?.kind === "component"
      ? findComponentById(document, selection.id)
      : null;
  const selectedNodeFittings =
    selectedNode && routeAnalysis
      ? routeAnalysis.automaticFittings.filter(
          (fitting) => fitting.nodeId === selectedNode.id
        )
      : [];
  let selectedComponentResult: ComponentPerformanceResult | null = null;

  if (selectedComponent && routeAnalysis) {
    try {
      selectedComponentResult = getComponentPerformanceResult(
        routeAnalysis.networkPerformance,
        selectedComponent.id
      );
    } catch {
      selectedComponentResult = null;
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableEventTarget(event.target)) {
        return;
      }

      const modifierPressed = event.metaKey || event.ctrlKey;

      if (modifierPressed && event.key.toLowerCase() === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }

        return;
      }

      if (modifierPressed && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();

        return;
      }

      if (event.key === "Escape") {
        if (activeTool !== "select" || ductDraft !== null) {
          event.preventDefault();
          activateSelectTool("Select tool active.");
        }

        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      if (!selection) {
        return;
      }

      event.preventDefault();
      handleDeleteSelection();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, history, document, activeTool, ductDraft]);

  function applyDocumentState(
    nextDocument: EditorDocument,
    nextSelection: EditorSelection = selection,
    nextDraft: DuctDraft | null = ductDraft,
    trackHistory = true
  ): void {
    const currentSnapshot = {
      document,
      selection
    };

    startTransition(() => {
      if (trackHistory) {
        setHistory((currentHistory) =>
          recordEditorHistory(currentHistory, currentSnapshot)
        );
      }

      setDocument(nextDocument);
      setSelection(nextSelection);
      setDuctDraft(nextDraft);
    });
  }

  function handleToolChange(tool: ToolMode): void {
    if (tool === "select") {
      activateSelectTool("Selection updates the properties panel and analysis sidebar.");

      return;
    }

    setActiveTool(tool);
    setDuctDraft(null);
    setNotice(
      tool === "duct"
        ? "Click one snapped point to start a duct, then click another to finish it. The duct tool stays active for the next segment."
        : "Placement tool active. Press Esc to return to Select."
    );
  }

  function handleCanvasPoint(point: { x: number; y: number; z: number }): void {
    try {
      if (activeTool === "select") {
        setSelection(null);
        setNotice("Selection cleared.");

        return;
      }

      if (activeTool === "duct") {
        if (!ductDraft) {
          setDuctDraft(beginDuctDraft(document, point));
          setSelection(null);
          setNotice("Duct start point locked. Pick the end point.");

          return;
        }

        const result = completeDuctDraft(document, ductDraft, point);
        const nextDraft = beginDuctDraft(result.document, point);

        applyDocumentState(result.document, result.selection, nextDraft);
        setNotice(
          "Duct created. Continue from the latest endpoint or cancel duct to start elsewhere."
        );

        return;
      }

      const result = placeComponentAtPoint(document, activeTool, point);

      applyDocumentState(result.document, result.selection, null);
      setNotice("Component placed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Edit failed.");
    }
  }

  function handleDeleteSelection(): void {
    if (!selection) {
      return;
    }

    const nextDocument = deleteSelection(document, selection);

    applyDocumentState(nextDocument, null, null);
    setNotice("Selection deleted.");
  }

  function handleCancelDuctDraft(): void {
    setDuctDraft(null);
    setNotice("Duct draft cancelled.");
  }

  function activateSelectTool(nextNotice: string): void {
    setActiveTool("select");
    setDuctDraft(null);
    setNotice(nextNotice);
  }

  function handleUndo(): void {
    const result = undoEditorHistory(history, {
      document,
      selection
    });

    if (!result) {
      return;
    }

    startTransition(() => {
      setHistory(result.history);
      setDocument(result.snapshot.document);
      setSelection(result.snapshot.selection);
      setDuctDraft(null);
    });
    setNotice("Undo applied.");
  }

  function handleRedo(): void {
    const result = redoEditorHistory(history, {
      document,
      selection
    });

    if (!result) {
      return;
    }

    startTransition(() => {
      setHistory(result.history);
      setDocument(result.snapshot.document);
      setSelection(result.snapshot.selection);
      setDuctDraft(null);
    });
    setNotice("Redo applied.");
  }

  function handleNodeLabelChange(value: string): void {
    if (!selectedNode) {
      return;
    }

    applyDocumentState(
      updateNodeInDocument(document, selectedNode.id, (node) => ({
        ...node,
        metadata: {
          ...node.metadata,
          label: value
        }
      }))
    );
  }

  function handleComponentLabelChange(value: string): void {
    if (!selectedComponent) {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) => {
        switch (component.type) {
          case "ahu":
            return {
              ...component,
              metadata: {
                ...component.metadata,
                label: value
              }
            };
          case "terminal":
            return {
              ...component,
              metadata: {
                ...component.metadata,
                label: value
              }
            };
          case "ductSegment":
            return {
              ...component,
              metadata: {
                ...component.metadata,
                label: value
              }
            };
        }
      })
    );
  }

  function handleAhuSystemTypeChange(
    value: "supply" | "exhaust" | "mixed"
  ): void {
    if (selectedComponent?.type !== "ahu") {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) =>
        component.type === "ahu"
          ? {
              ...component,
              metadata: {
                ...component.metadata,
                systemType: value
              }
            }
          : component
      )
    );
  }

  function handleTerminalFlowRateChange(value: number): void {
    if (selectedComponent?.type !== "terminal" || !Number.isFinite(value) || value <= 0) {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) =>
        component.type === "terminal"
          ? {
              ...component,
              flow: {
                designFlowRateLps: value,
                actualFlowRateLps: value
              }
            }
          : component
      )
    );
  }

  function handleTerminalTypeChange(
    value: "supply" | "exhaust" | "outdoor" | "exhaustAir"
  ): void {
    if (selectedComponent?.type !== "terminal") {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) =>
        component.type === "terminal"
          ? {
              ...component,
              metadata: {
                ...component.metadata,
                terminalType: value
              }
            }
          : component
      )
    );
  }

  function handleDuctDiameterChange(value: number): void {
    if (
      selectedComponent?.type !== "ductSegment" ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) =>
        component.type === "ductSegment"
          ? {
              ...component,
              geometry: {
                ...component.geometry,
                diameterMm: normalizeRoundDuctDiameterMm(value)
              }
            }
          : component
      )
    );
  }

  function handleDuctLocalLossChange(value: number): void {
    if (
      selectedComponent?.type !== "ductSegment" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return;
    }

    applyDocumentState(
      updateComponentInDocument(document, selectedComponent.id, (component) =>
        component.type === "ductSegment"
          ? {
              ...component,
              metadata: {
                ...component.metadata,
                localLossCoefficient: value
              }
            }
          : component
      )
    );
  }

  function handleAutomaticFittingLossChange(
    fitting: AutomaticFittingResult,
    value: number
  ): void {
    if (!Number.isFinite(value) || value < 0) {
      return;
    }

    applyDocumentState(
      upsertAutomaticFittingOverrideInDocument(document, {
        key: createAutomaticFittingOverrideKey(
          fitting.nodeId,
          fitting.fittingType,
          fitting.downstreamComponentId
        ),
        nodeId: fitting.nodeId,
        fittingType: fitting.fittingType,
        downstreamComponentId: fitting.downstreamComponentId,
        lossCoefficient: value
      })
    );
  }

  function handleAutomaticFittingReset(fitting: AutomaticFittingResult): void {
    applyDocumentState(
      removeAutomaticFittingOverrideFromDocument(
        document,
        createAutomaticFittingOverrideKey(
          fitting.nodeId,
          fitting.fittingType,
          fitting.downstreamComponentId
        )
      )
    );
  }

  const ductCount = document.components.filter(
    (component) => component.type === "ductSegment"
  ).length;
  const terminalCount = document.components.filter(
    (component) => component.type === "terminal"
  ).length;

  return (
    <main className="app-shell">
      <section className="hero hero-editor">
        <div>
          <p className="eyebrow">HVAC duct design tool</p>
          <h1>Tasapainotus</h1>
          <p className="lede">
            Draw a snapped duct network, inspect the live graph-backed model,
            and surface the critical path while you build.
          </p>
        </div>
        <article className="notice-card" aria-live="polite">
          <p className="section-kicker">Editor status</p>
          <strong>{notice}</strong>
          <span>
            Geometry snaps to 10 cm and every edit is translated back into the
            engineering graph.
          </span>
        </article>
      </section>

      <Controls
        activeTool={activeTool}
        hasSelection={selection !== null}
        ductDraftActive={ductDraft !== null}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onSelectTool={handleToolChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDeleteSelection={handleDeleteSelection}
        onCancelDuctDraft={handleCancelDuctDraft}
      />

      <section className="workspace">
        <div className="workspace-main">
          <Canvas2D
            document={document}
            automaticFittings={routeAnalysis?.automaticFittings ?? []}
            activeTool={activeTool}
            selection={selection}
            ductDraft={ductDraft}
            hoverPoint={hoverPoint}
            onHoverPointChange={setHoverPoint}
            onCanvasPoint={handleCanvasPoint}
            onSelectionChange={setSelection}
          />
          <View3D
            document={deferredDocument}
            criticalPath={routeAnalysis?.criticalPath ?? null}
          />
        </div>

        <Sidebar
          documentCounts={{
            nodes: document.nodes.length,
            ducts: ductCount,
            terminals: terminalCount
          }}
          analysis={routeAnalysis}
          analysisError={analysisError}
        selectedNode={selectedNode}
        selectedNodeFittings={selectedNodeFittings}
        selectedComponent={selectedComponent}
        onNodeLabelChange={handleNodeLabelChange}
        onComponentLabelChange={handleComponentLabelChange}
          onAhuSystemTypeChange={handleAhuSystemTypeChange}
          onTerminalFlowRateChange={handleTerminalFlowRateChange}
        onTerminalTypeChange={handleTerminalTypeChange}
        selectedComponentResult={selectedComponentResult}
        onDuctDiameterChange={handleDuctDiameterChange}
        onDuctLocalLossChange={handleDuctLocalLossChange}
        onAutomaticFittingLossChange={handleAutomaticFittingLossChange}
        onAutomaticFittingReset={handleAutomaticFittingReset}
      />
      </section>

      <section className="workflow-strip" aria-label="Workflow guidance">
        <article>
          <p className="section-kicker">Quick start</p>
          <strong>1. Place an AHU</strong>
          <span>Use the toolbar and click a snapped point on the canvas.</span>
        </article>
        <article>
          <p className="section-kicker">Build branches</p>
          <strong>2. Place terminals and draw ducts</strong>
          <span>Ducts auto-create nodes and reuse existing snapped nodes.</span>
        </article>
        <article>
          <p className="section-kicker">Inspect results</p>
          <strong>3. Track the critical path</strong>
          <span>The sidebar updates route pressure loss as the network changes.</span>
        </article>
      </section>
    </main>
  );
}

export default App;

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
