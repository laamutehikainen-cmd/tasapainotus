# Tasapainotus Specification

## Product Summary

Tasapainotus is a browser-based HVAC duct design and analysis tool designed as a simple teaching-oriented "Magicad".

The product must help users:

* draw duct networks quickly
* understand airflow, pressure loss, critical paths, and balancing
* demonstrate HVAC behavior clearly to students

The product emphasizes:

* fast network editing
* transparent engineering calculations
* visual clarity
* teaching value over CAD complexity

## Current Product Scope

The current application supports:

* 2D duct network editing in the browser
* 10 cm snapping
* AHU and terminal placement
* standard round ducts
* route-based pressure-loss calculations
* critical-path identification
* balancing-oriented comparison
* read-only 3D visualization
* AHU-driven 3D airflow animation for teaching

## System Terminology

The product uses these system names consistently:

* Supply
* Extract air
* Outdoor air
* Exhaust

Meaning:

* Supply = air delivered into rooms
* Extract air = air removed from rooms
* Outdoor air = incoming fresh air path
* Exhaust = discharge air path to outside

## Next Version Goals

The next version must improve the product specifically for teaching use and faster editing workflows.

It should:

* reduce visual noise during teaching use
* explain incomplete or invalid networks more clearly
* make engineering results easier to present on a projector
* support clearer instructional visualization

## Required Next Version Features

### Editing Workflow

The next version must support:

* duct drawing that remains active until the user changes tool or cancels
* automatic connection when a duct is drawn into another duct
* automatic node creation at duct connection points
* automatic splitting of an existing duct into valid segments when a new branch connects

### Fittings And Local Losses

The next version must support:

* automatic detection of elbow-like geometry
* automatic detection of tee junctions from network topology
* automatic local loss handling for detected fittings
* user-editable local loss coefficients

Default fitting rules:

* elbow default zeta = 0.5
* tee default zeta = 0.5
* tee local loss after the branch must be calculated using the downstream branch flow

Local losses should be represented as fitting objects attached to nodes, not as raw node properties only.

### AHU Geometry

The next version must allow the user to define AHU dimensions:

* length
* width
* height

These dimensions should be visible in both data and visualization.

### System Logic

The product must maintain these rules:

* supply and extract air balancing are handled separately
* outdoor air and exhaust routes contribute to fan pressure
* outdoor air and exhaust routes are not branch-balanced
* outdoor air flow follows total supply demand
* exhaust flow follows total extract air demand

### Teaching Support

The next version should support:

* simplified teaching mode
* clearer route highlighting
* pressure-loss breakdown display
* airflow direction display
* optional animation-oriented visualization
* ready-made example systems for teaching

## Non-Goals

The product still does not target:

* IFC or BIM export
* full 3D editing
* manufacturer product databases
* advanced collision detection
* advanced rectangular duct workflows
* automatic optimization algorithms
* advanced multi-floor editing

## Engineering Rules

The application must continue to follow these rules:

* geometry represents a valid duct network graph
* components always connect through nodes
* calculations remain transparent and reproducible
* UI favors speed and clarity over detailed CAD-like modeling
* teaching clarity is prioritized over hidden automation
* automatically generated fittings must remain inspectable and editable

## Technical Direction

The product continues to use:

* React for UI
* TypeScript for source code
* Vite for development and build tooling
* Vitest for automated tests

## Development Boundaries

Development proceeds one phase at a time.

Before teaching animation or more advanced visualization expands further, the project must first stabilize:

* editing workflow
* fitting generation
* local loss calculations
