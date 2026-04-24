# HVAC Duct Design Tool - Development Plan

## 1. Purpose

The goal is to build a browser-based HVAC duct design and analysis tool that acts as a simple "Magicad for teaching".

The tool must help users:

* draw duct networks quickly
* understand airflow, pressure loss, critical paths, and balancing
* visualize what changes when duct sizes, branches, and resistances change
* demonstrate HVAC system behavior clearly to students

The focus is on:

* speed of use
* clarity of results
* engineering correctness
* teaching value over CAD complexity

---

## 2. Current Product Scope

### Implemented Foundation

The current foundation already includes:

* browser-based application
* 2D drawing with mouse
* 10 cm snapping
* read-only 3D visualization
* AHU placement
* terminal placement
* round standard duct sizes
* pressure loss calculation:
  * Darcy-Weisbach
  * Swamee-Jain friction factor
  * local losses using zeta-values
* route detection
* critical path identification
* balancing-oriented comparison
* duct size selection for new drafts
* terminal reference pressure losses
* AHU device pressure loss and stored fan running state
* 3D flow animation tied to AHU fan state
* GitHub Pages deployment

### Current System Terms

Use these names consistently in UI, code, and documentation:

* Supply
* Extract air
* Outdoor air
* Exhaust

Meaning:

* Supply = air delivered to rooms
* Extract air = air removed from rooms
* Outdoor air = incoming fresh air path
* Exhaust = discharge air path to outside

---

## 3. Next Development Version

The next version should improve the tool specifically for teaching and fast network editing.

### Main Goals

* make drawing feel faster and more natural
* make branch creation and network editing automatic where reasonable
* make local losses visible, explainable, and editable
* make AHU geometry more realistic
* improve terminology and system clarity
* add teaching-oriented visualization and optional animation

### Included In The Next Version

* joined supply-side critical route visualization
* joined extract-side critical route visualization
* clearer 2D and 3D critical-route highlighting
* optional teaching mode
* optional animated flow visualization
* better validation and user warnings

### Still Not In Scope

* IFC or BIM export
* manufacturer-specific product databases
* full 3D editing
* advanced collision detection
* full rectangular duct workflow
* advanced multi-floor editing
* automatic optimization algorithms

---

## 4. Core Design Principles

1. The system is not a generic drawing tool. It is a network editor.
2. All geometry must map to a valid duct network graph.
3. Components must always connect through nodes.
4. Calculation must remain transparent and reproducible.
5. UI must support fast workflow over precision modeling.
6. Teaching clarity is more important than CAD completeness.
7. Automatically generated fittings must still remain inspectable and editable by the user.

---

## 5. System Architecture

### 5.1 Core Layers

* Data Model
* Calculation Engine
* Geometry And Drawing
* UI
* Visualization
* Teaching Layer

### 5.2 Modeling Strategy For Fittings And Local Losses

Local losses should not live directly on a bare node.

Recommended approach:

* Node remains a graph connection point
* Elbow and tee losses are represented as fitting objects attached to a node
* Fittings may be auto-generated from geometry and topology
* Users may override the default zeta-value

This keeps:

* the graph model clean
* the calculations explainable
* the UI editable for teaching use

### 5.3 Modeling Strategy For Terminal And AHU Pressure Losses

Terminal and AHU pressure losses are component-level losses, not fittings:

* terminal pressure loss lives on the terminal component as `metadata.referencePressureLossPa`
* the terminal source is stored as `metadata.referencePressureLossSource`
* AHU device pressure loss lives on the AHU component as `metadata.devicePressureLossPa`
* editor-level defaults per terminal type live in `EditorDocument.settings`
* these component losses feed route totals through `networkPerformance.ts`

### 5.4 Suggested Folder Growth

```text
src/
  core/
    graph.ts
    nodes.ts
    edges.ts
    snapping.ts
    geometry.ts
    fittingDetection.ts
  components/
    ahu.ts
    duct.ts
    elbow.ts
    tee.ts
    terminal.ts
    reducer.ts
  calc/
    reynolds.ts
    swameeJain.ts
    darcyWeisbach.ts
    localLoss.ts
    routes.ts
    balancing.ts
    fittings.ts
  data/
    ductSizes.ts
    defaultTerminalPressureLosses.ts
    fittings.ts
  ui/
    canvas2d.tsx
    controls.tsx
    sidebar.tsx
    properties.tsx
    teachingMode.tsx
  view3d/
    scene.ts
    renderer.ts
    camera.ts
    animation.ts
```

---

## 6. Data Definitions

Each physical component must include:

* id
* type
* connected nodes
* geometry data
* flow data
* pressure loss data
* metadata

Each auto-generated fitting should include:

* id
* type
* node id
* connected segment ids
* zeta
* isAutoGenerated
* manualOverride
* flowBasis
* pressureLoss

Each AHU should include editable geometry:

