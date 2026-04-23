import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the phase 5 drawing workspace", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: /tasapainotus/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /draw duct/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /undo/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /redo/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /duct network editor canvas/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /system routes/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /parallel branches/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/supply flow/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /read-only model preview/i })
    ).toBeInTheDocument();
  });

  it("returns to the select tool when escape is pressed from duct or placement tools", () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: /editor tools/i });
    const selectButton = within(toolbar).getByText(/^select$/i).closest("button");
    const drawDuctButton = within(toolbar)
      .getByText(/^draw duct$/i)
      .closest("button");
    const supplyButton = within(toolbar).getByText(/^supply$/i).closest("button");

    expect(selectButton).not.toBeNull();
    expect(drawDuctButton).not.toBeNull();
    expect(supplyButton).not.toBeNull();

    fireEvent.click(drawDuctButton!);

    expect(drawDuctButton!).toHaveClass("is-active");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(selectButton!).toHaveClass("is-active");
    expect(drawDuctButton!).not.toHaveClass("is-active");

    fireEvent.click(supplyButton!);

    expect(supplyButton!).toHaveClass("is-active");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(selectButton!).toHaveClass("is-active");
    expect(supplyButton!).not.toHaveClass("is-active");
  });
});
