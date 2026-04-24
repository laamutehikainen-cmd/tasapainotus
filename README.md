# Tasapainotus

Tasapainotus is a browser-based HVAC duct design and analysis tool for fast duct network editing, pressure-loss calculations, critical-path detection, and balancing support.

## Current Status

The current application now includes:

* graph-based 2D duct editing with 10 cm snapping
* AHU and terminal placement with round standard ducts
* pressure-loss calculations, critical paths, and balancing summaries
* automatic fitting detection with editable zeta overrides
* synchronized read-only 3D visualization
* AHU-driven 3D airflow animation for teaching
* local workspace toolchain wrappers for Node/npm and Git

## Getting Started

1. Install project dependencies with `.\scripts\npm.cmd install`.
2. Start the development server with `.\scripts\dev.cmd`.
3. Run the test suite with `.\scripts\test.cmd`.
4. Run the type check with `.\scripts\check.cmd`.
5. Build the app with `.\scripts\build.cmd`.

## Local Toolchain

This workspace keeps its own Node.js, npm, and Git toolchain under `.tools/`.

Use these wrappers from PowerShell:

* `.\scripts\npm.cmd install`
* `.\scripts\dev.cmd`
* `.\scripts\test.cmd`
* `.\scripts\check.cmd`
* `.\scripts\build.cmd`
* `.\scripts\git.cmd ...`

The `.cmd` wrappers are used because PowerShell script execution can be disabled on Windows systems.

## Planned Work

The project will move forward one phase at a time, following:

* [Development Plan](./docs/development-plan.md)
* [Specification](./docs/spec.md)

## GitHub Pages Deployment

The repository now includes a GitHub Pages workflow in `.github/workflows/deploy-pages.yml`.

To publish:

1. Push the repository to GitHub on the `main` branch.
2. In GitHub repository settings, open `Settings > Pages`.
3. Set the build and deployment source to `GitHub Actions`.
4. Push new changes to `main` to trigger deployment.

After deployment, the site will be available at:

* `https://<your-github-user>.github.io/tasapainotus/`

The Vite build uses relative asset paths, so the static output also works if the repository name changes or the site is served from another static host.