* length
* width
* height

Terminal metadata includes:

* referencePressureLossPa
* referencePressureLossSource

AHU metadata includes:

* devicePressureLossPa
* fanRunning

Editor settings include:

* activeDuctDiameterMm
* defaultTerminalReferencePressureLossPa per terminal type

---

## 7. Engineering Rules

### Core Formulas

#### Reynolds Number

Re = (rho * v * D) / mu

#### Swamee-Jain

f = 0.25 / [log10((epsilon / 3.7D) + (5.74 / Re^0.9))]^2

#### Darcy-Weisbach

delta_p = f * (L / D) * (rho * v^2 / 2)

#### Local Loss

delta_p = zeta * (rho * v^2 / 2)

### Default Local Loss Rules For The Next Version

* elbow default zeta = 0.5
* tee default zeta = 0.5
* tee downstream local loss is calculated from the downstream branch flow after the tee
* the user must be able to override default zeta-values

### System Logic Rules

* Outdoor air flow follows the total required supply flow
* Exhaust flow follows the total required extract air flow
* Outdoor air and exhaust routes are included in fan pressure requirements
* Outdoor air and exhaust routes are not part of branch balancing
* Supply and extract air balancing are handled separately
* AHU device pressure loss contributes to every route through the AHU
* Terminal reference pressure loss contributes to the route ending at that terminal
* Supply fan pressure is the outdoor critical path plus the supply critical path
* Extract fan pressure is the extract critical path plus the exhaust critical path

---

## 8. Development Phases Already Completed

### Phase 1 - Project Setup

Completed foundation for React, TypeScript, Vite, tests, and documentation.

### Phase 2 - Core Data Model

Completed graph-based duct network model with nodes, components, and connectivity.

### Phase 3 - Calculation Engine

Completed core engineering calculations for friction, Reynolds number, and pressure loss.

### Phase 4 - Route Analysis

Completed route traversal, route breakdown, and critical path identification.

### Phase 5 - 2D Drawing System

Completed snap-based network editing foundation.

### Phase 6 - 3D Visualization

Completed read-only synchronized 3D view.

### Phase 7 - Balancing Support

Completed basic balancing-oriented comparison and fan pressure presentation.

### Phase 8 - Editing Workflow Improvements

Completed continuous duct drawing, automatic duct-to-duct junction creation, duct splitting, and undo/redo.

### Phase 9 - Automatic Fittings And Local Losses

Completed automatic elbow/tee detection, route fitting pressure losses, 2D fitting highlights, and editable zeta overrides.

### Phase 10 - AHU Geometry And System Semantics

Completed editable AHU dimensions, fixed AHU port semantics, system-colored ducts, and consistent Supply / Extract air / Outdoor air / Exhaust naming.

### Phase 11 - Duct Size At Draft + Component Pressure Losses

Completed active duct-size selection, terminal reference pressure losses, AHU device pressure loss, and stored fanRunning state.

### Phase 12 - Joined Critical Route Visualization

Completed joined supply-side and extract-side critical routes with sidebar totals plus 2D and 3D highlights.

### Phase 13 - Flow Animation

Completed AHU-driven 3D airflow particles, terminal throw/intake visualization, and reduced-motion handling.

---

## 9. Next Development Phases

### Phase 14 - Teaching Mode And Validation

Goal:
Give the teacher and students a cleaner teaching-focused view plus clearer warnings when the network is incomplete or contradictory.

Tasks:

* add an optional teaching mode that hides low-value technical detail by default
* add clearer warnings for disconnected terminals, missing AHU connections, and ambiguous mixed-system ducts
* add example-focused helper copy for fan pressure, critical paths, and balancing results
* make route and balancing panels easier to scan during projector use

Acceptance Criteria:

* teaching mode can declutter the workspace without changing the engineering model
* incomplete networks surface clear user-facing warnings
* projector use is improved through clearer hierarchy and less visual noise

---

## 10. Development Rules

Codex / developer must follow:

* implement one phase at a time
* do not modify unrelated files
* always read:
  * docs/spec.md
  * docs/development-plan.md
* keep calculation, geometry, UI, and visualization separated
* always include unit tests for engineering calculations
* include regression tests for editing behavior
* keep code simple and readable
* avoid over-engineering
* prefer understandable teaching behavior over hidden automation

---

## 11. Current Recommended Implementation Order

Proceed in this order:

1. Phase 14 - Teaching Mode And Validation

Do not start this phase before:

* joined critical route visualization is stable
* 3D flow animation is stable
* sidebar hierarchy changes are in place

---

## 12. Future Extensions

Possible later extensions:

* rectangular ducts
* manufacturer libraries
* automatic balancing suggestions with dampers
* export to CSV or PDF
* IFC or BIM integration
* multi-floor support
* classroom exercise mode with guided tasks

---

END OF DOCUMENT
